import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

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
