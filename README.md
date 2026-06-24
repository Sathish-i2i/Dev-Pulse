# DevPulse

A developer analytics dashboard that connects to your GitHub repositories and surfaces commit frequency, PR throughput, and team activity over time — built for engineering teams who want visibility into development velocity without leaving their internal tooling.

**Stack:** Next.js 15 · TypeScript · PostgreSQL · Prisma · Tailwind CSS · Recharts · Vitest

---

## Quick Start

> From clone to running dashboard in under five minutes.

**Prerequisites:** Node.js 18+, PostgreSQL running locally

```bash
# 1. Clone and install
git clone https://github.com/Sathish-i2i/Dev-Pulse.git
cd Dev-Pulse
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET, and PAT_ENCRYPTION_KEY (see below)

# 3. Set up the database
npm run db:migrate     # apply schema migrations
npm run db:seed        # optional: load sample data

# 4. Start the dev server
npm run dev
```

Open **http://localhost:3000** and register an account to get started.

### Minimum required environment values

```bash
# .env — only these three are needed to boot locally
DATABASE_URL="postgresql://user:password@localhost:5432/devpulse"

# Any string ≥ 32 characters
SESSION_SECRET="local-dev-secret-at-least-32-chars!!"

# Exactly 64 hex chars (32 bytes) — generate with the command below
PAT_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
```

---

## Features

- **GitHub repo connect** — link any repo you have access to using a Personal Access Token; the PAT is encrypted at rest with AES-256-GCM
- **Incremental sync** — fetches commits and PR data from `lastSyncedAt` (or 30 days back on first sync); respects GitHub's 5,000 req/hr rate limit and aborts early when headroom is low
- **Repo search autocomplete** — live search-as-you-type dropdown backed by the GitHub Search API; debounced 300 ms
- **Dashboard** — aggregated commit counts, PR opens/merges, active days, and per-repo breakdowns across any date range (max 365 days)
- **Per-repo metrics** — time-series charts for commits, PRs, and contributor counts powered by Recharts
- **Session auth** — registration/login with bcrypt passwords; sessions stored as HMAC-SHA-256 token hashes, expire after 7 days; full logout
- **MCP integration** — GitHub and filesystem MCP servers pre-configured in `.mcp.json` for Claude Code development workflows

---

## Architecture

```
Browser
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│               Next.js 15 App Router (:3000)             │
│                                                         │
│  Middleware (src/middleware.ts)                          │
│  └── JWT-free session check via Bearer / cookie         │
│      Redirects unauthenticated → /login?from=<path>     │
│                                                         │
│  Pages (Server Components)                              │
│  ├── /login  /register                                  │
│  ├── /dashboard   ← Recharts, date-range picker         │
│  └── /repos       ← connect form, sync button          │
│                                                         │
│  API Routes (src/app/api/)                              │
│  ├── /auth/register  /auth/login  /auth/logout          │
│  ├── /repos          /repos/connect                     │
│  ├── /repos/search   (GitHub Search API autocomplete)   │
│  ├── /repos/[id]/sync  (incremental GitHub data fetch)  │
│  ├── /metrics/[id]   (per-repo time-series)             │
│  └── /dashboard      (cross-repo aggregation)          │
│                                                         │
│  Client Hooks (src/hooks/)                              │
│  └── useRepos · useDashboard · useRepoMetrics           │
│      useRepoSearch — all use fetchWithAuth()            │
│      (auto-redirect to /login on 401)                   │
└──────────────┬──────────────────────────────────────────┘
               │ Prisma ORM
               ▼
┌─────────────────────────────┐     ┌────────────────────┐
│        PostgreSQL           │     │   GitHub REST API   │
│                             │     │   (via Octokit)     │
│  User  Session  Repository  │     │                     │
│  Metric                     │     │  /repos  /commits   │
│                             │     │  /pulls  /stats     │
└─────────────────────────────┘     └────────────────────┘
```

---

## Project Structure

```
Dev-Pulse/
├── src/
│   ├── app/
│   │   ├── (auth)/              ← /login and /register pages
│   │   ├── dashboard/           ← main dashboard page
│   │   ├── repos/               ← repository management
│   │   └── api/                 ← all API route handlers
│   │       ├── auth/            ← register · login · logout
│   │       ├── repos/           ← list · connect · search
│   │       │   └── [repoId]/sync
│   │       ├── metrics/[repoId]
│   │       └── dashboard/
│   ├── components/
│   │   ├── charts/              ← Recharts wrappers (SSR-disabled)
│   │   ├── dashboard/           ← DashboardLayout · MetricCard
│   │   ├── repos/               ← ConnectRepoForm · RepoCard
│   │   └── ui/                  ← Button · Input · Badge · Modal
│   ├── hooks/                   ← use-dashboard · use-repos · use-repo-metrics · use-repo-search
│   ├── lib/
│   │   ├── auth.ts              ← session helpers, HMAC-SHA-256 token hashing
│   │   ├── encryption.ts        ← AES-256-GCM PAT encrypt/decrypt
│   │   ├── prisma.ts            ← PrismaClient singleton
│   │   ├── rate-limit.ts        ← sliding-window in-memory rate limiter
│   │   └── fetch-with-auth.ts   ← client fetch wrapper, auto-401 redirect
│   ├── middleware.ts             ← route protection, auth-page redirect
│   └── types/index.ts           ← Zod schemas + inferred TypeScript types
├── prisma/
│   ├── schema.prisma            ← User · Session · Repository · Metric
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/                    ← rate-limit · cn · middleware
│   ├── integration/             ← auth · repos · sync · search · security
│   └── setup.ts
├── docs/
│   ├── SECURITY-AUDIT.md        ← full audit with findings and fixes applied
│   └── SPEC.md                  ← original design spec
├── .claude/
│   └── commands/                ← /deploy-check · /security-scan · /add-feature
├── .github/workflows/ci.yml     ← test + build + security audit pipeline
├── .mcp.json                    ← GitHub + filesystem MCP servers for Claude Code
└── .env.example
```

