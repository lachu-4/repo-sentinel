import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  repoUrl: z.string().min(3).max(300),
});

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecretFinding {
  type: string;
  severity: Severity;
  file: string;
  line: number;
  preview: string;
}

export interface DependencyRisk {
  name: string;
  version: string;
  ecosystem: string;
  reason: string;
  severity: Severity;
}

export interface QualityIssue {
  type: string;
  severity: Severity;
  detail: string;
}

export interface AnalysisResult {
  repo: {
    fullName: string;
    description: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    language: string | null;
    license: string | null;
    defaultBranch: string;
    pushedAt: string;
    htmlUrl: string;
    ownerAvatar: string;
  };
  activity: {
    totalCommits: number;
    contributors: number;
    recentCommits: { sha: string; message: string; author: string; date: string }[];
    commitsByWeek: { week: string; commits: number }[];
  };
  score: {
    total: number;
    security: number;
    secrets: number;
    dependencies: number;
    quality: number;
    activity: number;
  };
  secrets: SecretFinding[];
  dependencies: DependencyRisk[];
  quality: QualityIssue[];
  ai: {
    summary: string;
    suggestions: { title: string; detail: string; severity: Severity }[];
  };
  scannedFiles: number;
}

// ---------- helpers ----------

function parseRepo(url: string): { owner: string; repo: string } {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (m) return { owner: m[1], repo: m[2] };
  const slash = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slash) return { owner: slash[1], repo: slash[2] };
  throw new Error("Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo");
}

async function gh(path: string, token: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "RepoGuard",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function ghRaw(path: string, token: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw",
      "User-Agent": "RepoGuard",
    },
  });
}

