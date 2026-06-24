import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Exclude: compiled Next.js output, browser-only React code (requires
      // DOM/window), and tooling config files that aren't application logic.
      exclude: [
        ".next/**",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/components/**",
        "src/hooks/**",
        "src/lib/client-auth.ts",
        "src/lib/fetch-with-auth.ts",
        "prisma/seed.ts",
        "next.config.ts",
        "postcss.config.mjs",
        "vitest.config.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
