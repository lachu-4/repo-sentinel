import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/repoguard/Logo";
import { SearchBar } from "@/components/repoguard/SearchBar";
import { ShieldCheck, KeyRound, PackageSearch, GitCommit, Sparkles, Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RepoGuard — Security & quality scanner for GitHub repos" },
      { name: "description", content: "Paste any public GitHub repo URL. RepoGuard scans for exposed secrets, vulnerable dependencies, code quality issues, and gives you an AI-generated health report." },
      { property: "og:title", content: "RepoGuard — GitHub Repo Health Scanner" },
      { property: "og:description", content: "Detect exposed API keys, hardcoded secrets, and vulnerable dependencies in any GitHub repository." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-10 bg-background/70">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition">Features</a>
            <a href="#how" className="hover:text-foreground transition">How it works</a>
            <Link to="/analyze" search={{ repo: "facebook/react" }} className="hover:text-foreground transition">Demo</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section
          className="relative overflow-hidden border-b border-border/60"
          style={{ backgroundImage: "var(--gradient-hero)" }}
        >
          <div className="mx-auto max-w-4xl px-6 py-24 md:py-32 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground mb-6">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered security &amp; quality analysis
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
              Scan any GitHub repo for
              <br />
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
                secrets, risks &amp; quality issues
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Paste a GitHub URL. RepoGuard analyzes the codebase for exposed API keys, vulnerable
              dependencies, and structural problems — then gives you an actionable health score from 0 to 100.
            </p>

            <div className="mt-10 max-w-2xl mx-auto">
              <SearchBar autoFocus />
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                <span>Try:</span>
                {["facebook/react", "vercel/next.js", "expressjs/express"].map((r) => (
                  <Link
                    key={r}
                    to="/analyze"
                    search={{ repo: r }}
                    className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono hover:border-ring transition"
                  >
                    {r}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-center">Built for engineers who care about shipping safely</h2>
          <p className="mt-3 text-center text-muted-foreground max-w-xl mx-auto">
            Five categories of checks, scored independently and rolled up into one repository health grade.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: KeyRound, title: "Exposed secrets", body: "AWS keys, GitHub tokens, Stripe secrets, private keys, JWTs and more — detected with battle-tested regex patterns." },
              { icon: PackageSearch, title: "Dependency risks", body: "Flag deprecated and known-vulnerable npm and PyPI packages from your manifests." },
              { icon: ShieldCheck, title: "Code quality", body: "Missing tests, no CI, no LICENSE, gigantic files, TODO/FIXME density — caught in seconds." },
              { icon: Activity, title: "Repo activity", body: "Commit cadence, contributor count, recent activity. A dead repo is its own kind of risk." },
              { icon: GitCommit, title: "Health score", body: "A weighted 0–100 score combining security, dependency, quality, and activity signals." },
              { icon: Sparkles, title: "AI insights", body: "An LLM summarizes what the repo does and proposes prioritized fixes for the issues found." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto max-w-4xl px-6 py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-center">How it works</h2>
            <ol className="mt-12 space-y-6">
              {[
                ["Paste a repo URL", "Public GitHub repos work out of the box. We use the GitHub API to read the file tree."],
                ["Scan source files", "We pull up to ~80 high-signal files (configs, source, manifests) and run secret + quality scanners."],
                ["Score & summarize", "An AI model summarizes the project and the findings get rolled up into a 0–100 health score."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-5 rounded-xl border border-border bg-card p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-mono">{i + 1}</div>
                  <div>
                    <h3 className="font-medium">{t}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Built with care · RepoGuard analyzes public GitHub repositories
      </footer>
    </div>
  );
}
