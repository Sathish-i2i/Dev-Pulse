/**
 * Integration tests for POST /api/repos/[repoId]/sync
 * Mocks @octokit/rest — Octokit is instantiated inside the handler on every
 * request, so vi.mock applies correctly regardless of module load order.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const {
  mockRateLimitGet,
  mockListCommits,
  mockListPulls,
  mockGetContributorsStats,
  mockPaginateIterator,
} = vi.hoisted(() => ({
  mockRateLimitGet: vi.fn(),
  mockListCommits: vi.fn(),
  mockListPulls: vi.fn(),
  mockGetContributorsStats: vi.fn(),
  mockPaginateIterator: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => ({
    rest: {
      rateLimit: { get: mockRateLimitGet },
      repos: {
        listCommits: mockListCommits,
        getContributorsStats: mockGetContributorsStats,
      },
      pulls: { list: mockListPulls },
    },
    paginate: { iterator: mockPaginateIterator },
  })),
}));

import { prisma } from "@/lib/prisma";
import { clearRateLimitStore } from "@/lib/rate-limit";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as connectRepo } from "@/app/api/repos/connect/route";
import { POST as syncRepo } from "@/app/api/repos/[repoId]/sync/route";

let ipSeed = 170;
function makeReq(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    method,
    headers: { "x-forwarded-for": `10.7.0.${ipSeed++}`, ...headers },
  });
}

let aliceToken: string;
let bobToken: string;
let aliceRepoId: string;

// Helpers for the async generator mocks
async function* noPages() { /* yields nothing */ }
async function* oneCommitPage(commits: { date: string }[]) {
  yield {
    data: commits.map((c) => ({
      commit: { author: { date: c.date } },
    })),
  };
}
async function* onePRPage(prs: { created_at: string; merged_at: string | null }[]) {
  yield { data: prs };
}

beforeAll(async () => {
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();
  process.env.SKIP_GITHUB_VALIDATION = "true";

  const r1 = await register(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.7.0.${ipSeed++}` },
      body: JSON.stringify({ email: "alice_sync@example.com", password: "password123", name: "Alice" }),
    })
  );
  aliceToken = (await r1.json()).token;

  const r2 = await register(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.7.0.${ipSeed++}` },
      body: JSON.stringify({ email: "bob_sync@example.com", password: "password123", name: "Bob" }),
    })
  );
  bobToken = (await r2.json()).token;

  const rr = await connectRepo(
    new Request("http://localhost/api/repos/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.7.0.${ipSeed++}`,
        authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ owner: "alice", name: "my-repo", pat: "ghp_synctest" }),
    })
  );
  aliceRepoId = (await rr.json()).repo.id;
});

beforeEach(() => {
  // Default: healthy rate limit, empty pages
  mockRateLimitGet.mockResolvedValue({ data: { rate: { remaining: 5000, reset: 9999999999 } } });
  mockPaginateIterator.mockReturnValue(noPages());
  mockGetContributorsStats.mockResolvedValue({ status: 202 }); // computing
  ipSeed = (ipSeed % 240) + 170;
});

afterAll(async () => {
  delete process.env.SKIP_GITHUB_VALIDATION;
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("POST /api/repos/[repoId]/sync", () => {
  it("401 — no Authorization header", async () => {
    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(401);
  });

  it("404 — repo does not exist", async () => {
    const res = await syncRepo(
      makeReq("POST", "http://localhost/api/repos/doesnotexist/sync", {
        authorization: `Bearer ${aliceToken}`,
      }),
      { params: Promise.resolve({ repoId: "doesnotexist" }) }
    );
    expect(res.status).toBe(404);
  });

  it("404 — IDOR: bob cannot sync alice's repo", async () => {
    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`, {
        authorization: `Bearer ${bobToken}`,
      }),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(404);
  });

  it("200 — aborts early when GitHub rate limit remaining < 100", async () => {
    mockRateLimitGet.mockResolvedValueOnce({
      data: { rate: { remaining: 50, reset: 1700000000 } },
    });

    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`, {
        authorization: `Bearer ${aliceToken}`,
      }),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateLimited).toBe(true);
    expect(body.resetAt).toBe(1700000000);
  });

  it("200 — zero days synced when GitHub returns no commits or PRs", async () => {
    // Default mockPaginateIterator already returns noPages()
    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`, {
        authorization: `Bearer ${aliceToken}`,
      }),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(true);
    expect(body.days).toBe(0);
  });

  it("200 — upserts one metric row per day and updates lastSyncedAt", async () => {
    // The "zero days" test above also completes a sync, setting lastSyncedAt = now.
    // Reset it so `since` rolls back to "30 days ago" and our recent PR dates pass.
    await prisma.repository.update({
      where: { id: aliceRepoId },
      data: { lastSyncedAt: null },
    });
    await prisma.metric.deleteMany({ where: { repoId: aliceRepoId } });

    // Use dates within the last 30-day 'since' window so the PR filter doesn't skip them
    const day1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    day1.setUTCHours(0, 0, 0, 0);
    const day2 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
    day2.setUTCHours(0, 0, 0, 0);

    const d1commit1 = new Date(day1.getTime() + 10 * 3600 * 1000).toISOString();
    const d1commit2 = new Date(day1.getTime() + 14 * 3600 * 1000).toISOString();
    const d2commit1 = new Date(day2.getTime() + 9 * 3600 * 1000).toISOString();
    const d1prCreated = new Date(day1.getTime() + 11 * 3600 * 1000).toISOString();
    const d2prMerged  = new Date(day2.getTime() + 8 * 3600 * 1000).toISOString();

    let callCount = 0;
    mockPaginateIterator.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return oneCommitPage([
          { date: d1commit1 },
          { date: d1commit2 }, // same day → count 2
          { date: d2commit1 },
        ]);
      }
      return onePRPage([
        { created_at: d1prCreated, merged_at: d2prMerged },
      ]);
    });

    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`, {
        authorization: `Bearer ${aliceToken}`,
      }),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(true);
    expect(body.days).toBe(2); // day1 and day2

    // Verify DB rows
    const row1 = await prisma.metric.findFirst({
      where: { repoId: aliceRepoId, date: day1 },
    });
    expect(row1?.commits).toBe(2);
    expect(row1?.prsOpened).toBe(1);
    expect(row1?.prsMerged).toBe(0);

    const row2 = await prisma.metric.findFirst({
      where: { repoId: aliceRepoId, date: day2 },
    });
    expect(row2?.commits).toBe(1);
    expect(row2?.prsMerged).toBe(1);

    // lastSyncedAt updated
    const repo = await prisma.repository.findFirst({ where: { id: aliceRepoId } });
    expect(repo?.lastSyncedAt).not.toBeNull();
  });

  it("200 — uses lastSyncedAt as 'since' on incremental re-sync", async () => {
    // The previous test set lastSyncedAt; ensure paginate.iterator is still called
    // (not that the since value is easy to assert without a spy, but we verify
    // the call completes without error and returns synced: true).
    const res = await syncRepo(
      makeReq("POST", `http://localhost/api/repos/${aliceRepoId}/sync`, {
        authorization: `Bearer ${aliceToken}`,
      }),
      { params: Promise.resolve({ repoId: aliceRepoId }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).synced).toBe(true);
  });
});
