import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { decryptPat } from "@/lib/encryption";
import { Octokit } from "@octokit/rest";

type RouteContext = { params: Promise<{ repoId: string }> };

// Group an array of ISO-timestamp strings into a per-day commit count map
function commitsByDay(timestamps: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ts of timestamps) {
    const day = ts.split("T")[0]!;
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return map;
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  try {
    const { repoId } = await ctx.params;

    const repo = await prisma.repository.findFirst({
      where: { id: repoId, userId: user.id },
    });
    if (!repo) {
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }

    // Incremental: only fetch since lastSyncedAt (or 30 days ago)
    const since = repo.lastSyncedAt
      ? repo.lastSyncedAt.toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const pat = decryptPat(repo.encryptedPat);
    const octokit = new Octokit({ auth: pat });

    // Check rate limit before starting
    const { data: rateData } = await octokit.rest.rateLimit.get();
    if ((rateData.rate.remaining ?? 5000) < 100) {
      return Response.json({ rateLimited: true, resetAt: rateData.rate.reset });
    }

    // Fetch commits since last sync
    const allCommits: string[] = [];
    for await (const page of octokit.paginate.iterator(
      octokit.rest.repos.listCommits,
      { owner: repo.owner, repo: repo.name, since, per_page: 100 }
    )) {
      for (const commit of page.data) {
        const ts = commit.commit.author?.date;
        if (ts) allCommits.push(ts);
      }
    }

    // Fetch PRs (opened and merged) since last sync
    const allPRs: Array<{ created: string; merged: string | null }> = [];
    for await (const page of octokit.paginate.iterator(
      octokit.rest.pulls.list,
      { owner: repo.owner, repo: repo.name, state: "all", sort: "created", direction: "desc", per_page: 100 }
    )) {
      for (const pr of page.data) {
        if (!pr.created_at) continue;
        if (new Date(pr.created_at) < new Date(since)) break;
        allPRs.push({ created: pr.created_at, merged: pr.merged_at ?? null });
      }
    }

    // Day-group commits
    const commitMap = commitsByDay(allCommits);

    // Day-group PR opens and merges
    const prOpenMap = new Map<string, number>();
    const prMergeMap = new Map<string, number>();
    for (const pr of allPRs) {
      const openDay = pr.created.split("T")[0]!;
      prOpenMap.set(openDay, (prOpenMap.get(openDay) ?? 0) + 1);
      if (pr.merged) {
        const mergeDay = pr.merged.split("T")[0]!;
        prMergeMap.set(mergeDay, (prMergeMap.get(mergeDay) ?? 0) + 1);
      }
    }

    // Union of all days touched
    const days = new Set([...commitMap.keys(), ...prOpenMap.keys(), ...prMergeMap.keys()]);

    let synced = 0;
    for (const day of days) {
      const date = new Date(`${day}T00:00:00.000Z`);
      await prisma.metric.upsert({
        where: { repoId_date: { repoId, date } },
        create: {
          repoId,
          date,
          commits: commitMap.get(day) ?? 0,
          prsOpened: prOpenMap.get(day) ?? 0,
          prsMerged: prMergeMap.get(day) ?? 0,
          contributors: 0, // updated separately via stats API
        },
        update: {
          commits: commitMap.get(day) ?? 0,
          prsOpened: prOpenMap.get(day) ?? 0,
          prsMerged: prMergeMap.get(day) ?? 0,
        },
      });
      synced++;
    }

    // Try to update contributor counts from GitHub's weekly stats
    try {
      const statsRes = await octokit.rest.repos.getContributorsStats({
        owner: repo.owner,
        repo: repo.name,
      });
      // 202 = GitHub is computing — skip silently
      if (statsRes.status === 200 && Array.isArray(statsRes.data)) {
        const contribByDay = new Map<string, Set<string>>();
        for (const contributor of statsRes.data) {
          const login = contributor.author?.login ?? "unknown";
          for (const week of contributor.weeks ?? []) {
            if ((week.c ?? 0) === 0) continue;
            const weekDate = new Date((week.w ?? 0) * 1000);
            const weekDay = weekDate.toISOString().split("T")[0]!;
            if (!contribByDay.has(weekDay)) contribByDay.set(weekDay, new Set());
            contribByDay.get(weekDay)!.add(login);
          }
        }
        for (const [day, contributors] of contribByDay) {
          const date = new Date(`${day}T00:00:00.000Z`);
          await prisma.metric.updateMany({
            where: { repoId, date },
            data: { contributors: contributors.size },
          });
        }
      }
    } catch {
      // Contributor stats are best-effort — don't fail the sync
    }

    await prisma.repository.update({
      where: { id: repoId },
      data: { lastSyncedAt: new Date() },
    });

    return Response.json({ synced: true, days: synced });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
