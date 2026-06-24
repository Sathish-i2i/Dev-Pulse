import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { metricsQuerySchema } from "@/types/index";
import type { DashboardSummary, MetricRow, DashboardRepoTotal } from "@/types/index";

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  const { allowed, retryAfterSec } = checkRateLimit(getClientIp(req), "dashboard", 30, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const parsed = metricsQuerySchema.safeParse({ from, to });
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const fromDate = new Date(parsed.data.from);
    const toDate = new Date(parsed.data.to);

    // Get all repos owned by this user
    const repos = await prisma.repository.findMany({
      where: { userId: user.id },
      select: { id: true, owner: true, name: true, fullName: true, lastSyncedAt: true, createdAt: true },
    });

    if (repos.length === 0) {
      const empty: DashboardSummary = {
        totalCommits: 0,
        totalPrsOpened: 0,
        totalPrsMerged: 0,
        avgDailyCommits: 0,
        activeDays: 0,
      };
      return Response.json({ summary: empty, timeline: [], repos: [] });
    }

    const repoIds = repos.map((r) => r.id);

    // Aggregate metrics across all repos grouped by date
    const grouped = await prisma.metric.groupBy({
      by: ["date"],
      where: { repoId: { in: repoIds }, date: { gte: fromDate, lte: toDate } },
      _sum: { commits: true, prsOpened: true, prsMerged: true, contributors: true },
      orderBy: { date: "asc" },
    });

    const timeline: MetricRow[] = grouped.map((g) => ({
      date: g.date,
      commits: g._sum.commits ?? 0,
      prsOpened: g._sum.prsOpened ?? 0,
      prsMerged: g._sum.prsMerged ?? 0,
      contributors: g._sum.contributors ?? 0,
    }));

    const totalCommits = timeline.reduce((s, r) => s + r.commits, 0);
    const totalPrsOpened = timeline.reduce((s, r) => s + r.prsOpened, 0);
    const totalPrsMerged = timeline.reduce((s, r) => s + r.prsMerged, 0);
    const activeDays = timeline.filter((r) => r.commits > 0).length;
    const diffDays = Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    const summary: DashboardSummary = {
      totalCommits,
      totalPrsOpened,
      totalPrsMerged,
      avgDailyCommits: Math.round((totalCommits / diffDays) * 10) / 10,
      activeDays,
    };

    // Per-repo totals for the period
    const perRepoMetrics = await prisma.metric.groupBy({
      by: ["repoId"],
      where: { repoId: { in: repoIds }, date: { gte: fromDate, lte: toDate } },
      _sum: { commits: true, prsOpened: true, prsMerged: true },
    });

    const repoTotalMap = new Map(
      perRepoMetrics.map((r) => [
        r.repoId,
        {
          commits: r._sum.commits ?? 0,
          prsOpened: r._sum.prsOpened ?? 0,
          prsMerged: r._sum.prsMerged ?? 0,
        },
      ])
    );

    const repoTotals: DashboardRepoTotal[] = repos.map((r) => ({
      ...r,
      commits: repoTotalMap.get(r.id)?.commits ?? 0,
      prsOpened: repoTotalMap.get(r.id)?.prsOpened ?? 0,
      prsMerged: repoTotalMap.get(r.id)?.prsMerged ?? 0,
    }));

    return Response.json({ summary, timeline, repos: repoTotals });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
