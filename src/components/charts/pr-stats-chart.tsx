"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type PRStatsChartProps = {
  data: Array<{ date: string | Date; prsOpened: number; prsMerged: number }>;
  isLoading?: boolean;
  height?: number;
};

function formatTick(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PRStatsChart({ data, isLoading, height = 240 }: PRStatsChartProps) {
  if (isLoading) {
    return <div style={{ height }} className="animate-pulse rounded-lg bg-slate-100" />;
  }

  const chartData = data.map((d) => ({ ...d, label: formatTick(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
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
        />
        <Legend
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="prsOpened" name="Opened" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="prsMerged" name="Merged" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
