import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimitStore, getClientIp } from "@/lib/rate-limit";

beforeEach(() => {
  clearRateLimitStore();
});

describe("checkRateLimit", () => {
  it("allows the first request in a new window", () => {
    const { allowed, retryAfterSec } = checkRateLimit("1.2.3.4", "test", 3, 60_000);
    expect(allowed).toBe(true);
    expect(retryAfterSec).toBe(0);
  });

  it("allows successive requests up to the limit", () => {
    checkRateLimit("1.2.3.4", "test", 3, 60_000);
    checkRateLimit("1.2.3.4", "test", 3, 60_000);
    const { allowed } = checkRateLimit("1.2.3.4", "test", 3, 60_000);
    expect(allowed).toBe(true);
  });

  it("denies the (maxRequests + 1)th request and returns retryAfterSec > 0", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("1.2.3.4", "test", 3, 60_000);
    const { allowed, retryAfterSec } = checkRateLimit("1.2.3.4", "test", 3, 60_000);
    expect(allowed).toBe(false);
    expect(retryAfterSec).toBeGreaterThan(0);
  });

  it("continues denying requests beyond the limit", () => {
    for (let i = 0; i < 4; i++) checkRateLimit("1.2.3.4", "test", 3, 60_000);
    const { allowed } = checkRateLimit("1.2.3.4", "test", 3, 60_000);
    expect(allowed).toBe(false);
  });

  it("uses separate windows per key — different keys don't share counts", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("1.2.3.4", "login", 3, 60_000);
    const loginDenied = checkRateLimit("1.2.3.4", "login", 3, 60_000);
    const registerAllowed = checkRateLimit("1.2.3.4", "register", 3, 60_000);
    expect(loginDenied.allowed).toBe(false);
    expect(registerAllowed.allowed).toBe(true);
  });

  it("uses separate windows per IP — different IPs don't share counts", () => {
    checkRateLimit("1.2.3.4", "test", 1, 60_000);
    const ip1 = checkRateLimit("1.2.3.4", "test", 1, 60_000);
    const ip2 = checkRateLimit("9.9.9.9", "test", 1, 60_000);
    expect(ip1.allowed).toBe(false);
    expect(ip2.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    checkRateLimit("1.2.3.4", "short", 1, 50); // 50 ms window
    const denied = checkRateLimit("1.2.3.4", "short", 1, 50);
    expect(denied.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 60));

    const reset = checkRateLimit("1.2.3.4", "short", 1, 50);
    expect(reset.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("returns the first IP from x-forwarded-for (strips proxies)", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.0.1.2" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' when no IP header is present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
