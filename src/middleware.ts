import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth routes that authenticated users should be bounced away from
const AUTH_PATHS = new Set(["/login", "/register"]);
// Protected routes that require a valid session token
const PROTECTED_PREFIX = ["/dashboard", "/repos"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token =
    req.cookies.get("devpulse_token")?.value ??
    req.headers.get("authorization")?.replace("Bearer ", "").trim();

  // Authenticated users visiting /login or /register → send to dashboard
  if (AUTH_PATHS.has(pathname)) {
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Protected routes: no token → redirect to /login, preserving intended destination
  const isProtected = PROTECTED_PREFIX.some((p) => pathname.startsWith(p));
  if (isProtected && !token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register", "/dashboard/:path*", "/repos/:path*"],
};
