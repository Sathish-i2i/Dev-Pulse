/**
 * Security integration tests:
 * - IDOR: users cannot access each other's resources
 * - Auth edge cases: expired sessions, empty Bearer token, malformed tokens
 * - Sensitive field leakage: passwordHash and encryptedPat never returned
 * - Rate limiting: 429 with Retry-After header
 * - Connect: GitHub validation failure → 404
 */
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { clearRateLimitStore } from "@/lib/rate-limit";

import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as logout } from "@/app/api/auth/logout/route";
import { POST as connectRepo } from "@/app/api/repos/connect/route";
import { GET as getRepos } from "@/app/api/repos/route";
import { GET as getMetrics } from "@/app/api/metrics/[repoId]/route";
import { POST as syncRepo } from "@/app/api/repos/[repoId]/sync/route";

let ipSeed = 150;
function makeReq(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.5.0.${ipSeed++}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let aliceToken: string;
let bobToken: string;
let aliceRepoId: string;

beforeAll(async () => {
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();
  process.env.SKIP_GITHUB_VALIDATION = "true";

  const r1 = await register(
    makeReq("POST", "http://localhost/api/auth/register", {
      email: "alice_s@example.com",
      password: "password123",
      name: "Alice",
    })
  );
  aliceToken = (await r1.json()).token;

  const r2 = await register(
    makeReq("POST", "http://localhost/api/auth/register", {
      email: "bob_s@example.com",
      password: "password123",
      name: "Bob",
    })
  );
  bobToken = (await r2.json()).token;

  const rr = await connectRepo(
    makeReq(
      "POST",
      "http://localhost/api/repos/connect",
      { owner: "alice", name: "private-repo", pat: "ghp_sectest" },
      { authorization: `Bearer ${aliceToken}` }
    )
  );
  aliceRepoId = (await rr.json()).repo.id;
});

afterAll(async () => {
  delete process.env.SKIP_GITHUB_VALIDATION;
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ── IDOR prevention ────────────────────────────────────────────────────────────

describe("IDOR prevention", () => {
  it("bob cannot read alice's metrics — 404, not 403", async () => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/${aliceRepoId}?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${bobToken}` }
      ),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(404);
  });

  it("bob cannot trigger sync on alice's repo — 404", async () => {
    const res = await syncRepo(
      makeReq(
        "POST",
        `http://localhost/api/repos/${aliceRepoId}/sync`,
        undefined,
        { authorization: `Bearer ${bobToken}` }
      ),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/repos returns only the requesting user's repos", async () => {
    const res = await getRepos(
      makeReq("GET", "http://localhost/api/repos", undefined, {
        authorization: `Bearer ${bobToken}`,
      })
    );
    expect(res.status).toBe(200);
    const { repos } = await res.json();
    expect(repos.map((r: { id: string }) => r.id)).not.toContain(aliceRepoId);
  });

  it("using a completely random UUID as repoId returns 404", async () => {
    const fakeId = crypto.randomUUID();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/${fakeId}?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      ),
      { params: Promise.resolve({ repoId: fakeId }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── Sensitive field leakage ────────────────────────────────────────────────────

describe("Sensitive field leakage", () => {
  it("passwordHash never returned from register", async () => {
    const res = await register(
      makeReq("POST", "http://localhost/api/auth/register", {
        email: "leakcheck@example.com",
        password: "password123",
        name: "Leak Check",
      })
    );
    const body = await res.json();
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("passwordHash never returned from login", async () => {
    const res = await login(
      makeReq("POST", "http://localhost/api/auth/login", {
        email: "alice_s@example.com",
        password: "password123",
      })
    );
    const body = await res.json();
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("encryptedPat never returned in GET /api/repos", async () => {
    const res = await getRepos(
      makeReq("GET", "http://localhost/api/repos", undefined, {
        authorization: `Bearer ${aliceToken}`,
      })
    );
    const { repos } = await res.json();
    expect(repos.length).toBeGreaterThan(0);
    for (const r of repos as Record<string, unknown>[]) {
      expect(r.encryptedPat).toBeUndefined();
    }
  });

  it("encryptedPat never returned from connect", async () => {
    const res = await connectRepo(
      makeReq(
        "POST",
        "http://localhost/api/repos/connect",
        { owner: "alice", name: "another-repo", pat: "ghp_leakcheck" },
        { authorization: `Bearer ${aliceToken}` }
      )
    );
    const body = await res.json();
    expect(body.repo.encryptedPat).toBeUndefined();
  });
});

// ── Auth edge cases ────────────────────────────────────────────────────────────

describe("Authentication edge cases", () => {
  it("expired session token returns 401", async () => {
    const alice = await prisma.user.findFirstOrThrow({
      where: { email: "alice_s@example.com" },
    });
    const rawToken = crypto.randomUUID();
    await prisma.session.create({
      data: {
        userId: alice.id,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    const res = await getRepos(
      makeReq("GET", "http://localhost/api/repos", undefined, {
        authorization: `Bearer ${rawToken}`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("logout with only whitespace after 'Bearer ' returns 401", async () => {
    // "Bearer   " has two extra spaces: startsWith("Bearer ") passes,
    // slice(7).trim() → "" → hits the empty-raw-token 401 branch (line 12-13)
    const res = await logout(
      new Request("http://localhost/api/auth/logout", {
        method: "DELETE",
        headers: { authorization: "Bearer   " },
      })
    );
    expect(res.status).toBe(401);
  });

  it("well-formed UUID token not in DB returns 401", async () => {
    const res = await getRepos(
      makeReq("GET", "http://localhost/api/repos", undefined, {
        authorization: `Bearer ${crypto.randomUUID()}`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("missing Authorization header on any protected endpoint returns 401", async () => {
    const res = await getRepos(makeReq("GET", "http://localhost/api/repos"));
    expect(res.status).toBe(401);
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────────

describe("Rate limiting", () => {
  it("register: 429 with Retry-After after 5 requests from the same IP", async () => {
    clearRateLimitStore();
    const rlIp = "10.200.1.1";
    for (let i = 0; i < 5; i++) {
      await register(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": rlIp },
          body: JSON.stringify({
            email: `rlreg${i}@example.com`,
            password: "password123",
            name: "X",
          }),
        })
      );
    }
    const res = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": rlIp },
        body: JSON.stringify({ email: "rlreg5@example.com", password: "password123", name: "X" }),
      })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("login: 429 with Retry-After after 10 requests from the same IP", async () => {
    clearRateLimitStore();
    const rlIp = "10.200.1.2";
    for (let i = 0; i < 10; i++) {
      await login(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": rlIp },
          body: JSON.stringify({ email: "ghost@example.com", password: "wrong" }),
        })
      );
    }
    const res = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": rlIp },
        body: JSON.stringify({ email: "ghost@example.com", password: "wrong" }),
      })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

// ── Connect: GitHub validation failure ────────────────────────────────────────

describe("Connect repo: GitHub API validation", () => {
  it("404 when GitHub API says repo not found (invalid PAT / private repo)", async () => {
    delete process.env.SKIP_GITHUB_VALIDATION;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
    );
    try {
      const res = await connectRepo(
        makeReq(
          "POST",
          "http://localhost/api/repos/connect",
          { owner: "ghost", name: "no-such-repo", pat: "ghp_toolong123" },
          { authorization: `Bearer ${aliceToken}` }
        )
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found|access/i);
    } finally {
      vi.unstubAllGlobals();
      process.env.SKIP_GITHUB_VALIDATION = "true";
    }
  });

  it("404 when fetch throws (network error during GitHub validation)", async () => {
    delete process.env.SKIP_GITHUB_VALIDATION;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"))
    );
    try {
      const res = await connectRepo(
        makeReq(
          "POST",
          "http://localhost/api/repos/connect",
          { owner: "ghost", name: "unreachable", pat: "ghp_toolong123" },
          { authorization: `Bearer ${aliceToken}` }
        )
      );
      expect(res.status).toBe(404);
    } finally {
      vi.unstubAllGlobals();
      process.env.SKIP_GITHUB_VALIDATION = "true";
    }
  });

  it("201 and extracts githubId/fullName from a live GitHub response", async () => {
    delete process.env.SKIP_GITHUB_VALIDATION;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 99999, full_name: "validowner/validrepo" }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    try {
      const res = await connectRepo(
        makeReq(
          "POST",
          "http://localhost/api/repos/connect",
          { owner: "validowner", name: "validrepo", pat: "ghp_toolong123" },
          { authorization: `Bearer ${aliceToken}` }
        )
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.repo.fullName).toBe("validowner/validrepo");
    } finally {
      vi.unstubAllGlobals();
      process.env.SKIP_GITHUB_VALIDATION = "true";
    }
  });
});
