import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const origin = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";
    return [
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
