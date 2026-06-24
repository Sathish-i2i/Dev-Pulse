import * as crypto from "crypto";
import { prisma } from "./prisma.js";
import type { User } from "@prisma/client";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    "Fatal: SESSION_SECRET env var must be set and at least 32 characters"
  );
}

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateToken(): string {
  return crypto.randomUUID();
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Extract, hash, and validate a Bearer token from an Authorization header.
 * Returns the full User row on success, null otherwise.
 */
export async function getSessionUser(
  authHeader: string | null
): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const raw = authHeader.slice(7).trim();
  if (!raw) return null;

  const hashed = hashToken(raw);

  const session = await prisma.session.findFirst({
    where: {
      token: hashed,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  return session?.user ?? null;
}

/**
 * Require auth from a Request object.
 * Returns { user } on success or a ready-to-send 401 Response.
 */
export async function requireAuth(
  req: Request
): Promise<{ user: User } | Response> {
  const user = await getSessionUser(req.headers.get("authorization"));
  if (!user) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  return { user };
}
