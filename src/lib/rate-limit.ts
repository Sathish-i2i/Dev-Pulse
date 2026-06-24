type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

/**
 * Sliding-window rate limiter backed by an in-memory Map.
 * Returns true if the request is allowed, false if the limit is exceeded.
 */
export function checkRateLimit(
  ip: string,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const mapKey = `${key}:${ip}`;
  const now = Date.now();
  const entry = store.get(mapKey);

  if (!entry || now >= entry.resetAt) {
    store.set(mapKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Clear all rate-limit state — used in tests. */
export function clearRateLimitStore(): void {
  store.clear();
}

/** Extract a best-effort IP from a Next.js / Node request. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
