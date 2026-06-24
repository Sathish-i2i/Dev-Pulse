/**
 * Integration tests for GET /api/repos/search
 * Mocks @octokit/rest since the module initialises Octokit at load time.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// vi.mock is hoisted above all imports by vitest — Octokit is mocked
// before repos/search/route.ts loads, so the module-level `new Octokit()`
// uses this mock constructor.
const mockSearchRepos = vi.hoisted(() => vi.fn());
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => ({
    rest: { search: { repos: mockSearchRepos } },
  })),
}));

import { prisma } from "@/lib/prisma";
import { clearRateLimitStore } from "@/lib/rate-limit";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as searchRepos } from "@/app/api/repos/search/route";

let ipSeed = 200;
let testToken: string;

function authed(url: string): Request {
  return new Request(url, {
    headers: {
      "x-forwarded-for": `10.6.0.${ipSeed++}`,
      authorization: `Bearer ${testToken}`,
    },
  });
}

beforeAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  clearRateLimitStore();

  const res = await register(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.6.0.${ipSeed++}`,
      },
      body: JSON.stringify({
        email: "searchtest@example.com",
        password: "password123",
        name: "Searcher",
      }),
    })
  );
  testToken = (await res.json()).token;
});

beforeEach(() => {
  mockSearchRepos.mockReset();
  ipSeed = (ipSeed % 240) + 200;
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("GET /api/repos/search", () => {
  it("401 — no Authorization header", async () => {
    const res = await searchRepos(
      new Request("http://localhost/api/repos/search?q=react", {
        headers: { "x-forwarded-for": `10.6.0.${ipSeed++}` },
      })
    );
    expect(res.status).toBe(401);
  });

  it("200 with empty items — missing q param", async () => {
    const res = await searchRepos(authed("http://localhost/api/repos/search"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("200 with empty items — q param is a single character (< 2)", async () => {
    const res = await searchRepos(authed("http://localhost/api/repos/search?q=r"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("200 with empty items — q is whitespace only", async () => {
    const res = await searchRepos(authed("http://localhost/api/repos/search?q=%20%20"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("200 — maps Octokit results to the expected shape", async () => {
    mockSearchRepos.mockResolvedValueOnce({
      data: {
        items: [
          {
            full_name: "facebook/react",
            owner: { login: "facebook" },
            name: "react",
            description: "A JS library for building UIs",
            stargazers_count: 220_000,
            private: false,
          },
        ],
      },
    });

    const res = await searchRepos(authed("http://localhost/api/repos/search?q=react"));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      fullName: "facebook/react",
      owner: "facebook",
      name: "react",
      description: "A JS library for building UIs",
      stars: 220_000,
      isPrivate: false,
    });
  });

  it("200 — handles null owner and null description gracefully", async () => {
    mockSearchRepos.mockResolvedValueOnce({
      data: {
        items: [
          {
            full_name: "unknown/repo",
            owner: null,
            name: "repo",
            description: null,
            stargazers_count: 0,
            private: true,
          },
        ],
      },
    });

    const res = await searchRepos(authed("http://localhost/api/repos/search?q=unknown-repo"));
    const { items } = await res.json();
    expect(items[0].owner).toBe("");
    expect(items[0].description).toBeNull();
    expect(items[0].isPrivate).toBe(true);
  });

  it("200 with empty items — Octokit throws (degrades gracefully)", async () => {
    mockSearchRepos.mockRejectedValueOnce(new Error("GitHub API unavailable"));

    const res = await searchRepos(authed("http://localhost/api/repos/search?q=broken"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("429 — rate limited after 20 requests from the same IP", async () => {
    clearRateLimitStore();
    mockSearchRepos.mockResolvedValue({ data: { items: [] } });

    const rlIp = "10.99.99.1";
    for (let i = 0; i < 20; i++) {
      await searchRepos(
        new Request(`http://localhost/api/repos/search?q=query${i}`, {
          headers: { "x-forwarded-for": rlIp, authorization: `Bearer ${testToken}` },
        })
      );
    }

    const res = await searchRepos(
      new Request("http://localhost/api/repos/search?q=overlimit", {
        headers: { "x-forwarded-for": rlIp, authorization: `Bearer ${testToken}` },
      })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});
