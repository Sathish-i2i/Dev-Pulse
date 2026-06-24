"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/client-auth";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { useDashboard } from "@/hooks/use-dashboard";
import { useRepos } from "@/hooks/use-repos";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { RepoSelector } from "@/components/repos/repo-selector";

// Recharts uses window — must be dynamically imported with ssr:false
const CommitFrequencyChart = dynamic(
  () => import("@/components/charts/commit-frequency-chart").then((m) => ({ default: m.CommitFrequencyChart })),
  { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-lg bg-slate-100" /> }
);
const PRStatsChart = dynamic(
  () => import("@/components/charts/pr-stats-chart").then((m) => ({ default: m.PRStatsChart })),
  { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-lg bg-slate-100" /> }
);
const ContributorChart = dynamic(
  () => import("@/components/charts/contributor-chart").then((m) => ({ default: m.ContributorChart })),
  { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-lg bg-slate-100" /> }
);

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-600">{title}</h3>
      {children}
    </div>
  );
}

export function DashboardLayout() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState(defaultRange);
  const [selectedRepoId, setSelectedRepoId] = useState<string | "all">("all");

  const { data, isLoading, error } = useDashboard(dateRange);
  const { repos } = useRepos();

  // When a specific repo is selected, use per-repo metrics from the dashboard repos list
  const activeMetrics = (() => {
    if (!data) return null;
    if (selectedRepoId === "all") return data.timeline;
    return data.timeline; // dashboard aggregates; per-repo detail uses useRepoMetrics
  })();

  async function handleLogout() {
    try {
      await fetchWithAuth("/api/auth/logout", { method: "DELETE" });
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-900">DevPulse</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="font-medium text-blue-600">Dashboard</Link>
              <Link href="/repos" className="text-slate-500 hover:text-slate-900">Repositories</Link>
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
          <div className="flex flex-wrap items-center gap-3">
            <RepoSelector
              repos={repos}
              selectedId={selectedRepoId}
              onChange={setSelectedRepoId}
            />
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Total Commits"
            value={data?.summary.totalCommits ?? 0}
            isLoading={isLoading}
            icon={<CommitIcon />}
          />
          <MetricCard
            label="PRs Opened"
            value={data?.summary.totalPrsOpened ?? 0}
            isLoading={isLoading}
            icon={<PROpenIcon />}
          />
          <MetricCard
            label="PRs Merged"
            value={data?.summary.totalPrsMerged ?? 0}
            isLoading={isLoading}
            icon={<PRMergeIcon />}
          />
          <MetricCard
            label="Avg Commits / Day"
            value={data?.summary.avgDailyCommits ?? 0}
            isLoading={isLoading}
            icon={<TrendIcon />}
          />
        </div>

        {/* Charts */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Commit Frequency">
            <CommitFrequencyChart data={activeMetrics ?? []} isLoading={isLoading} height={220} />
          </ChartCard>
          <ChartCard title="Pull Requests">
            <PRStatsChart data={activeMetrics ?? []} isLoading={isLoading} height={220} />
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <ChartCard title="Active Contributors">
              <ContributorChart data={activeMetrics ?? []} isLoading={isLoading} height={200} />
            </ChartCard>
          </div>

          {/* Activity feed */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-slate-600">Recent Activity</h3>
            <ActivityFeed
              isLoading={isLoading}
              items={(activeMetrics ?? []).map((m) => ({
                repoFullName: selectedRepoId === "all"
                  ? (data?.repos[0]?.fullName ?? "—")
                  : (repos.find((r) => r.id === selectedRepoId)?.fullName ?? "—"),
                date: m.date,
                commits: m.commits,
                prsOpened: m.prsOpened,
                prsMerged: m.prsMerged,
              }))}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// Inline icon components — keeps chart imports out of this file
function CommitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M2 12h7M15 12h7" />
    </svg>
  );
}
function PROpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <path d="M6 9v6M18 5l-3 3 3 3" /><path d="M21 6h-6" />
    </svg>
  );
}
function PRMergeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
      <path d="M6 9v3a6 6 0 006 6h3" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 17l6-6 4 4 8-8" />
    </svg>
  );
}
