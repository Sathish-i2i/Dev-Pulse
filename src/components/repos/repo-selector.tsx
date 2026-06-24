"use client";

import { cn } from "@/lib/cn";
import type { RepoSummary } from "@/types/index";

export type RepoSelectorProps = {
  repos: RepoSummary[];
  selectedId: string | "all";
  onChange: (id: string | "all") => void;
  className?: string;
};

export function RepoSelector({ repos, selectedId, onChange, className }: RepoSelectorProps) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value as string | "all")}
      className={cn(
        "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700",
        "focus:outline-none focus:ring-2 focus:ring-blue-500",
        className
      )}
    >
      <option value="all">All repositories</option>
      {repos.map((r) => (
        <option key={r.id} value={r.id}>
          {r.fullName}
        </option>
      ))}
    </select>
  );
}
