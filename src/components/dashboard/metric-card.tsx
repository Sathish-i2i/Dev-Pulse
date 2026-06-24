import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

export type MetricCardProps = {
  label: string;
  value: number | string;
  delta?: number;
  isLoading?: boolean;
  icon?: React.ReactNode;
};

export function MetricCard({ label, value, delta, isLoading, icon }: MetricCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  const deltaVariant =
    delta === undefined ? undefined : delta >= 0 ? "success" : "danger";
  const deltaLabel =
    delta === undefined
      ? null
      : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {deltaLabel && deltaVariant && (
        <div className="mt-2">
          <Badge variant={deltaVariant}>{deltaLabel} vs prev period</Badge>
        </div>
      )}
    </div>
  );
}
