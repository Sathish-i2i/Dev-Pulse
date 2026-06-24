# DevPulse — Developer Analytics Dashboard

## What this is

A full-stack developer analytics dashboard that connects to GitHub repositories and surfaces commit frequency, PR stats, and team activity over time. Built for engineering teams who want visibility into their development velocity without leaving their internal tooling.

The app runs on **port 3000** by default (Next.js dev server).

---

## Architecture overview

```
Dev-Pulse/
├── src/
│   ├── app/                        ← Next.js 15 App Router
│   │   ├── (auth)/                 ← Route group: login, register
│   │   ├── dashboard/              ← Main dashboard page
│   │   ├── repos/                  ← Repository management pages
│   │   └── api/                    ← API routes (Next.js route handlers)
│   │       ├── auth/               ← register, login, logout, session
│   │       ├── repos/              ← list repos, connect repo
│   │       └── metrics/            ← per-repo and aggregated metrics
│   ├── components/
│   │   ├── charts/                 ← Recharts wrappers (CommitFrequency, PRStats, etc.)
│   │   ├── dashboard/              ← Dashboard-level composite components
│   │   ├── repos/                  ← RepoSelector, RepoCard, ConnectRepoForm
│   │   └── ui/                     ← Primitives: Button, Input, Badge, Modal
│   ├── lib/
│   │   ├── prisma.ts               ← Prisma client singleton
│   │   ├── auth.ts                 ← Session helpers, token signing/verification
│   │   ├── github.ts               ← GitHub API client (Octokit wrapper)
│   │   └── metrics.ts              ← Metric aggregation logic
│   ├── hooks/                      ← Client-side React hooks (useDashboard, useRepos)
│   ├── types/                      ← Shared TypeScript types and Zod schemas
│   └── middleware.ts               ← Auth middleware (protects /dashboard, /repos)
├── prisma/
│   ├── schema.prisma               ← Data models
│   └── seed.ts                     ← Dev seed data
├── public/                         ← Static assets
└── tests/
    ├── unit/                       ← Pure logic (metric calculations, auth helpers)
    └── integration/                ← API route tests via fetch + test DB
```

---

## Data models

```prisma
User        id, email (unique), passwordHash, name, createdAt, updatedAt
Repository  id, githubId, owner, name, fullName, userId (FK→User), lastSyncedAt, createdAt
Metric      id, repoId (FK→Repository), date, commits, prsOpened, prsMerged, contributors
Session     id, userId (FK→User), token (unique), expiresAt, createdAt
```

Key design decisions:
- `Metric` rows are one-per-day per repo — aggregation queries use date range filters.
- `Session` tokens are stored hashed; raw token is returned to client once at login.
- GitHub OAuth tokens are NOT stored — only the personal access token the user provides at repo connect time, stored encrypted at rest.

---

## API endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | No | Returns `{ token, user }` |
| POST | `/api/auth/login` | No | Returns `{ token, user }` |
| DELETE | `/api/auth/logout` | Yes | Invalidates session token |
| GET | `/api/repos` | Yes | Lists repos for the authed user |
| POST | `/api/repos/connect` | Yes | Links a GitHub repo via PAT |
| GET | `/api/repos/search` | Yes | GitHub repo search/autocomplete (uses `GITHUB_PAT`) |
| POST | `/api/repos/[repoId]/sync` | Yes | Incremental GitHub data sync for one repo |
| GET | `/api/metrics/[repoId]` | Yes | Commit/PR stats for a repo + date range |
| GET | `/api/dashboard` | Yes | Aggregated metrics across all user repos |

Authentication header: `Authorization: Bearer <session-token>`

---

## Coding conventions

### Naming

- **Files:** `kebab-case` everywhere (`commit-frequency-chart.tsx`, `use-dashboard.ts`)
- **Components:** PascalCase exports (`CommitFrequencyChart`)
- **Hooks:** `use` prefix, camelCase (`useDashboard`, `useRepoMetrics`)
- **API route files:** `route.ts` inside the appropriate `app/api/...` segment
- **Types/interfaces:** PascalCase, no `I` prefix (`type RepoMetric = ...`)
- **Zod schemas:** camelCase with `Schema` suffix (`connectRepoSchema`)

### File structure rules

- One component per file. Co-locate the component's types in the same file unless shared.
- Shared types go in `src/types/`. Don't reach into another component's file for its types.
- Server-only code (Prisma calls, token signing) lives in `src/lib/` — never imported from client components.
- Use `"use client"` only when necessary (event handlers, hooks, browser APIs). Default to Server Components.

### TypeScript

