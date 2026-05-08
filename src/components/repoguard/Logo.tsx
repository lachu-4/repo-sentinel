import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundImage: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <ShieldCheck className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="text-lg font-semibold tracking-tight">
        Repo<span className="text-primary">Guard</span>
      </span>
    </Link>
  );
}
