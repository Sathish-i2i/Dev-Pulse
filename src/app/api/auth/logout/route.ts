import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";

export async function DELETE(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const raw = authHeader.slice(7).trim();
  if (!raw) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    // Hash and delete — idempotent regardless of whether the session exists
    await prisma.session.deleteMany({ where: { token: hashToken(raw) } });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
