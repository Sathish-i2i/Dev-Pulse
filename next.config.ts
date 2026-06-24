import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const origin = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";

    // Strict CSP. 'unsafe-inline' on script-src is required for Next.js
    // hydration scripts; replace with nonces in a future hardening pass.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.github.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = [
      // Prevent MIME-type sniffing — important for API JSON responses too
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Covered by frame-ancestors in CSP; belt-and-suspenders for older browsers
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Disable legacy XSS filter (can introduce vulnerabilities in old browsers)
      { key: "X-XSS-Protection", value: "0" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: csp },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
        : []),
    ];

    return [
      // Security headers on every response
      { source: "/:path*", headers: securityHeaders },
      // CORS headers scoped to API routes only
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: origin },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization,Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
