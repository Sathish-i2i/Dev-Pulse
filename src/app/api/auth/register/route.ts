import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, SESSION_DURATION_MS } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registerSchema } from "@/types/index";

export async function POST(req: Request): Promise<Response> {
  const { allowed, retryAfterSec } = checkRateLimit(
    getClientIp(req),
    "register",
    5,
    60_000
  );
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const rawToken = generateToken();
    await prisma.session.create({
      data: {
        userId: user.id,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return Response.json({ token: rawToken, user }, { status: 201 });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
