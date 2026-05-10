import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { z } from "zod";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import {
  Star,
  GitFork,
  AlertCircle,
  Calendar,
  Users,
  GitCommit,
  KeyRound,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Loader2,
  ExternalLink,
  CircleAlert,
  Download,
} from "lucide-react";
import { Logo } from "@/components/repoguard/Logo";
import { SearchBar } from "@/components/repoguard/SearchBar";
import { analyzeRepo, type AnalysisResult, type Severity } from "@/lib/analyze.functions";
import { exportDashboardToPdf } from "@/lib/export-pdf";

const searchSchema = z.object({ repo: z.string().optional().default("") });

export const Route = createFileRoute("/analyze")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Repository analysis — RepoGuard" },
      { name: "description", content: "Detailed security, dependency, quality and activity report for a GitHub repository." },
    ],
  }),
  component: AnalyzePage,
});

function AnalyzePage() {
  const { repo } = Route.useSearch();
  const fn = useServerFn(analyzeRepo);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["analyze", repo],
    queryFn: () => fn({ data: { repoUrl: repo } }),
    enabled: !!repo,
    retry: false,
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center gap-6">
          <Logo />
          <div className="flex-1 max-w-2xl">
            <SearchBar initial={repo} />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-8">
        {!repo ? (
          <EmptyState />
        ) : isLoading || isFetching ? (
          <LoadingState repo={repo} />
        ) : error ? (
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        ) : data ? (
          <Dashboard data={data} />
        ) : null}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-24">
      <p className="text-muted-foreground">Enter a GitHub repo above to begin.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back home</Link>
    </div>
  );
}

function LoadingState({ repo }: { repo: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Loader2 className="h-10 w-10 text-primary animate-spin" />
      <h2 className="mt-6 text-xl font-medium">Scanning <span className="font-mono text-primary">{repo}</span></h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        Fetching file tree, scanning for secrets, analyzing dependencies and running AI summary. This can take 20–60 seconds.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 max-w-2xl mx-auto">
      <div className="flex items-start gap-3">
        <CircleAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-destructive">Analysis failed</h3>
          <p className="mt-1 text-sm text-foreground/80 break-words">{message}</p>
          <button onClick={onRetry} className="mt-4 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-ring">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------

const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--destructive)",
  high: "oklch(0.7 0.2 30)",
  medium: "var(--warning)",
  low: "var(--info)",
  info: "var(--muted-foreground)",
};

function scoreColor(s: number) {
  if (s >= 80) return "var(--success)";
  if (s >= 60) return "var(--warning)";
  if (s >= 40) return "oklch(0.7 0.2 30)";
  return "var(--destructive)";
}

function scoreLabel(s: number) {
  if (s >= 80) return "Healthy";
  if (s >= 60) return "Needs attention";
  if (s >= 40) return "At risk";
  return "Critical";
}

function Dashboard({ data }: { data: AnalysisResult }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const safeName = data.repo.fullName.replace(/[^\w.-]+/g, "_");
      await exportDashboardToPdf(reportRef.current, `repoguard-${safeName}.pdf`);
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:border-ring disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Generating PDF…" : "Export PDF report"}
        </button>
      </div>
      <div ref={reportRef} className="space-y-6 bg-background p-2">
        <RepoHeader data={data} />
        <div className="grid gap-6 lg:grid-cols-3">
          <ScoreCard data={data} />
          <div className="lg:col-span-2 grid gap-6 sm:grid-cols-2">
            <StatCard icon={Star} label="Stars" value={data.repo.stars.toLocaleString()} />
            <StatCard icon={GitFork} label="Forks" value={data.repo.forks.toLocaleString()} />
            <StatCard icon={Users} label="Contributors" value={data.activity.contributors.toLocaleString()} />
            <StatCard icon={AlertCircle} label="Open issues" value={data.repo.openIssues.toLocaleString()} />
          </div>
        </div>

        <AISummaryCard data={data} />

        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryBreakdown data={data} />
          <ActivityChart data={data} />
        </div>

        <FindingsTabs data={data} />

        <SuggestionsCard data={data} />

        <RecentCommits data={data} />
      </div>
    </div>
  );
}

