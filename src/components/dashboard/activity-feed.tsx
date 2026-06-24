import { Badge } from "@/components/ui/badge";

type FeedItem = {
  repoFullName: string;
  date: string | Date;
  commits: number;
  prsOpened: number;
  prsMerged: number;
};

export type ActivityFeedProps = {
  items: FeedItem[];
  isLoading?: boolean;
};

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ActivityFeed({ items, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        No activity in the selected period.
      </p>
    );
  }

  // Show most recent first, cap at 20 rows
  const visible = [...items].reverse().slice(0, 20);

  return (
    <div className="divide-y divide-slate-100">
      {visible.map((item, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <span className="truncate text-sm font-medium text-slate-700">
              {item.repoFullName}
            </span>
            <span className="ml-2 text-xs text-slate-400">{formatDate(item.date)}</span>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-2">
            {item.commits > 0 && (
              <Badge variant="info">{item.commits} commit{item.commits !== 1 ? "s" : ""}</Badge>
            )}
            {item.prsOpened > 0 && (
              <Badge variant="warning">{item.prsOpened} opened</Badge>
            )}
            {item.prsMerged > 0 && (
              <Badge variant="success">{item.prsMerged} merged</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