- `strict: true` — no `any`, no `as unknown as X` casts without a comment explaining why.
- Prefer `type` over `interface` for plain data shapes. Use `interface` only for objects that will be extended/implemented.
- Zod schemas are the source of truth for runtime validation at API boundaries; infer TypeScript types from them (`z.infer<typeof schema>`).

### Styling

- Tailwind CSS utility classes only — no custom CSS files except `globals.css` for resets and CSS variables.
- Use `cn()` (clsx + tailwind-merge) for conditional class composition.
- Design tokens (colors, spacing) via Tailwind config, not hardcoded values.

### Error handling in API routes

```ts
// Pattern for every route handler:
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = mySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

    // do work...
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

Never leak stack traces or internal error messages in production responses.

---

## Testing strategy

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

- **Unit tests** (`tests/unit/`): Pure functions — metric aggregation, date helpers, auth token utilities. No DB, no network. Fast.
- **Integration tests** (`tests/integration/`): API routes via `fetch` against a real test PostgreSQL DB. Seed → call route → assert response + DB state. No mocks for Prisma.
- **No frontend component tests** in this project — the UI is primarily data display; correctness is verified through the API layer.

Test file naming: `*.test.ts` for unit, `*.integration.test.ts` for integration.

Each integration test file:
1. Runs `prisma.$executeRaw` to truncate relevant tables in `beforeAll`
2. Seeds only what it needs
3. Cleans up in `afterAll`

Do not mock the GitHub API client in integration tests — use a recorded fixture or a dedicated test repo with a scoped PAT in CI secrets.

---

## Development setup

```bash
npm install
cp .env.example .env.local          # fill in DATABASE_URL, JWT_SECRET, GITHUB_PAT
npx prisma db push                  # apply schema
npx prisma db seed                  # load sample data
npm run dev                         # start on http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 random bytes, used to sign session tokens |
| `GITHUB_PAT` | Yes (dev) | Personal access token for GitHub API calls |
| `NODE_ENV` | No | Set to `production` to suppress stack traces |
| `PORT` | No | HTTP port (default: 3000 via Next.js) |

---

## MCP integration

DevPulse uses two MCP servers, configured in `.mcp.json` at the project root.

### Configuration

```json
// .mcp.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PAT}" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${PWD}"]
    }
  }
}
```

Set `GITHUB_PAT` in your shell environment (or `.env`) before launching Claude Code so the MCP server picks it up automatically.

### GitHub MCP server

Used during development to explore and validate GitHub API responses without writing throw-away scripts:

| MCP tool | Used for |
|---|---|
| `search_repositories` | Designed and tested the `/api/repos/search` autocomplete feature |
| `get_repository` | Validated repo metadata shape before writing `POST /api/repos/connect` |
| `list_commits` | Verified commit payload structure before writing the incremental sync |
| `list_pull_requests` | Confirmed PR field names (`created_at`, `merged_at`) used in the sync |

### Runtime feature: repo search autocomplete

The **Connect Repository** form (`src/components/repos/connect-repo-form.tsx`) includes a live search-as-you-type dropdown that queries `GET /api/repos/search?q=<query>`.

The search endpoint (`src/app/api/repos/search/route.ts`) uses the same `GITHUB_PAT` that the GitHub MCP server reads, so they share a single credential and consistent rate limit. This parallels what `search_repositories` does during development — the endpoint is effectively the runtime equivalent of the MCP tool.

- Search is debounced 300 ms (via `src/hooks/use-repo-search.ts`).
- Selecting a result auto-fills the **Owner** and **Repository** fields.
- Rate limit: 20 req/min per IP (server-side), plus GitHub's own 5,000 req/hr (authenticated).
- Gracefully degrades to 60 req/hr unauthenticated if `GITHUB_PAT` is absent.

### Filesystem MCP server

Provides Claude Code with direct read access to the project tree. Useful for referencing `prisma/schema.prisma`, `src/types/index.ts`, and route files while generating code without manual file reads.

---

## Scope boundaries — what this project does NOT include

- **No GitHub OAuth flow.** Users connect repos by pasting a personal access token. OAuth is a future concern.
- **No real-time / WebSocket updates.** Metrics are fetched on page load and on manual refresh. No polling, no live feed.
- **No multi-tenancy or organizations.** Each user sees only their own connected repos. There is no concept of a team or org shared workspace.
- **No CI/CD pipeline metrics.** This tracks commits and PRs only — not GitHub Actions runs, deployment status, or build times.
- **No code review quality metrics.** No comment counts, review turnaround time, or diff size analysis.
- **No mobile layout.** Tailwind responsive utilities may be used, but the dashboard is designed for desktop viewports (≥1024px).
- **No email notifications or webhooks.** Data sync is pull-only (user-initiated or scheduled cron).
- **No public-facing pages.** Every route except `/login` and `/register` requires authentication.
