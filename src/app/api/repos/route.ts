import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  const { allowed, retryAfterSec } = checkRateLimit(getClientIp(req), "repo-list", 30, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const repos = await prisma.repository.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        owner: true,
        name: true,
        fullName: true,
        lastSyncedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ repos });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
