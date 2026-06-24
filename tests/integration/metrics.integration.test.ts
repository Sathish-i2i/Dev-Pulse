import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearRateLimitStore } from "@/lib/rate-limit";

import { POST as register } from "@/app/api/auth/register/route";
import { POST as connectRepo } from "@/app/api/repos/connect/route";
import { GET as getMetrics } from "@/app/api/metrics/[repoId]/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";

let ipCounter = 50;
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
      "x-forwarded-for": `10.2.0.${ipCounter}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let aliceToken: string;
let bobToken: string;
let aliceRepoId: string;

const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const to = new Date().toISOString();

beforeAll(async () => {
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();
  process.env.SKIP_GITHUB_VALIDATION = "true";

  const r1 = await register(
    makeReq("POST", "http://localhost/api/auth/register", {
      email: "alice_met@example.com",
      password: "password123",
      name: "Alice",
    })
  );
  ipCounter++;
  aliceToken = (await r1.json()).token;

  const r2 = await register(
    makeReq("POST", "http://localhost/api/auth/register", {
      email: "bob_met@example.com",
      password: "password123",
      name: "Bob",
    })
  );
  ipCounter++;
  bobToken = (await r2.json()).token;

  // Alice connects a repo
  const repoRes = await connectRepo(
    makeReq(
      "POST",
      "http://localhost/api/repos/connect",
      { owner: "vercel", name: "next.js", pat: "ghp_testtoken12345" },
      { authorization: `Bearer ${aliceToken}` }
    )
  );
  const repoBody = await repoRes.json();
  aliceRepoId = repoBody.repo.id;
  ipCounter++;

  // Seed 10 metric rows for alice's repo
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    await prisma.metric.upsert({
      where: { repoId_date: { repoId: aliceRepoId, date: d } },
      create: { repoId: aliceRepoId, date: d, commits: i + 1, prsOpened: 1, prsMerged: 1, contributors: 2 },
      update: { commits: i + 1 },
    });
  }
});

beforeEach(() => { ipCounter = (ipCounter + 1) % 200 + 50; });

afterAll(async () => {
  delete process.env.SKIP_GITHUB_VALIDATION;
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ── GET /api/metrics/[repoId] ─────────────────────────────────────────────────

describe("GET /api/metrics/[repoId]", () => {
  it("401 — no token", async () => {
    const res = await getMetrics(
      makeReq("GET", `http://localhost/api/metrics/${aliceRepoId}?from=${from}&to=${to}`),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(401);
  });

  it("200 — returns metrics ordered by date ascending", async () => {
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/${aliceRepoId}?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      ),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.metrics)).toBe(true);
    expect(body.metrics.length).toBeGreaterThan(0);
    // Verify ascending date order
    const dates = body.metrics.map((m: { date: string }) => new Date(m.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]!);
    }
  });

  it("400 — from > to", async () => {
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/${aliceRepoId}?from=${to}&to=${from}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      ),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 — range exceeds 365 days", async () => {
    const bigFrom = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/${aliceRepoId}?from=${bigFrom}&to=${to}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      ),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(400);
  });

  it("404 — other user's repoId (IDOR: returns 404, not 403)", async () => {
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

  it("404 — non-existent repoId", async () => {
    const res = await getMetrics(
      makeReq(
        "GET",
        `http://localhost/api/metrics/nonexistentid?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      ),
      { params: Promise.resolve({ repoId: "nonexistentid" }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── GET /api/dashboard ────────────────────────────────────────────────────────

describe("GET /api/dashboard", () => {
  it("401 — no token", async () => {
    const res = await getDashboard(
      makeReq("GET", `http://localhost/api/dashboard?from=${from}&to=${to}`)
    );
    expect(res.status).toBe(401);
  });

  it("200 — returns summary, timeline, repos", async () => {
    const res = await getDashboard(
      makeReq(
        "GET",
        `http://localhost/api/dashboard?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${aliceToken}` }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.totalCommits).toBe("number");
    expect(body.summary.totalCommits).toBeGreaterThan(0);
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(Array.isArray(body.repos)).toBe(true);
  });

  it("200 — user with no repos returns zero summary and empty arrays", async () => {
    const res = await getDashboard(
      makeReq(
        "GET",
        `http://localhost/api/dashboard?from=${from}&to=${to}`,
        undefined,
        { authorization: `Bearer ${bobToken}` }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalCommits).toBe(0);
    expect(body.timeline).toEqual([]);
    expect(body.repos).toEqual([]);
  });

  it("400 — missing query params", async () => {
    const res = await getDashboard(
      makeReq("GET", "http://localhost/api/dashboard", undefined, {
        authorization: `Bearer ${aliceToken}`,
      })
    );
    expect(res.status).toBe(400);
  });
});
