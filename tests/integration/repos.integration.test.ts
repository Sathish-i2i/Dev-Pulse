import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearRateLimitStore } from "@/lib/rate-limit";

import { POST as register } from "@/app/api/auth/register/route";
import { GET as getRepos } from "@/app/api/repos/route";
import { POST as connectRepo } from "@/app/api/repos/connect/route";

let ipCounter = 100;
function makeReq(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/repos", {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.1.0.${ipCounter}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let aliceToken: string;
let bobToken: string;

beforeAll(async () => {
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();

  const r1 = await register(
    makeReq("POST", { email: "alice_repo@example.com", password: "password123", name: "Alice" })
  );
  ipCounter++;
  aliceToken = (await r1.json()).token;

  const r2 = await register(
    makeReq("POST", { email: "bob_repo@example.com", password: "password123", name: "Bob" })
  );
  ipCounter++;
  bobToken = (await r2.json()).token;
});

beforeEach(() => { ipCounter = (ipCounter + 1) % 200 + 100; });

afterAll(async () => {
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ── GET /api/repos ────────────────────────────────────────────────────────────

describe("GET /api/repos", () => {
  it("401 — missing token", async () => {
    const res = await getRepos(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("200 — authenticated user with no repos returns empty array", async () => {
    const res = await getRepos(
      makeReq("GET", undefined, { authorization: `Bearer ${aliceToken}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos).toEqual([]);
  });
});

// ── POST /api/repos/connect ───────────────────────────────────────────────────

describe("POST /api/repos/connect", () => {
  it("401 — missing token", async () => {
    const res = await connectRepo(
      makeReq("POST", { owner: "vercel", name: "next.js", pat: "ghp_fake12345" })
    );
    expect(res.status).toBe(401);
  });

  it("400 — missing owner field", async () => {
    const res = await connectRepo(
      makeReq("POST", { name: "next.js", pat: "ghp_fake12345" }, {
        authorization: `Bearer ${aliceToken}`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 — PAT too short", async () => {
    const res = await connectRepo(
      makeReq("POST", { owner: "vercel", name: "next.js", pat: "short" }, {
        authorization: `Bearer ${aliceToken}`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("201 — connects a repo (GitHub validation stubbed via env)", async () => {
    // Set flag to skip live GitHub call in test environment
    process.env.SKIP_GITHUB_VALIDATION = "true";

    const res = await connectRepo(
      makeReq(
        "POST",
        { owner: "vercel", name: "next.js", pat: "ghp_testtoken1234567890" },
        { authorization: `Bearer ${aliceToken}` }
      )
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.repo.fullName).toBe("vercel/next.js");
    expect(body.repo.encryptedPat).toBeUndefined();

    delete process.env.SKIP_GITHUB_VALIDATION;
  });

  it("409 — connecting the same repo twice returns conflict", async () => {
    process.env.SKIP_GITHUB_VALIDATION = "true";

    const payload = { owner: "facebook", name: "react", pat: "ghp_testtoken1234567890" };
    await connectRepo(makeReq("POST", payload, { authorization: `Bearer ${aliceToken}` }));
    ipCounter++;
    const res = await connectRepo(
      makeReq("POST", payload, { authorization: `Bearer ${aliceToken}` })
    );
    expect(res.status).toBe(409);

    delete process.env.SKIP_GITHUB_VALIDATION;
  });

  it("repos from alice are not visible to bob", async () => {
    const res = await getRepos(
      makeReq("GET", undefined, { authorization: `Bearer ${bobToken}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos).toEqual([]);
  });

  it("alice can see her own repos after connecting", async () => {
    const res = await getRepos(
      makeReq("GET", undefined, { authorization: `Bearer ${aliceToken}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos.length).toBeGreaterThan(0);
    // encryptedPat must never appear in the response
    for (const repo of body.repos) {
      expect(repo.encryptedPat).toBeUndefined();
    }
  });
});
