"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RepoSummary } from "@/types/index";

export type RepoCardProps = {
  repo: RepoSummary;
  onSync?: (repoId: string) => void;
  isSyncing?: boolean;
};

function formatSyncTime(d: Date | string | null): string {
  if (!d) return "Never synced";
  const date = new Date(d);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RepoCard({ repo, onSync, isSyncing }: RepoCardProps) {
  const syncBadgeVariant = repo.lastSyncedAt ? "success" : "warning";

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-slate-400"
            fill="currentColor"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-medium text-slate-800 hover:text-blue-600 hover:underline"
          >
            {repo.fullName}
          </a>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant={syncBadgeVariant}>
            {formatSyncTime(repo.lastSyncedAt)}
          </Badge>
          <span className="text-xs text-slate-400">
            Connected {new Date(repo.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {onSync && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSync(repo.id)}
          isLoading={isSyncing}
          className="ml-4 shrink-0"
        >
          {isSyncing ? "Syncing…" : "Sync now"}
        </Button>
      )}
    </div>
  );
}