// Secret patterns (regex-based scanning).
const SECRET_PATTERNS: { type: string; severity: Severity; re: RegExp }[] = [
  { type: "AWS Access Key ID", severity: "critical", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: "AWS Secret Access Key", severity: "critical", re: /aws(.{0,20})?(secret|access)?(.{0,20})?['"][0-9a-zA-Z/+]{40}['"]/i },
  { type: "GitHub Personal Access Token", severity: "critical", re: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { type: "GitHub Fine-grained PAT", severity: "critical", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { type: "GitHub OAuth Token", severity: "critical", re: /\bgho_[A-Za-z0-9]{36,}\b/ },
  { type: "Slack Token", severity: "high", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { type: "Stripe Secret Key", severity: "critical", re: /\bsk_(live|test)_[0-9a-zA-Z]{24,}\b/ },
  { type: "Google API Key", severity: "high", re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { type: "OpenAI API Key", severity: "critical", re: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/ },
  { type: "Generic OpenAI-style sk- key", severity: "high", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { type: "Private RSA Key", severity: "critical", re: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { type: "JWT", severity: "medium", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { type: "Generic password assignment", severity: "medium", re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i },
  { type: "Generic API key assignment", severity: "medium", re: /(api[_-]?key|secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i },
];

// Files that are likely to contain real secrets / config.
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|java|kt|php|rs|cs|swift|m|c|cpp|h|sh|yml|yaml|toml|json|env|cfg|ini|properties|xml|gradle)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|out|\.next|\.git|vendor|coverage|__pycache__|target|\.cache)(\/|$)/i;
const MAX_FILES_TO_SCAN = 50;
const MAX_FILE_BYTES = 200_000;
const FETCH_CONCURRENCY = 12;

async function fetchRawFile(owner: string, repo: string, branch: string, path: string, token: string): Promise<string | null> {
  // Try the unauthenticated CDN first (fast, no API quota), fall back to the API.
  const cdn = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`).catch(() => null);
  if (cdn && cdn.ok) return cdn.text();
  const r = await ghRaw(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${branch}`, token).catch(() => null);
  if (!r || !r.ok) return null;
  return r.text();
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function severityWeight(s: Severity): number {
  return { critical: 25, high: 12, medium: 5, low: 2, info: 0 }[s];
}

// Known vulnerable / deprecated packages (small heuristic list).
const KNOWN_BAD: Record<string, { reason: string; severity: Severity }> = {
  "request": { reason: "Deprecated package, no longer maintained", severity: "medium" },
  "lodash": { reason: "Older versions vulnerable to prototype pollution; ensure >=4.17.21", severity: "low" },
  "moment": { reason: "Legacy library; consider date-fns or Luxon", severity: "low" },
  "node-uuid": { reason: "Deprecated; use uuid", severity: "medium" },
  "left-pad": { reason: "Deprecated trivial dependency", severity: "low" },
  "event-stream": { reason: "Historic supply-chain compromise (v3.3.6)", severity: "high" },
  "minimist": { reason: "Versions <1.2.6 vulnerable to prototype pollution", severity: "medium" },
  "axios": { reason: "Versions <1.6.0 had SSRF/CSRF issues; pin to latest", severity: "low" },
  "jsonwebtoken": { reason: "Versions <9 had verification bypass; pin to >=9", severity: "medium" },
};

function scanContentForSecrets(path: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 1000) continue;
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(line)) {
        findings.push({
          type: p.type,
          severity: p.severity,
          file: path,
          line: i + 1,
          preview: line.trim().slice(0, 140),
        });
        break;
      }
    }
  }
  return findings;
}

function analyzePackageJson(content: string): { deps: DependencyRisk[]; quality: QualityIssue[] } {
  const deps: DependencyRisk[] = [];
  const quality: QualityIssue[] = [];
  try {
    const pkg = JSON.parse(content);
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [name, ver] of Object.entries<string>(all)) {
      const bad = KNOWN_BAD[name];
      if (bad) deps.push({ name, version: ver, ecosystem: "npm", reason: bad.reason, severity: bad.severity });
    }
    if (!pkg.scripts || !pkg.scripts.test) {
      quality.push({ type: "Missing tests", severity: "medium", detail: "No `test` script defined in package.json" });
    }
    if (!pkg.license) {
      quality.push({ type: "No license", severity: "low", detail: "package.json has no `license` field" });
    }
  } catch {
    quality.push({ type: "Invalid package.json", severity: "low", detail: "Could not parse package.json" });
  }
  return { deps, quality };
}

function analyzeRequirementsTxt(content: string): DependencyRisk[] {
  const deps: DependencyRisk[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_.\-]+)\s*([=<>!~]=?\s*[\w.\-]+)?/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const known: Record<string, { reason: string; severity: Severity }> = {
      django: { reason: "Old Django releases have known CVEs; pin to LTS", severity: "low" },
      flask: { reason: "Versions <2.3 had session/cookie issues", severity: "low" },
      pyyaml: { reason: "yaml.load() unsafe in <5.1; use safe_load", severity: "medium" },
      requests: { reason: "Versions <2.31 had auth header leak", severity: "low" },
    };
    if (known[name]) deps.push({ name, version: m[2]?.trim() || "*", ecosystem: "pypi", reason: known[name].reason, severity: known[name].severity });
  }
  return deps;
}

async function callLovableAI(prompt: string, system: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit reached, please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
    throw new Error(`AI gateway error ${res.status}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

// ---------- main server function ----------

export const analyzeRepo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN secret not configured");

    const { owner, repo } = parseRepo(data.repoUrl);

    // 1. Repo metadata (need this first for default branch)
    const meta = await gh(`/repos/${owner}/${repo}`, token);
    const defaultBranch = meta.default_branch || "main";

    // 2. Run tree + activity calls in parallel
    const [tree, commitsList, contributorsList] = await Promise.all([
      gh(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token).catch(() => ({ tree: [] })),
      gh(`/repos/${owner}/${repo}/commits?per_page=30`, token).catch(() => []),
      gh(`/repos/${owner}/${repo}/contributors?per_page=100&anon=1`, token).catch(() => []),
    ]);

    const files: { path: string; size: number }[] = (tree.tree || [])
      .filter((n: any) => n.type === "blob")
      .map((n: any) => ({ path: n.path, size: n.size || 0 }));

    // 3. Pick files to scan
    const scanCandidates = files
      .filter((f) => !SKIP_PATH.test(f.path))
      .filter((f) => CODE_EXT.test(f.path) || /\.env(\.|$)/i.test(f.path))
      .filter((f) => f.size > 0 && f.size < MAX_FILE_BYTES)
      .sort((a, b) => {
        const score = (p: string) =>
          (/\.env/i.test(p) ? 0 : 1) +
          (/(config|secret|credential|key)/i.test(p) ? 0 : 1) +
          (/(test|spec|mock|fixture)/i.test(p) ? 1 : 0);
        return score(a.path) - score(b.path);
      })
      .slice(0, MAX_FILES_TO_SCAN);

    // 4. Fetch & scan with bounded concurrency
    const secretFindings: SecretFinding[] = [];
    const depRisks: DependencyRisk[] = [];
    const qualityIssues: QualityIssue[] = [];
    let scanned = 0;

    await pool(scanCandidates, FETCH_CONCURRENCY, async (f) => {
      const content = await fetchRawFile(owner, repo, defaultBranch, f.path, token);
      if (content == null) return;
      scanned++;
      secretFindings.push(...scanContentForSecrets(f.path, content));
      if (/(^|\/)package\.json$/.test(f.path)) {
        const r2 = analyzePackageJson(content);
        depRisks.push(...r2.deps);
        qualityIssues.push(...r2.quality);
      }
      if (/(^|\/)requirements\.txt$/.test(f.path)) {
        depRisks.push(...analyzeRequirementsTxt(content));
      }
      const todoCount = (content.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
      if (todoCount > 8) {
        qualityIssues.push({ type: "High TODO/FIXME density", severity: "low", detail: `${todoCount} markers in ${f.path}` });
      }
      if (content.length > 80_000) {
        qualityIssues.push({ type: "Very large file", severity: "low", detail: `${f.path} is ${(content.length / 1024).toFixed(0)} KB — consider splitting` });
      }
    });

    // Dedupe secrets
    const seen = new Set<string>();
    const uniqueSecrets = secretFindings.filter((s) => {
      const k = `${s.file}:${s.line}:${s.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Repo-level quality checks
    const hasReadme = files.some((f) => /^readme(\.|$)/i.test(f.path));
    const hasLicense = files.some((f) => /^license(\.|$)/i.test(f.path));
    const hasCI = files.some((f) => /^\.github\/workflows\//i.test(f.path) || /^\.gitlab-ci\.yml$/i.test(f.path) || /^\.circleci\//i.test(f.path));
    const hasTests = files.some((f) => /(^|\/)(__tests__|tests?|spec)\//i.test(f.path) || /\.(test|spec)\.[jt]sx?$/.test(f.path));
    if (!hasReadme) qualityIssues.push({ type: "Missing README", severity: "medium", detail: "No README file found at repo root" });
    if (!hasLicense) qualityIssues.push({ type: "Missing LICENSE", severity: "low", detail: "No LICENSE file found" });
    if (!hasCI) qualityIssues.push({ type: "No CI configuration", severity: "low", detail: "No GitHub Actions / GitLab CI / CircleCI workflows detected" });
    if (!hasTests) qualityIssues.push({ type: "No test files detected", severity: "medium", detail: "No test/spec files found in repo" });

    // 5. Activity post-processing
    const recentCommits = (commitsList as any[]).slice(0, 8).map((c) => ({
      sha: c.sha?.slice(0, 7) ?? "",
      message: (c.commit?.message ?? "").split("\n")[0].slice(0, 100),
      author: c.commit?.author?.name ?? "unknown",
      date: c.commit?.author?.date ?? "",
    }));
    const weekMap = new Map<string, number>();
    for (const c of commitsList as any[]) {
      const d = new Date(c.commit?.author?.date ?? Date.now());
      const w = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + ((d.getDay() + 6) % 7)) / 7)).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      weekMap.set(w, (weekMap.get(w) ?? 0) + 1);
    }
    const commitsByWeek = Array.from(weekMap.entries())
      .map(([week, commits]) => ({ week: week.slice(5), commits }))
      .reverse()
      .slice(0, 12);

    // 6. Scoring
    const secretsPenalty = uniqueSecrets.reduce((a, s) => a + severityWeight(s.severity), 0);
    const depsPenalty = depRisks.reduce((a, d) => a + severityWeight(d.severity), 0);
    const qualityPenalty = qualityIssues.reduce((a, q) => a + severityWeight(q.severity), 0);

    const secretsScore = Math.max(0, 100 - secretsPenalty);
    const depsScore = Math.max(0, 100 - depsPenalty);
    const qualityScore = Math.max(0, 100 - qualityPenalty);

    const daysSincePush = Math.max(0, (Date.now() - new Date(meta.pushed_at).getTime()) / 86400000);
    const activityScore = Math.max(0, Math.round(100 - Math.min(80, daysSincePush / 4) - Math.max(0, 20 - (contributorsList as any[]).length)));

    const security = Math.round(secretsScore * 0.6 + depsScore * 0.4);
    const total = Math.round(security * 0.45 + qualityScore * 0.3 + activityScore * 0.25);

    // 7. AI summary + suggestions
    let aiSummary = "";
    let aiSuggestions: { title: string; detail: string; severity: Severity }[] = [];
    try {
      const ctx = {
        repo: meta.full_name,
        description: meta.description,
        language: meta.language,
        stars: meta.stargazers_count,
        topFiles: scanCandidates.slice(0, 25).map((f) => f.path),
        secretsFound: uniqueSecrets.length,
        depRisks: depRisks.slice(0, 10),
        qualityIssues: qualityIssues.slice(0, 10),
        score: total,
      };
      const [summaryRes, sugRaw] = await Promise.all([
        callLovableAI(
          `Analyze this GitHub repo and write a 2-3 sentence plain-English summary of what it does, based on the metadata and file paths:\n${JSON.stringify(ctx, null, 2)}`,
          "You are a senior engineer summarizing repositories. Be concise, factual, and avoid speculation."
        ),
        callLovableAI(
          `Given this analysis, propose 4 concrete improvement suggestions focused on security and code structure. Reply ONLY with a JSON array, each item: {"title":"...","detail":"...","severity":"critical|high|medium|low"}. Analysis:\n${JSON.stringify(ctx, null, 2)}`,
          "You are a security-focused code reviewer. Output strict JSON only, no prose, no markdown fences."
        ),
      ]);
      aiSummary = summaryRes;
      const cleaned = sugRaw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) aiSuggestions = parsed.slice(0, 6);
    } catch (e) {
      console.error("AI step failed:", e);
      aiSummary = aiSummary || `${meta.full_name}: ${meta.description ?? "No description provided."}`;
    }

    return {
      repo: {
        fullName: meta.full_name,
        description: meta.description,
        stars: meta.stargazers_count,
        forks: meta.forks_count,
        openIssues: meta.open_issues_count,
        language: meta.language,
        license: meta.license?.spdx_id ?? null,
        defaultBranch,
        pushedAt: meta.pushed_at,
        htmlUrl: meta.html_url,
        ownerAvatar: meta.owner?.avatar_url ?? "",
      },
      activity: {
        totalCommits: (commitsList as any[]).length,
        contributors: (contributorsList as any[]).length,
        recentCommits,
        commitsByWeek,
      },
      score: {
        total,
        security,
        secrets: secretsScore,
        dependencies: depsScore,
        quality: qualityScore,
        activity: activityScore,
      },
      secrets: uniqueSecrets.slice(0, 100),
      dependencies: depRisks.slice(0, 50),
      quality: qualityIssues.slice(0, 50),
      ai: { summary: aiSummary, suggestions: aiSuggestions },
      scannedFiles: scanned,
    };
  });
