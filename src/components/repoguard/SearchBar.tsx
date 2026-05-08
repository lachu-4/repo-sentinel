import { useState, FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";

export function SearchBar({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setSubmitting(true);
    navigate({ to: "/analyze", search: { repo: v } });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface p-2 pl-4 shadow-[var(--shadow-card)] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 transition"
    >
      <Search className="h-5 w-5 text-muted-foreground shrink-0" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://github.com/owner/repo  —  or  owner/repo"
        className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground font-mono text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 transition"
        style={{ backgroundImage: "var(--gradient-primary)" }}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Analyze
      </button>
    </form>
  );
}
