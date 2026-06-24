"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export type ContributorChartProps = {
  data: Array<{ date: string | Date; contributors: number }>;
  isLoading?: boolean;
  height?: number;
};

function formatTick(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ContributorChart({ data, isLoading, height = 240 }: ContributorChartProps) {
  if (isLoading) {
    return <div style={{ height }} className="animate-pulse rounded-lg bg-slate-100" />;
  }

  const chartData = data.map((d) => ({ ...d, label: formatTick(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
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
          contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: 12 }}
          formatter={(v: number) => [v, "Contributors"]}
        />
        <Line
          type="monotone"
          dataKey="contributors"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
