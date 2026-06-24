import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { clearRateLimitStore } from "@/lib/rate-limit";

import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as logout } from "@/app/api/auth/logout/route";

// Assign a unique fake IP per test to keep each call independent of rate limits
let testIp = 0;
function makeReq(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/auth", {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${testIp}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();
});

// Fresh IP per test so rate-limit checks never bleed between cases
beforeEach(() => { testIp = (testIp + 1) % 254; });

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ── Register ──────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("201 — creates user and returns token + user (no passwordHash)", async () => {
    const res = await register(
      makeReq("POST", {
        email: "reg201@example.com",
        password: "password123",
        name: "Test User",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe("reg201@example.com");
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.id).toBeDefined();
  });

  it("409 — duplicate email", async () => {
    const payload = { email: "dup@example.com", password: "password123", name: "Dup" };
    await register(makeReq("POST", payload));
    testIp++;
    const res = await register(makeReq("POST", payload));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already/i);
  });

  it("400 — password too short", async () => {
    const res = await register(
      makeReq("POST", { email: "short@example.com", password: "abc", name: "X" })
    );
    expect(res.status).toBe(400);
  });

  it("400 — invalid email", async () => {
    const res = await register(
      makeReq("POST", { email: "notanemail", password: "password123", name: "X" })
    );
    expect(res.status).toBe(400);
  });

  it("400 — missing name", async () => {
    const res = await register(
      makeReq("POST", { email: "noname@example.com", password: "password123" })
    );
    expect(res.status).toBe(400);
  });

  it("stores SHA-256 hash of token in DB — raw token never persisted", async () => {
    const res = await register(
      makeReq("POST", {
        email: "hashcheck@example.com",
        password: "password123",
        name: "Hash Check",
      })
    );
    expect(res.status).toBe(201);
    const { token } = await res.json();
    const session = await prisma.session.findFirst({
      where: { token: hashToken(token) },
    });
    expect(session).not.toBeNull();
    expect(session!.token).not.toBe(token);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await register(
      makeReq("POST", {
        email: "login_test@example.com",
        password: "correct-password",
        name: "Login Tester",
      })
    );
  });

  it("200 — valid credentials return token + user", async () => {
    const res = await login(
      makeReq("POST", {
        email: "login_test@example.com",
        password: "correct-password",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe("login_test@example.com");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("401 — wrong password", async () => {
    const res = await login(
      makeReq("POST", { email: "login_test@example.com", password: "wrong" })
    );
    expect(res.status).toBe(401);
  });

  it("401 — unknown email returns same message as wrong password (no enumeration)", async () => {
    const resUnknown = await login(
      makeReq("POST", { email: "ghost@example.com", password: "whatever" })
    );
    const resWrong = await login(
      makeReq("POST", { email: "login_test@example.com", password: "wrong" })
    );
    expect(resUnknown.status).toBe(401);
    expect(resWrong.status).toBe(401);
    const b1 = await resUnknown.json();
    const b2 = await resWrong.json();
    expect(b1.error).toBe(b2.error);
  });

  it("400 — missing password field", async () => {
    const res = await login(makeReq("POST", { email: "login_test@example.com" }));
    expect(res.status).toBe(400);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe("DELETE /api/auth/logout", () => {
  let activeToken: string;

  beforeAll(async () => {
    const res = await register(
      makeReq("POST", {
        email: "logout_test@example.com",
        password: "password123",
        name: "Logout Tester",
      })
    );
    const body = await res.json();
    activeToken = body.token;
  });

  it("204 — valid token deletes the session", async () => {
    const res = await logout(
      makeReq("DELETE", undefined, { authorization: `Bearer ${activeToken}` })
    );
    expect(res.status).toBe(204);
    const session = await prisma.session.findFirst({
      where: { token: hashToken(activeToken) },
    });
    expect(session).toBeNull();
  });

  it("204 — calling logout again with same token is idempotent", async () => {
    const res = await logout(
      makeReq("DELETE", undefined, { authorization: `Bearer ${activeToken}` })
    );
    expect(res.status).toBe(204);
  });

  it("204 — non-existent token is idempotent (spec: invalid token → still 204)", async () => {
    const res = await logout(
      makeReq("DELETE", undefined, { authorization: "Bearer not-a-real-token" })
    );
    expect(res.status).toBe(204);
  });

  it("401 — missing Authorization header", async () => {
    const res = await logout(makeReq("DELETE"));
    expect(res.status).toBe(401);
  });

  it("using the invalidated token on a protected endpoint returns 401", async () => {
    // Import repos GET to verify the token is truly dead
    const { GET: getRepos } = await import("@/app/api/repos/route");
    const res = await getRepos(
      makeReq("GET", undefined, { authorization: `Bearer ${activeToken}` })
    );
    expect(res.status).toBe(401);
  });
});
