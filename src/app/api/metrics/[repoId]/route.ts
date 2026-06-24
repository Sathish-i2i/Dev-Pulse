import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { metricsQuerySchema } from "@/types/index";

type RouteContext = { params: Promise<{ repoId: string }> };

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  const { allowed, retryAfterSec } = checkRateLimit(getClientIp(req), "metrics", 30, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const { repoId } = await ctx.params;
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const parsed = metricsQuerySchema.safeParse({ from, to });
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Ownership check — returns 404 (not 403) to avoid confirming resource existence
    const repo = await prisma.repository.findFirst({
      where: { id: repoId, userId: user.id },
      select: { id: true },
    });
    if (!repo) {
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }

    const metrics = await prisma.metric.findMany({
      where: {
        repoId,
        date: { gte: new Date(parsed.data.from), lte: new Date(parsed.data.to) },
      },
      select: { date: true, commits: true, prsOpened: true, prsMerged: true, contributors: true },
      orderBy: { date: "asc" },
    });

    return Response.json({ metrics, repoId });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