function RepoHeader({ data }: { data: AnalysisResult }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
      {data.repo.ownerAvatar && (
        <img src={data.repo.ownerAvatar} alt="" className="h-12 w-12 rounded-lg border border-border" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold font-mono">{data.repo.fullName}</h1>
          <a
            href={data.repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1">{data.repo.description ?? "No description"}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.repo.language && <Pill>{data.repo.language}</Pill>}
        {data.repo.license && <Pill>{data.repo.license}</Pill>}
        <Pill>
          <Calendar className="h-3 w-3" />
          {new Date(data.repo.pushedAt).toLocaleDateString()}
        </Pill>
        <Pill>{data.scannedFiles} files scanned</Pill>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-muted-foreground">
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-2xl font-semibold font-mono">{value}</div>
    </div>
  );
}

function ScoreCard({ data }: { data: AnalysisResult }) {
  const color = scoreColor(data.score.total);
  const chartData = [{ name: "score", value: data.score.total, fill: color }];
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Repository Health</div>
      <div className="relative w-48 h-48">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="75%" outerRadius="100%" data={chartData} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "var(--muted)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-5xl font-semibold font-mono" style={{ color }}>{data.score.total}</div>
          <div className="text-xs text-muted-foreground mt-1">/ 100</div>
        </div>
      </div>
      <div
        className="mt-2 rounded-full px-3 py-1 text-xs font-medium"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
      >
        {scoreLabel(data.score.total)}
      </div>
    </div>
  );
}

function CategoryBreakdown({ data }: { data: AnalysisResult }) {
  const rows = [
    { name: "Security", score: data.score.security, icon: ShieldCheck },
    { name: "Secrets", score: data.score.secrets, icon: KeyRound },
    { name: "Dependencies", score: data.score.dependencies, icon: PackageSearch },
    { name: "Code quality", score: data.score.quality, icon: GitCommit },
    { name: "Activity", score: data.score.activity, icon: Calendar },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-medium">Category breakdown</h2>
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <r.icon className="h-4 w-4 text-muted-foreground" />
                {r.name}
              </div>
              <span className="font-mono" style={{ color: scoreColor(r.score) }}>{r.score}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${r.score}%`, backgroundColor: scoreColor(r.score) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityChart({ data }: { data: AnalysisResult }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-medium">Recent commit activity</h2>
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer>
          <BarChart data={data.activity.commitsByWeek}>
            <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={10} />
            <YAxis stroke="var(--muted-foreground)" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="commits" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AISummaryCard({ data }: { data: AnalysisResult }) {
  if (!data.ai.summary) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <h2 className="font-medium">AI summary</h2>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{data.ai.summary}</p>
    </div>
  );
}

function FindingsTabs({ data }: { data: AnalysisResult }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <FindingsList
        title="Exposed secrets"
        icon={KeyRound}
        empty="No secrets detected — clean!"
        items={data.secrets.map((s) => ({
          severity: s.severity,
          primary: s.type,
          secondary: `${s.file}:${s.line}`,
          mono: s.preview,
        }))}
      />
      <FindingsList
        title="Dependency risks"
        icon={PackageSearch}
        empty="No risky dependencies flagged."
        items={data.dependencies.map((d) => ({
          severity: d.severity,
          primary: `${d.name} ${d.version}`,
          secondary: d.ecosystem,
          mono: d.reason,
        }))}
      />
      <FindingsList
        title="Code quality"
        icon={ShieldCheck}
        empty="No quality issues found."
        items={data.quality.map((q) => ({
          severity: q.severity,
          primary: q.type,
          secondary: "",
          mono: q.detail,
        }))}
      />
    </div>
  );
}

function FindingsList({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: any;
  items: { severity: Severity; primary: string; secondary: string; mono: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">{title}</h2>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-auto pr-1">
          {items.map((it, i) => (
            <li key={i} className="rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{
                    color: SEV_COLOR[it.severity],
                    backgroundColor: `color-mix(in oklab, ${SEV_COLOR[it.severity]} 18%, transparent)`,
                  }}
                >
                  {it.severity}
                </span>
                <span className="text-sm font-medium truncate">{it.primary}</span>
              </div>
              {it.secondary && (
                <div className="mt-1 text-xs text-muted-foreground font-mono truncate">{it.secondary}</div>
              )}
              {it.mono && (
                <div className="mt-1 text-xs text-foreground/70 font-mono break-all line-clamp-2">{it.mono}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionsCard({ data }: { data: AnalysisResult }) {
  if (!data.ai.suggestions?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <h2 className="font-medium">AI improvement suggestions</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.ai.suggestions.map((s, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface/60 p-4">
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  color: SEV_COLOR[s.severity] ?? SEV_COLOR.medium,
                  backgroundColor: `color-mix(in oklab, ${SEV_COLOR[s.severity] ?? SEV_COLOR.medium} 18%, transparent)`,
                }}
              >
                {s.severity}
              </span>
              <h3 className="font-medium text-sm">{s.title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentCommits({ data }: { data: AnalysisResult }) {
  if (!data.activity.recentCommits.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-medium mb-3">Recent commits</h2>
      <ul className="divide-y divide-border/60">
        {data.activity.recentCommits.map((c) => (
          <li key={c.sha} className="py-2 flex items-center gap-3 text-sm">
            <span className="font-mono text-xs text-primary w-16 shrink-0">{c.sha}</span>
            <span className="flex-1 truncate">{c.message}</span>
            <span className="text-xs text-muted-foreground shrink-0">{c.author}</span>
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
              {c.date ? new Date(c.date).toLocaleDateString() : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
