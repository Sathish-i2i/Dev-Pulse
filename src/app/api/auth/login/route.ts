import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, SESSION_DURATION_MS } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { loginSchema } from "@/types/index";

const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(req: Request): Promise<Response> {
  const { allowed, retryAfterSec } = checkRateLimit(
    getClientIp(req),
    "login",
    10,
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
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always run bcrypt.compare to prevent timing attacks even when user not found
    const hash = user?.passwordHash ?? "$2b$10$invalidhashusedtoconstanttimex";
    const match = await bcrypt.compare(password, hash);

    if (!user || !match) {
      return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const rawToken = generateToken();
    await prisma.session.create({
      data: {
        userId: user.id,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return Response.json({
      token: rawToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
