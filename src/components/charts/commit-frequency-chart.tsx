"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export type CommitFrequencyChartProps = {
  data: Array<{ date: string | Date; commits: number }>;
  isLoading?: boolean;
  height?: number;
};

function formatTick(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CommitFrequencyChart({
  data,
  isLoading,
  height = 240,
}: CommitFrequencyChartProps) {
  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="animate-pulse rounded-lg bg-slate-100"
      />
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatTick(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="commitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            fontSize: 12,
          }}
          formatter={(v: number) => [v, "Commits"]}
          labelFormatter={(l) => l}
        />
        <Area
          type="monotone"
          dataKey="commits"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#commitGradient)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