---

## Data Model

```
User        id · email (unique) · passwordHash · name · createdAt
Session     id · userId → User · token (HMAC-SHA-256 hash) · expiresAt
Repository  id · githubId · owner · name · fullName · encryptedPat · userId → User · lastSyncedAt
Metric      id · repoId → Repository · date (@db.Date) · commits · prsOpened · prsMerged · contributors
            @@unique([repoId, date])   ← one row per repo per calendar day
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Create account, receive session token |
| `POST` | `/api/auth/login` | — | Exchange credentials for session token |
| `DELETE` | `/api/auth/logout` | ✓ | Invalidate current session |
| `GET` | `/api/repos` | ✓ | List your connected repositories |
| `POST` | `/api/repos/connect` | ✓ | Connect a GitHub repo via PAT |
| `GET` | `/api/repos/search?q=` | ✓ | GitHub repo autocomplete (debounced) |
| `POST` | `/api/repos/[repoId]/sync` | ✓ | Run incremental GitHub data sync |
| `GET` | `/api/metrics/[repoId]?from=&to=` | ✓ | Per-repo time-series metrics |
| `GET` | `/api/dashboard?from=&to=` | ✓ | Aggregated cross-repo summary |

All protected routes require `Authorization: Bearer <token>`. Non-owned resources return `404`, not `403` (IDOR hardening). Every endpoint has rate limiting; see `src/lib/rate-limit.ts`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `SESSION_SECRET` | ✓ | HMAC key for session tokens — minimum 32 characters |
| `PAT_ENCRYPTION_KEY` | ✓ | AES-256-GCM key — exactly 64 hex chars (32 bytes) |
| `DATABASE_URL_TEST` | tests | Separate DB for the test suite |
| `GITHUB_PAT` | recommended | PAT for repo search autocomplete + MCP server. Falls back to unauthenticated (60 req/hr). |
| `ALLOWED_ORIGIN` | production | CORS allowed origin. Defaults to `http://localhost:3000`. |
| `NODE_ENV` | — | Set to `production` to suppress stack traces |

Generate keys:

```bash
# SESSION_SECRET — any random string ≥ 32 chars
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"

# PAT_ENCRYPTION_KEY — must be exactly 64 hex chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Development

```bash
npm run dev            # start Next.js dev server with hot reload
npm run type-check     # tsc --noEmit (TypeScript strict mode)
npm test               # run all tests against a real PostgreSQL DB
npm run test:coverage  # tests + coverage report (80% threshold enforced)
npm run test:watch     # vitest watch mode

npm run db:migrate     # apply pending Prisma migrations
npm run db:seed        # seed sample repos and metrics
npm run db:studio      # open Prisma Studio in browser
npm run db:reset       # wipe and re-migrate (destructive)

npm run build          # production build
```

### Test database

Tests run against a real PostgreSQL instance (no mocks). Keep a separate test DB:

```bash
createdb devpulse_test
# set DATABASE_URL_TEST in .env
npm test
```

### Claude Code slash commands

Three project-specific commands are available in `.claude/commands/`:

| Command | Description |
|---------|-------------|
| `/deploy-check` | Pre-deployment checklist: type-check, coverage, build, `npm audit`, env vars, migrations, API surface |
| `/security-scan` | Full security audit — updates `docs/SECURITY-AUDIT.md` with any new findings and applies fixes in-place |
| `/add-feature` | Scaffold a new feature: Zod schema, API route, client hook, React component, and integration test |

---

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` runs on every push and pull request to `main`.

```
test  ──────────────────────────────────────────► build (needs: test)
│  PostgreSQL 16 service container               │  next build
│  npm run type-check                            │  prisma generate
│  prisma migrate deploy                         │
│  npm run test:coverage  (80% threshold)        security (independent)
│                                                │  npm audit --audit-level=high
```

> **Setup:** Add `SESSION_SECRET` and `PAT_ENCRYPTION_KEY` to GitHub repository secrets. The workflow uses safe fallback values if secrets are absent (test/dev only).

---

## MCP Integration

`.mcp.json` configures two MCP servers for Claude Code:

```json
{
  "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PAT}" } },
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "${PWD}"] }
  }
}
```

Set `GITHUB_PAT` in your shell before opening Claude Code. The same token is shared with the `/api/repos/search` runtime endpoint.

---

## Security

Key design decisions — full findings in [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md):

- Session tokens: `crypto.randomUUID()` → HMAC-SHA-256 with `SESSION_SECRET`; hash stored in DB, raw token returned to client once
- PATs: AES-256-GCM with a random 12-byte IV per encryption call; auth tag verified on decrypt
- All DB queries scope to `userId`; non-owned resources return `404` to avoid confirming existence
- Rate limiting on every endpoint (register: 5/min, login: 10/min, sync: 3/min per user, reads: 30/min)
- `bcrypt.compare` runs against a dummy hash for unknown emails to prevent timing-based user enumeration
- Security headers on all responses: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (production)

---

## License

MIT
