import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeNextReq(
  pathname: string,
  opts: { authorization?: string; cookie?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.authorization) headers["authorization"] = opts.authorization;
  if (opts.cookie) headers["cookie"] = opts.cookie;
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

// Helper: NextResponse.next() has no Location header; redirect has one.
function isRedirect(res: Response): boolean {
  return res.headers.get("location") !== null;
}

describe("middleware — auth pages (/login, /register)", () => {
  it("passes unauthenticated /login through (no redirect)", () => {
    const res = middleware(makeNextReq("/login"));
    expect(isRedirect(res)).toBe(false);
  });

  it("passes unauthenticated /register through (no redirect)", () => {
    const res = middleware(makeNextReq("/register"));
    expect(isRedirect(res)).toBe(false);
  });

  it("redirects authenticated user from /login to /dashboard (Bearer header)", () => {
    const res = middleware(makeNextReq("/login", { authorization: "Bearer sometoken" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects authenticated user from /login to /dashboard (cookie)", () => {
    const res = middleware(
      makeNextReq("/login", { cookie: "devpulse_token=sometoken" })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects authenticated user from /register to /dashboard", () => {
    const res = middleware(
      makeNextReq("/register", { authorization: "Bearer tok" })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });
});

describe("middleware — protected routes (/dashboard, /repos)", () => {
  it("redirects unauthenticated /dashboard to /login with ?from param", () => {
    const res = middleware(makeNextReq("/dashboard"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("from=");
    expect(loc).toContain("%2Fdashboard");
  });

  it("redirects unauthenticated /repos/abc to /login with ?from=/repos/abc", () => {
    const res = middleware(makeNextReq("/repos/abc"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(decodeURIComponent(loc)).toContain("from=/repos/abc");
  });

  it("passes authenticated /dashboard through", () => {
    const res = middleware(
      makeNextReq("/dashboard", { authorization: "Bearer tok" })
    );
    expect(isRedirect(res)).toBe(false);
  });

  it("passes authenticated /repos/anything through (cookie)", () => {
    const res = middleware(
      makeNextReq("/repos/xyz", { cookie: "devpulse_token=tok" })
    );
    expect(isRedirect(res)).toBe(false);
  });
});

describe("middleware — unmatched paths", () => {
  it("passes /api/anything through without inspection", () => {
    const res = middleware(makeNextReq("/api/auth/login"));
    expect(isRedirect(res)).toBe(false);
  });

  it("passes root path through", () => {
    const res = middleware(makeNextReq("/"));
    expect(isRedirect(res)).toBe(false);
  });
});
