"use client";

import { cn } from "@/lib/cn";

type DateRange = { from: Date; to: Date };

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
};

function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const activePreset = PRESETS.find((p) => {
    const expected = new Date();
    expected.setUTCHours(23, 59, 59, 999);
    const from = new Date(expected);
    from.setUTCDate(from.getUTCDate() - p.days);
    from.setUTCHours(0, 0, 0, 0);
    return (
      Math.abs(value.from.getTime() - from.getTime()) < 86_400_000 &&
      Math.abs(value.to.getTime() - expected.getTime()) < 86_400_000
    );
  });

  function applyPreset(days: number) {
    const to = new Date();
    to.setUTCHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);
    onChange({ from, to });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => applyPreset(p.days)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              activePreset?.days === p.days
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <span className="text-sm text-slate-400">or</span>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={toDateInput(value.from)}
          max={toDateInput(value.to)}
          onChange={(e) => onChange({ ...value, from: new Date((e.target as HTMLInputElement).value) })}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-400">—</span>
        <input
          type="date"
          value={toDateInput(value.to)}
          min={toDateInput(value.from)}
          max={toDateInput(new Date())}
          onChange={(e) => onChange({ ...value, to: new Date((e.target as HTMLInputElement).value) })}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
