# DevPulse — Formal Specification

**Version:** 1.0  
**Date:** 2026-06-24  
**Stack:** Next.js 15 · TypeScript · Prisma · PostgreSQL · Tailwind CSS · Recharts · Octokit  

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Technical Design](#2-technical-design)
3. [Implementation Plan](#3-implementation-plan)
4. [Scope Boundaries](#4-scope-boundaries)
5. [Success Criteria](#5-success-criteria)
6. [Certification Rubric Cross-Reference](#6-certification-rubric-cross-reference)

---

## 1. Requirements

### 1.1 User Stories with Acceptance Criteria

---

#### AUTH-1 — User Registration

> As a developer, I want to register an account so I can connect my GitHub repos and view my analytics.

**Acceptance Criteria:**
- [ ] `POST /api/auth/register` accepts `{ email, password, name }`
- [ ] Password must be at least 8 characters; email must be a valid format
- [ ] Duplicate email returns `409 Conflict` with `{ error: "Email already registered" }`
- [ ] Invalid input returns `400 Bad Request` with field-level Zod error detail
- [ ] Successful registration returns `201` with `{ token, user: { id, email, name, createdAt } }`
- [ ] `passwordHash` is never present in any API response
- [ ] Password is stored as a bcrypt hash (10 rounds), never plaintext
- [ ] Rate limit: max 5 registration attempts per IP per minute; 6th returns `429` with `Retry-After` header

---

#### AUTH-2 — User Login

> As a registered user, I want to log in and receive a session token to authenticate subsequent requests.

**Acceptance Criteria:**
- [ ] `POST /api/auth/login` accepts `{ email, password }`
- [ ] Correct credentials return `200` with `{ token, user: { id, email, name, createdAt } }`
- [ ] Wrong password and unknown email both return `401` with the same message (prevents user enumeration)
- [ ] Rate limit: max 10 login attempts per IP per minute; excess returns `429`
- [ ] Token is a raw UUID; a SHA-256 hash of the token is stored in the Session table, never the raw value
- [ ] Token expires after 7 days (`expiresAt = now + 7d`)

---

#### AUTH-3 — User Logout

> As a logged-in user, I want to log out so my session is invalidated server-side.

**Acceptance Criteria:**
- [ ] `DELETE /api/auth/logout` requires a valid `Authorization: Bearer <token>` header
- [ ] Successful logout returns `204 No Content` and deletes the session row from the DB
- [ ] Calling logout with an already-expired or invalid token still returns `204` (idempotent)
- [ ] Using the same token after logout returns `401` on all protected endpoints

---

#### AUTH-4 — Protected Route Enforcement

> As the system, I want unauthenticated requests to protected routes to be rejected.

**Acceptance Criteria:**
- [ ] All `/dashboard` and `/repos` page routes redirect to `/login` when no valid session exists (enforced by `src/middleware.ts`)
- [ ] All API routes marked "Auth required" return `401` when `Authorization` header is absent or token is invalid/expired
- [ ] Middleware does not redirect `/api/*` routes (API routes return JSON 401, not HTML redirect)

---

#### REPO-1 — Connect a GitHub Repository

> As a user, I want to connect a GitHub repository using a Personal Access Token so DevPulse can fetch its metrics.

**Acceptance Criteria:**
- [ ] `POST /api/repos/connect` accepts `{ owner, name, pat }` with auth required
- [ ] DevPulse validates the PAT by calling GitHub's API before storing it; invalid PAT or inaccessible repo returns `404`
- [ ] PAT is stored AES-256-GCM encrypted at rest; raw PAT is never persisted or returned
- [ ] `encryptedPat` field is never present in any API response
- [ ] Connecting the same repo twice returns `409 Conflict`
- [ ] Successful connect returns `201` with `{ repo: { id, owner, name, fullName, lastSyncedAt, createdAt } }`

---

#### REPO-2 — List Connected Repositories

> As a user, I want to see all my connected repositories so I know what data is available.

**Acceptance Criteria:**
- [ ] `GET /api/repos` returns only repositories belonging to the authenticated user
- [ ] Response shape: `{ repos: Array<{ id, owner, name, fullName, lastSyncedAt, createdAt }> }`
- [ ] A user with zero repos receives `{ repos: [] }` (not 404)
- [ ] Repos owned by other users are never included in the response

---

#### REPO-3 — Sync Repository Metrics

> As a user, I want to trigger a sync for a repository so the latest GitHub data is reflected in my dashboard.

**Acceptance Criteria:**
- [ ] `POST /api/repos/[repoId]/sync` triggers an incremental GitHub data fetch
- [ ] Sync starts from `lastSyncedAt` (or 30 days ago if never synced)
- [ ] After sync, `repository.lastSyncedAt` is updated to the current timestamp
- [ ] Metric data is upserted (not duplicated) — syncing the same period twice is safe
- [ ] If GitHub rate limit is near exhaustion (`X-RateLimit-Remaining < 100`), sync aborts early and returns `{ rateLimited: true }`
- [ ] Syncing a repo not owned by the authenticated user returns `404`

---

#### METRICS-1 — View Per-Repository Metrics

> As a user, I want to view commit frequency and PR stats for a specific repository over a date range.

**Acceptance Criteria:**
- [ ] `GET /api/metrics/[repoId]?from=&to=` requires auth and a valid date range
- [ ] `from` must be before or equal to `to`; range must not exceed 365 days — violating either returns `400`
- [ ] Response: `{ metrics: Array<{ date, commits, prsOpened, prsMerged, contributors }> }` ordered by `date` ascending
- [ ] Requesting metrics for a repo not owned by the user returns `404` (not `403`)
- [ ] Days with no activity are included with zero values (gap-filled by the API)

---

#### METRICS-2 — View Aggregated Dashboard Metrics

> As a user, I want to see aggregated metrics across all my connected repos so I can understand my overall team velocity.

**Acceptance Criteria:**
- [ ] `GET /api/dashboard?from=&to=` requires auth
- [ ] Response includes:
  - `summary`: `{ totalCommits, totalPrsOpened, totalPrsMerged, avgDailyCommits, activeDays }`
  - `timeline`: day-by-day aggregation across all repos
  - `repos`: per-repo totals for the selected period
- [ ] Users with no connected repos receive a valid empty response (zeros, not an error)
- [ ] Same date range validation rules as METRICS-1

---

#### UI-1 — Dashboard Charts

> As a user, I want to see my metrics visualized as charts so I can spot trends at a glance.

**Acceptance Criteria:**
- [ ] Commit frequency rendered as an area chart (Recharts `AreaChart`)
- [ ] PR opened vs. merged rendered as a grouped bar chart (Recharts `BarChart`)
- [ ] Contributor count rendered as a line chart (Recharts `LineChart`)
- [ ] All charts show a loading skeleton while data is fetching
- [ ] All charts render correctly for date ranges with sparse data (gap-filled zeros, not broken axes)

---

#### UI-2 — Repository Selector and Date Range Filter

> As a user, I want to filter the dashboard by repository and date range so I can focus on relevant data.

**Acceptance Criteria:**
- [ ] A `RepoSelector` dropdown lets users switch between "All repos" and individual repos
- [ ] A `DateRangePicker` exposes 7-day, 30-day, 90-day presets plus custom from/to inputs
- [ ] Changing either filter refetches data without a full page reload
- [ ] Selected filters persist within the session (not across sessions)

---

#### UI-3 — Connect Repository Form

> As a user, I want a form to connect a new GitHub repo by entering its owner, name, and PAT.

**Acceptance Criteria:**
- [ ] Form fields: `owner`, `name`, `pat` (PAT rendered as password input, never shown)
- [ ] Client-side validation prevents submission with empty fields
- [ ] Server-side errors (invalid PAT, repo not found, duplicate) are displayed inline below the form
- [ ] Successful connection adds the repo to the list without a full page reload

---

### 1.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | API response time (p95) under normal load | < 300 ms |
| NFR-2 | Type safety | Zero TypeScript errors (`tsc --noEmit` passes) |
| NFR-3 | No secrets in responses | `passwordHash`, `encryptedPat`, `Session.token` never returned |
| NFR-4 | Startup fails if required env vars absent | Fatal error thrown at module load time |
| NFR-5 | Test coverage | All API routes have at least one integration test |
| NFR-6 | Rate limiting on auth endpoints | 429 returned when limits exceeded |

---

## 2. Technical Design

### 2.1 Data Model Diagram

```
┌─────────────────────────────────┐
│              User               │
│─────────────────────────────────│
│ id           String  @id cuid() │
│ email        String  @unique    │
│ passwordHash String             │
│ name         String             │
│ createdAt    DateTime           │
│ updatedAt    DateTime           │
└──────────┬──────────────────────┘
           │ 1
           │
    ┌──────┴───────┐
    │              │
    │ N            │ N
    ▼              ▼
┌──────────────┐  ┌────────────────────────────────────┐
│   Session    │  │            Repository              │
│──────────────│  │────────────────────────────────────│
│ id    cuid() │  │ id           String  @id cuid()    │
│ userId  FK→U │  │ githubId     String                │
│ token   hash │  │ owner        String                │
│ expiresAt    │  │ name         String                │
│ createdAt    │  │ fullName     String                │
└──────────────┘  │ encryptedPat String  (AES-256-GCM) │
                  │ userId       FK→User               │
                  │ lastSyncedAt DateTime?             │
                  │ createdAt    DateTime              │
                  │                                    │
                  │ @@unique([userId, githubId])        │
                  └───────────────┬────────────────────┘
                                  │ 1
                                  │
                                  │ N
                                  ▼
                  ┌────────────────────────────────────┐
                  │              Metric                │
                  │────────────────────────────────────│
                  │ id           String  @id cuid()    │
                  │ repoId       FK→Repository         │
                  │ date         DateTime  @db.Date    │
                  │ commits      Int  @default(0)      │
                  │ prsOpened    Int  @default(0)      │
                  │ prsMerged    Int  @default(0)      │
                  │ contributors Int  @default(0)      │
                  │                                    │
                  │ @@unique([repoId, date])            │
                  │ @@index([repoId, date])             │
                  └────────────────────────────────────┘
```

**Key design decisions:**
- `Session.token` stores SHA-256 hash only. Raw UUID returned to client once at login, never stored.
- `Repository.encryptedPat` stores `base64(JSON{iv, ciphertext, tag})` — decrypted only inside `src/lib/github.ts`.
- `@@unique([repoId, date])` enforces one metric row per repo per day at the database level; sync uses `upsert`.
- `onDelete: Cascade` on all FK relations — deleting a user cleans up sessions, repos, and metrics.

---

### 2.2 API Contracts

#### Authentication

```
POST /api/auth/register
  Body:     { email: string, password: string (min 8), name: string }
  Success:  201 { token: string, user: { id, email, name, createdAt } }
  Errors:   400 (validation), 409 (email taken), 429 (rate limit)

POST /api/auth/login
  Body:     { email: string, password: string }
  Success:  200 { token: string, user: { id, email, name, createdAt } }
  Errors:   400 (validation), 401 (invalid credentials), 429 (rate limit)

DELETE /api/auth/logout
  Headers:  Authorization: Bearer <token>
  Success:  204 (no body)
  Errors:   401 (missing/invalid token)
```

#### Repositories

```
GET /api/repos
  Headers:  Authorization: Bearer <token>
  Success:  200 { repos: RepoSummary[] }
  Errors:   401

POST /api/repos/connect
  Headers:  Authorization: Bearer <token>
  Body:     { owner: string, name: string, pat: string (min 10) }
  Success:  201 { repo: RepoSummary }
  Errors:   400 (validation), 401, 404 (repo not found / PAT invalid), 409 (already connected)

POST /api/repos/[repoId]/sync
  Headers:  Authorization: Bearer <token>
  Success:  200 { synced: true, days: number } | { rateLimited: true }
  Errors:   401, 404 (not owned)
```

#### Metrics

```
GET /api/metrics/[repoId]?from=<ISO>&to=<ISO>
  Headers:  Authorization: Bearer <token>
  Params:   from, to — ISO 8601 datetime strings; range ≤ 365 days
  Success:  200 { metrics: MetricRow[] }   -- ordered by date asc, gap-filled
  Errors:   400 (invalid range), 401, 404 (not owned)

GET /api/dashboard?from=<ISO>&to=<ISO>
  Headers:  Authorization: Bearer <token>
  Params:   from, to — ISO 8601 datetime strings; range ≤ 365 days
  Success:  200 {
              summary: { totalCommits, totalPrsOpened, totalPrsMerged, avgDailyCommits, activeDays },
              timeline: MetricRow[],
              repos: Array<RepoSummary & { commits, prsOpened, prsMerged }>
            }
  Errors:   400, 401
```

**Shared types:**
```typescript
type RepoSummary = { id: string; owner: string; name: string; fullName: string; lastSyncedAt: string | null; createdAt: string }
type MetricRow   = { date: string; commits: number; prsOpened: number; prsMerged: number; contributors: number }
```

---

### 2.3 Component Tree

```
app/
├── layout.tsx                         Root layout — font, <html lang="en">
│
├── (auth)/
│   ├── login/page.tsx                 "use client"
│   │   └── <LoginForm>
│   │       ├── <Input> (email)
│   │       ├── <Input> (password, type=password)
│   │       └── <Button> (submit, isLoading)
│   └── register/page.tsx             "use client"
│       └── <RegisterForm>
│           ├── <Input> (name)
│           ├── <Input> (email)
│           ├── <Input> (password)
│           └── <Button> (submit, isLoading)
│
├── dashboard/page.tsx                 Server Component → hydrates DashboardLayout
│   └── <DashboardLayout>             "use client" { selectedRepoId, dateRange, ... }
│       ├── <RepoSelector>            { repos, selectedId, onChange }
│       ├── <DateRangePicker>         { value, onChange, presets }
│       ├── <MetricCard> ×4           { label, value, delta?, isLoading }
│       ├── <CommitFrequencyChart>    dynamic(ssr:false) { data, isLoading, height }
│       ├── <PRStatsChart>            dynamic(ssr:false) { data, isLoading, height }
│       ├── <ContributorChart>        dynamic(ssr:false) { data, isLoading, height }
│       └── <ActivityFeed>            { items, isLoading }
│
└── repos/page.tsx                     Server Component → hydrates RepoList
    └── <RepoList>                    "use client"
        ├── <RepoCard> ×N             { repo, onSync, isSyncing }
        └── <Modal>                   { isOpen, onClose, title }
            └── <ConnectRepoForm>     { onSuccess }
                ├── <Input> (owner)
                ├── <Input> (name)
                ├── <Input> (pat, type=password)
                └── <Button> (submit, isLoading)
```

**Client/Server boundary rules:**
- Default to Server Components. Add `"use client"` only for: form state, event handlers, browser APIs, Recharts.
- All three chart components require `dynamic(() => import(...), { ssr: false })` — Recharts uses `window`.
- Hooks (`use-dashboard`, `use-repos`, `use-repo-metrics`) are client-only; they read the Bearer token from `localStorage`.

---

### 2.4 Key Library Modules

| File | Exports | Notes |
|------|---------|-------|
| `src/lib/prisma.ts` | `prisma` singleton | `globalThis` pattern; standard `PrismaClient` (not adapter-based) |
| `src/lib/auth.ts` | `generateToken`, `hashToken`, `getSessionUser` | Startup check: `SESSION_SECRET ≥ 32 chars` or fatal error |
| `src/lib/encryption.ts` | `encryptPat`, `decryptPat` | AES-256-GCM; startup check: `PAT_ENCRYPTION_KEY` = 64 hex chars |
| `src/lib/github.ts` | `createGitHubClient`, `validateRepo`, `fetchCommits`, `fetchPullRequests`, `fetchContributors` | Wraps `@octokit/rest`; reads rate limit header |
| `src/lib/metrics.ts` | `syncRepoMetrics`, `aggregateByDate`, `fillDateGaps`, `calcPercentDelta` | Incremental sync logic; day-grouped upserts |
| `src/lib/rate-limit.ts` | `rateLimit(ip, key, max, windowMs)` | In-memory sliding window; swap Map for Redis in production |

---

### 2.5 Security Architecture

```
Client                    Next.js Server                    PostgreSQL
  │                            │                                │
  │  POST /api/auth/login       │                                │
  │ ─────────────────────────► │                                │
  │                            │  bcrypt.compare(pw, hash)      │
  │                            │  crypto.randomUUID() → rawToken│
  │                            │  SHA-256(rawToken) → hashToken │
  │                            │ ──────────────────────────────►│
  │                            │  INSERT Session(token=hash)    │
  │  { token: rawToken }       │ ◄──────────────────────────────│
  │ ◄───────────────────────── │                                │
  │                            │                                │
  │  GET /api/dashboard        │                                │
  │  Authorization: Bearer raw │                                │
  │ ─────────────────────────► │                                │
  │                            │  SHA-256(raw) → hash           │
  │                            │  SELECT Session WHERE          │
  │                            │    token=hash AND              │
  │                            │    expiresAt > now             │
  │                            │ ──────────────────────────────►│
  │                            │ ◄──────────────────────────────│
  │  { summary, timeline }     │  session.user attached         │
  │ ◄───────────────────────── │                                │
```

---

## 3. Implementation Plan

### Phase 0 — Project Scaffolding
**Estimate: 2–3 hours**

| File | Purpose |
|------|---------|
| `package.json` | All dependencies declared |
| `tsconfig.json` | `strict: true`, `moduleResolution: "bundler"`, `paths: { "@/*": ["./src/*"] }` |
| `next.config.ts` | CORS headers (`ALLOWED_ORIGIN`), no other options initially |
| `tailwind.config.ts` | Extend theme with brand colors; configure `content` paths |
| `postcss.config.mjs` | `@tailwindcss/postcss` plugin |
| `vitest.config.ts` | `environment: "node"`, single-thread pool, 10s timeout, `setupFiles` |
| `.env.example` | All required env vars with placeholder values |
| `src/app/globals.css` | Tailwind directives + CSS variables |
| `src/app/layout.tsx` | Root layout with font |

---

### Phase 1 — Data Layer
**Estimate: 2–3 hours**

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Full schema (User, Session, Repository, Metric) |
| `prisma/seed.ts` | 1 test user + 2 repos + 30 days of realistic metric data |
| `src/lib/prisma.ts` | Prisma client singleton |

Commands:
```bash
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```

---

### Phase 2 — Auth System
**Estimate: 3–4 hours**

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Token generation, hashing, session lookup |
| `src/lib/encryption.ts` | AES-256-GCM PAT encrypt/decrypt |
| `src/lib/rate-limit.ts` | Sliding-window rate limiter |
| `src/app/api/auth/register/route.ts` | Register handler |
| `src/app/api/auth/login/route.ts` | Login handler |
| `src/app/api/auth/logout/route.ts` | Logout handler |
| `src/middleware.ts` | Protect `/dashboard` and `/repos` page routes |
| `src/types/index.ts` | Shared TypeScript types |
| `tests/unit/auth.test.ts` | Token generation + hashing unit tests |
| `tests/unit/encryption.test.ts` | Encrypt/decrypt unit tests |
| `tests/integration/auth.integration.test.ts` | Full auth flow integration tests |

---

### Phase 3 — Repos + GitHub Integration
**Estimate: 3–4 hours**

| File | Purpose |
|------|---------|
| `src/lib/github.ts` | Octokit wrapper + PAT validation |
| `src/app/api/repos/route.ts` | GET list handler |
| `src/app/api/repos/connect/route.ts` | POST connect handler |
| `tests/fixtures/github/*.json` | Recorded Octokit responses |
| `tests/integration/repos.integration.test.ts` | Repos integration tests |

---

### Phase 4 — Metrics Sync
**Estimate: 4–5 hours** *(highest complexity)*

| File | Purpose |
|------|---------|
| `src/lib/metrics.ts` | Incremental sync, day-grouping, upsert logic |
| `src/app/api/repos/[repoId]/sync/route.ts` | Sync trigger endpoint |
| `tests/unit/metrics.test.ts` | Aggregation + gap-fill unit tests |

---

### Phase 5 — Dashboard API
**Estimate: 2–3 hours**

| File | Purpose |
|------|---------|
| `src/app/api/metrics/[repoId]/route.ts` | Per-repo metrics endpoint |
| `src/app/api/dashboard/route.ts` | Aggregated dashboard endpoint |
| `tests/integration/metrics.integration.test.ts` | Metrics integration tests |
| `tests/integration/dashboard.integration.test.ts` | Dashboard integration tests |

---

### Phase 6 — Frontend: Auth Pages + UI Primitives
**Estimate: 2–3 hours**

| File | Purpose |
|------|---------|
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/app/(auth)/register/page.tsx` | Register page |
| `src/components/ui/button.tsx` | Button primitive |
| `src/components/ui/input.tsx` | Input primitive |
| `src/components/ui/badge.tsx` | Badge primitive |
| `src/components/ui/modal.tsx` | Modal primitive |

---

### Phase 7 — Frontend: Dashboard + Charts
**Estimate: 4–5 hours**

| File | Purpose |
|------|---------|
| `src/app/dashboard/page.tsx` | Server Component shell |
| `src/components/dashboard/dashboard-layout.tsx` | Client layout with state |
| `src/components/dashboard/metric-card.tsx` | KPI card |
| `src/components/dashboard/activity-feed.tsx` | Recent activity list |
| `src/components/dashboard/date-range-picker.tsx` | Date filter |
| `src/components/charts/commit-frequency-chart.tsx` | Recharts AreaChart |
| `src/components/charts/pr-stats-chart.tsx` | Recharts BarChart |
| `src/components/charts/contributor-chart.tsx` | Recharts LineChart |
| `src/hooks/use-dashboard.ts` | Dashboard data hook |

---

### Phase 8 — Frontend: Repos Management
**Estimate: 3–4 hours**

| File | Purpose |
|------|---------|
| `src/app/repos/page.tsx` | Server Component shell |
| `src/components/repos/repo-card.tsx` | Individual repo with Sync button |
| `src/components/repos/connect-repo-form.tsx` | Connect repo form |
| `src/components/repos/repo-selector.tsx` | Dashboard repo selector |
| `src/hooks/use-repos.ts` | Repos data hook |
| `src/hooks/use-repo-metrics.ts` | Per-repo metrics hook |

---

### Phase 9 — MCP Integration + AI Analysis
**Estimate: 2–3 hours**

| File | Purpose |
|------|---------|
| `.claude/settings.json` | GitHub MCP server config |
| `src/app/api/repos/[repoId]/analyze/route.ts` | Optional: AI insight via Anthropic SDK |

---

### Phase 10 — Testing + Security Hardening
**Estimate: 3–4 hours**

| Activity | Detail |
|----------|--------|
| Security integration tests | `tests/integration/security.integration.test.ts` — IDOR, rate limit, malformed tokens |
| Audit Prisma `select` clauses | Confirm `passwordHash`, `encryptedPat`, `Session.token` absent from all responses |
| Startup env validation test | Spawn server process without `SESSION_SECRET`, assert non-zero exit |
| `npm audit` | Resolve any high/critical CVEs |
| Coverage check | `npm run test:coverage` — all API routes covered |

---

### Phase 11 — CI/CD
**Estimate: 1–2 hours**

File: `.github/workflows/ci.yml`

Pipeline stages:
1. **test** — PostgreSQL service container → `prisma migrate deploy` → `npm run type-check` → `npm test --coverage`
2. **build** — `npm run build` (verifies production build succeeds)
3. **security** — `npm audit --audit-level=high`

---

### Summary Table

| Phase | Description | Estimate | Depends on |
|-------|-------------|----------|------------|
| 0 | Scaffolding | 2–3 h | — |
| 1 | Data layer | 2–3 h | 0 |
| 2 | Auth system | 3–4 h | 1 |
| 3 | Repos + GitHub | 3–4 h | 2 |
| 4 | Metrics sync | 4–5 h | 3 |
| 5 | Dashboard API | 2–3 h | 4 |
| 6 | Frontend auth | 2–3 h | 5 |
| 7 | Dashboard UI | 4–5 h | 5 |
| 8 | Repos UI | 3–4 h | 5 |
| 9 | MCP + AI | 2–3 h | 3 |
| 10 | Test + security | 3–4 h | 8 |
| 11 | CI/CD | 1–2 h | 10 |
| | **Total** | **31–43 h** | |

Phases 6, 7, and 8 can proceed in parallel after Phase 5. Phase 9 and 11 are independent after Phase 3.

---

## 4. Scope Boundaries

### 4.1 Explicitly Excluded

The following are deliberate out-of-scope decisions, not omissions. They exist to bound the project to a shippable scope.

| # | Feature | Reason excluded |
|---|---------|-----------------|
| 1 | **GitHub OAuth flow** | Users connect repos via Personal Access Token (PAT). OAuth adds significant complexity (callback routes, token refresh, state management) with no additional data access for this use case. |
| 2 | **Real-time / WebSocket updates** | Metrics are fetched on page load and on manual sync. Live push requires a persistent connection layer (Socket.io, SSE, or a separate service) that is disproportionate to the data freshness requirements. |
| 3 | **Multi-tenancy / Organization workspaces** | Each user sees only their own repos. Shared team workspaces require a Group/Member data model, access control lists, and invite flows — out of scope for v1. |
| 4 | **CI/CD pipeline metrics** | No GitHub Actions run status, deployment frequency, or build time tracking. These require different GitHub API endpoints and a distinct data model. |
| 5 | **Code review quality metrics** | No PR comment counts, review turnaround time, or diff size. These would require the GitHub GraphQL API and a more complex aggregation layer. |
| 6 | **Mobile layout** | The dashboard is designed for desktop viewports (≥ 1024px). Tailwind responsive classes may be used incidentally, but no deliberate mobile design pass. |
| 7 | **Email notifications and webhooks** | No "weekly digest" email, no GitHub webhook listener. All data sync is pull-only, user-initiated. |
| 8 | **Background cron / scheduled sync** | No automatic periodic sync. Users trigger sync manually via the UI. Removes need for a job queue or cron infrastructure. |
| 9 | **Public-facing pages** | Every route except `/login` and `/register` requires authentication. There are no public repo pages or shareable dashboards. |
| 10 | **Password reset / forgot password flow** | No email delivery integration in scope. Users must re-register if they lose access. |
| 11 | **Account management (change email/password)** | No settings page for profile updates in v1. |
| 12 | **Redis-backed rate limiting** | Rate limiter uses an in-memory Map. Adequate for a single-process deployment; multi-instance deployments would need Redis, which is a deployment concern beyond this scope. |

### 4.2 Deferred (Possible v2)

- GitHub OAuth with token refresh
- Scheduled background sync via cron
- Team workspaces and member invites
- Shareable public dashboard links
- Mobile-responsive layout
- PR review quality metrics
- Email digest notifications

---

## 5. Success Criteria

### 5.1 Functional Completeness

The project is complete when all of the following hold:

- [ ] All 13 acceptance criteria across AUTH-1 through UI-3 pass
- [ ] `npm run type-check` exits 0 (zero TypeScript errors)
- [ ] `npm test` exits 0 (all unit and integration tests pass)
- [ ] `npm run build` exits 0 (production build succeeds)
- [ ] `npm audit --audit-level=high` exits 0 (no high/critical CVEs)

### 5.2 End-to-End Verification Flow

Run these steps manually after Phase 8:

```
1. Start server
   npm run dev
   → Server starts on port 3000
   → No startup errors (env var checks pass)

2. Register
   POST /api/auth/register { email, password, name }
   → 201, token returned, user.passwordHash absent

3. Login with same credentials
   POST /api/auth/login { email, password }
   → 200, fresh token returned

4. Connect a repository
   POST /api/repos/connect { owner, name, pat }
   → 201, repo created
   → Verify: SELECT encryptedPat FROM Repository — not null, not the raw PAT

5. Trigger sync
   POST /api/repos/[repoId]/sync
   → 200 { synced: true, days: N }
   → Verify: SELECT * FROM Metric WHERE repoId=... — rows present

6. View dashboard
   GET /api/dashboard?from=...&to=...
   → 200, summary.totalCommits > 0
   → Timeline rows match date range

7. Logout
   DELETE /api/auth/logout
   → 204

8. Use old token on protected endpoint
   GET /api/repos   Authorization: Bearer <old token>
   → 401

9. IDOR check
   Register second user, connect a repo
   Use first user's token to GET /api/metrics/[second-user-repoId]
   → 404 (not 403)
```

### 5.3 Security Checklist

Before marking the project complete, verify:

- [ ] `SESSION_SECRET` env var absent → server refuses to start (non-zero exit)
- [ ] `PAT_ENCRYPTION_KEY` env var absent → server refuses to start
- [ ] Raw session token is not present in any DB row (only SHA-256 hash)
- [ ] `encryptedPat` column is not readable as plaintext (base64 AES-GCM blob)
- [ ] `passwordHash` never appears in any API JSON response
- [ ] `encryptedPat` never appears in any API JSON response
- [ ] `Session.token` (hash) never appears in any API JSON response
- [ ] 6th registration attempt from same IP returns 429
- [ ] CORS: `Access-Control-Allow-Origin` is not `*` in production config

---

## 6. Certification Rubric Cross-Reference

The following table maps certification grading criteria to the specific implementation artifacts that satisfy each requirement.

| Rubric Category | Criterion | Satisfied by |
|----------------|-----------|--------------|
| **AI-Assisted Development** | Uses Claude/AI tooling throughout development | Claude Code used for planning (this SPEC.md), scaffolding, code generation, and review across all phases |
| **AI-Assisted Development** | MCP server integration | `Dev-Pulse/.claude/settings.json` — GitHub MCP server; optional AI analysis endpoint in Phase 9 (`/api/repos/[repoId]/analyze`) |
| **Full-Stack Architecture** | Frontend framework (React/Next.js) | Next.js 15 App Router with Server and Client Components; pages in `src/app/` |
| **Full-Stack Architecture** | Backend API | Next.js route handlers in `src/app/api/`; 8 endpoints covering auth, repos, metrics |
| **Full-Stack Architecture** | Database with ORM | Prisma + PostgreSQL; 4 models with relations, indexes, and constraints |
| **Full-Stack Architecture** | Authentication | Session-token auth: bcrypt hashing, SHA-256 token storage, `src/middleware.ts` route protection |
| **TypeScript** | Strict TypeScript throughout | `tsconfig.json` with `strict: true`; Zod schemas inferred via `z.infer<>`; zero `any` types |
| **Testing** | Unit tests | `tests/unit/` — auth helpers, encryption round-trips, metric aggregation logic |
| **Testing** | Integration tests | `tests/integration/` — real PostgreSQL DB, no Prisma mocks; covers all API routes |
| **Testing** | Test coverage | All 8 API route groups have at least one integration test file |
| **Security** | Input validation | Zod `safeParse` at every API boundary; field-level errors returned on 400 |
| **Security** | Auth enforcement | `requireAuth` equivalent in `getSessionUser`; every protected route checks session |
| **Security** | Secrets management | `SESSION_SECRET` and `PAT_ENCRYPTION_KEY` fail startup if absent; no hardcoded fallbacks |
| **Security** | IDOR prevention | All repo/metric queries scoped to `userId`; non-owned resources return 404 |
| **Security** | Rate limiting | Auth endpoints rate-limited via `src/lib/rate-limit.ts`; 429 with `Retry-After` |
| **Security** | Sensitive data | `passwordHash`, `encryptedPat`, session token hash never in API responses |
| **Data Design** | Normalized schema | 4 tables, no denormalization; FK constraints with cascade deletes |
| **Data Design** | Efficient queries | `@@index([repoId, date])` on Metric; `@@unique` constraints prevent duplicates at DB level |
| **GitHub Integration** | External API integration | `src/lib/github.ts` wraps Octokit; PAT-based auth; incremental sync from `lastSyncedAt` |
| **GitHub Integration** | Rate limit awareness | Sync aborts when `X-RateLimit-Remaining < 100`; returns `{ rateLimited: true }` |
| **CI/CD** | Automated pipeline | `.github/workflows/ci.yml` — test → build → security stages; PostgreSQL service container |
| **Code Quality** | Consistent conventions | CLAUDE.md conventions enforced: kebab-case files, PascalCase components, `cn()` for styles, no `console.log` in handlers |
| **Documentation** | Architecture documented | `CLAUDE.md` (developer guide), `docs/SPEC.md` (this document) |
| **Scope Management** | Clear boundaries | Section 4 enumerates 12 explicit exclusions with justification |
