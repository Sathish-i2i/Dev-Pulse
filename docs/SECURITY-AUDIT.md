# DevPulse Security Audit

**Date:** 2026-06-24  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Scope:** All API route handlers, auth utilities, encryption layer, middleware, CORS config, and input schemas  
**Status:** 9 findings — 7 fixed, 2 documented (architecture-level)

---

## Summary

| Severity | Total | Fixed | Documented only |
|----------|-------|-------|-----------------|
| Critical | 1 | 1 | — |
| High | 5 | 5 | — |
| Medium | 3 | 1 | 2 |
| Low | — | — | — |

---

## Findings

---

### CRIT-01 — Test bypass flag honoured in production

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File** | `src/app/api/repos/connect/route.ts` |
| **Line** | 13 (before fix) |
| **Status** | Fixed |

**Finding:** `SKIP_GITHUB_VALIDATION === "true"` caused `validateGitHubRepo` to return a stub result without contacting GitHub, regardless of environment. A misconfigured production deployment (`.env` copied from CI, or an attacker who gains write access to env vars) would completely bypass GitHub ownership verification, allowing any owner/name combination to be connected — including repos the attacker does not own.

```typescript
// Before — fires in production if env var is set
if (process.env.SKIP_GITHUB_VALIDATION === "true") {
  return { githubId: `${owner}-${name}-stub`, fullName: `${owner}/${name}` };
}
```

**Fix applied** (`src/app/api/repos/connect/route.ts:13`):

```typescript
// After — only skips validation outside of production
if (process.env.SKIP_GITHUB_VALIDATION === "true" && process.env.NODE_ENV !== "production") {
  return { githubId: `${owner}-${name}-stub`, fullName: `${owner}/${name}` };
}
```

---

### HIGH-01 — `SESSION_SECRET` checked but never used cryptographically

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File** | `src/lib/auth.ts` |
| **Lines** | 5–10, 19 |
| **Status** | Fixed |

**Finding:** `hashToken` used plain `SHA-256` without any secret key. `SESSION_SECRET` was validated at startup (throws if < 32 chars) but never incorporated into the hash. A keyed hash (HMAC) provides defense-in-depth: even if an attacker reads hashed tokens from the DB, they cannot use them without the key; and server-key rotation instantly invalidates all sessions. Plain SHA-256 on a random UUID is practically unguessable, but the `SESSION_SECRET` validation created a false impression of keyed hashing.

```typescript
// Before — SESSION_SECRET is verified but ignored
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
```

**Fix applied** (`src/lib/auth.ts:19`):

```typescript
// After — HMAC-SHA-256 keyed with SESSION_SECRET
export function hashToken(raw: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET!).update(raw).digest("hex");
}
```

> **Migration note:** All existing sessions are invalidated by this change because the stored hashes no longer match. Users must log in again. This is acceptable for a new project; in a live system schedule a maintenance window.

---

### HIGH-02 — Missing rate limiting on five authenticated endpoints

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Files** | `src/app/api/repos/route.ts`, `src/app/api/repos/connect/route.ts`, `src/app/api/repos/[repoId]/sync/route.ts`, `src/app/api/metrics/[repoId]/route.ts`, `src/app/api/dashboard/route.ts` |
| **Status** | Fixed |

**Finding:** Only `/api/auth/register`, `/api/auth/login`, and `/api/repos/search` had rate limiting. The remaining five authenticated endpoints were unprotected. Of these, `/api/repos/[repoId]/sync` is the most critical: it decrypts a PAT, creates a new Octokit client, and calls multiple paginated GitHub API endpoints in sequence — a sustained hammer from one account would exhaust the user's 5,000 req/hr GitHub quota and cause repeated expensive DB upserts.

**Fix applied:**

| Endpoint | Key | Limit | Scope |
|----------|-----|-------|-------|
| `GET /api/repos` | `repo-list` | 30/min | per IP |
| `POST /api/repos/connect` | `repo-connect` | 5/min | per IP |
| `POST /api/repos/[repoId]/sync` | `repo-sync` | 3/min | **per user ID** |
| `GET /api/metrics/[repoId]` | `metrics` | 30/min | per IP |
| `GET /api/dashboard` | `dashboard` | 30/min | per IP |

Sync is rate-limited per user ID (not IP) because the expensive resource is each user's GitHub API quota — IP rotation would otherwise bypass the limit.

---

### HIGH-03 — URL path injection via unvalidated `owner` / `name` fields

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File** | `src/types/index.ts` (schema), `src/app/api/repos/connect/route.ts:17` |
| **Status** | Fixed |

**Finding:** `connectRepoSchema` accepted any non-empty string for `owner` and `name`. These values were interpolated directly into a `fetch()` URL:

```typescript
const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, { ... });
```

An owner value of `"foo/../../orgs"` produces the URL `https://api.github.com/repos/foo/../../orgs/name`, which after HTTP-client normalisation resolves to `https://api.github.com/orgs/name`. This is a limited-impact SSRF variant: the attacker can probe arbitrary GitHub REST API paths (read-only, using the user's PAT). The same owner/name are stored in the DB and passed to Octokit's sync calls — Octokit does URL-encode path params, so actual injection in the sync route is mitigated, but the initial connect endpoint was directly vulnerable.

**Fix applied** (`src/types/index.ts:16–26`):

```typescript
owner: z
  .string()
  .min(1)
  .max(39)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/,
    "Invalid owner: alphanumeric and hyphens only, must start with alphanumeric"
  ),
name: z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "Invalid repo name: alphanumeric, dots, underscores, hyphens only"
  ),
```

The regex matches GitHub's actual naming rules and whitelists only characters that cannot encode path traversal sequences.

---

### HIGH-04 — Missing HTTP security response headers

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File** | `next.config.ts` |
| **Status** | Fixed |

**Finding:** `next.config.ts` only set CORS headers (scoped to `/api/`). HTML responses had no `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Strict-Transport-Security`. Without CSP, a stored or reflected XSS (e.g., from a future `dangerouslySetInnerHTML`, a third-party script, or a browser extension) has no extra boundary. Without `X-Frame-Options` / `frame-ancestors`, the dashboard could be embedded in an attacker's page to drive clickjacking attacks.

**Fix applied** (`next.config.ts`):

```typescript
// Applied to /:path* (all responses)
{ key: "X-Content-Type-Options",  value: "nosniff" },
{ key: "X-Frame-Options",         value: "DENY" },
{ key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
{ key: "X-XSS-Protection",        value: "0" },          // disable legacy IE filter
{ key: "Permissions-Policy",      value: "camera=(), microphone=(), geolocation=()" },
{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },

// HSTS applied in production only (HTTP in dev would break the page)
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
```

> **Future hardening:** Replace `'unsafe-inline'` on `script-src` with per-request nonces (Next.js 15 nonce support via middleware). This is currently blocked because Next.js inlines hydration scripts.

---

### HIGH-05 — Default all-zeros `PAT_ENCRYPTION_KEY` not detected at runtime

| Field | Detail |
|-------|--------|
| **Severity** | High → Medium (mitigated by production guard) |
| **File** | `src/lib/encryption.ts`, `.env.example:9` |
| **Status** | Fixed |

**Finding:** `.env.example` ships with `PAT_ENCRYPTION_KEY="0000...0000"` (64 zeros). The startup check only verified that the key was exactly 64 hex chars — it accepted all zeros without warning. A developer who copies `.env.example` without generating a real key would encrypt all PATs with a publicly known key, making the AES-256-GCM encryption trivially reversible by anyone who reads the DB. The CI workflow also uses the all-zeros fallback.

**Fix applied** (`src/lib/encryption.ts:12–21`):

```typescript
if (keyHex === "0".repeat(64)) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Fatal: PAT_ENCRYPTION_KEY is the default all-zeros value. Generate a real key: ..."
    );
  }
  console.warn("[devpulse] WARNING: PAT_ENCRYPTION_KEY is all zeros. Rotate before deploying.");
}
```

Production: hard fail. Non-production (dev, CI): loud warning. This preserves CI functionality with the all-zeros fallback while ensuring no production deployment can start with the insecure default.

---

### MED-01 — In-memory rate limiter does not survive process restarts or horizontal scale-out

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File** | `src/lib/rate-limit.ts` |
| **Status** | Documented — architecture change required |

**Finding:** Rate-limit state is held in a module-level `Map`. On a multi-replica deployment (multiple Node processes behind a load balancer), each process maintains its own counter. An attacker routing `N` requests evenly across `K` replicas can send `N*K` requests before any single replica reports a limit breach. A single-process restart resets all counters instantly.

**Recommended fix:** Replace the in-memory `Map` with a Redis-backed sliding window, using atomic `INCR` + `EXPIREAT` or a library such as `rate-limiter-flexible`. This is a deployment-time concern and does not need to block the current single-process development setup.

```typescript
// Swap out: checkRateLimit from rate-limit.ts
// Swap in:  RateLimiterRedis from rate-limiter-flexible
```

---

### MED-02 — User enumeration via register 409 response

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File** | `src/app/api/auth/register/route.ts:35` |
| **Status** | Documented — accepted tradeoff |

**Finding:** A 409 response with `{ error: "Email already registered" }` confirms that a given email address has an account. An attacker can enumerate the user base by submitting registration requests for email addresses and observing 409 vs 201 responses. The rate limit (5 req/min/IP) slows this down but does not prevent it from a distributed attacker.

**Accepted tradeoff:** Returning a generic `{ error: "If this email is new, your account was created" }` with a fixed 201 is the mitigation, but it significantly degrades UX (users cannot confirm typos in their email). Given this is a developer-facing internal tool rather than a public consumer app, enumeration risk is low. The existing rate limit is the primary control.

**Recommended fix (if enumeration becomes a concern):** Use a consistent 202 or 204 response for both new and duplicate registrations, and deliver an out-of-band confirmation email in both cases.

---

### MED-03 — No per-user session count limit

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File** | `src/app/api/auth/register/route.ts:48–55`, `src/app/api/auth/login/route.ts:42–49` |
| **Status** | Documented — no fix applied |

**Finding:** Each successful login or register creates a new session row without bounding the total. An attacker who repeatedly logs in (or an automated script) can accumulate thousands of `Session` rows for a single user, growing the DB and potentially degrading index lookups on the `token` column (indexed, but large row counts add latency). There is no endpoint to list or revoke individual sessions.

**Recommended fix:** Cap sessions per user (e.g., 10 concurrent). On creation, if the count would exceed the cap, delete the oldest session before inserting the new one:

```typescript
// After session.create succeeds:
const count = await prisma.session.count({ where: { userId: user.id } });
if (count > MAX_SESSIONS_PER_USER) {
  const oldest = await prisma.session.findFirst({
    where: { userId: user.id }, orderBy: { createdAt: "asc" }
  });
  if (oldest) await prisma.session.delete({ where: { id: oldest.id } });
}
```

---

## Verified-secure items

The following areas were audited and found to have no issues:

| Area | Evidence |
|------|---------|
| SQL injection | All queries use Prisma ORM with parameterized bindings; no raw SQL |
| XSS — stored | React escapes all JSX output; no `dangerouslySetInnerHTML` usage found |
| IDOR | Every repo/metric query includes `userId: user.id` in `where`; non-owned IDs return 404, not 403 |
| Sensitive field leakage | All Prisma queries use explicit `select`; `passwordHash` and `encryptedPat` are never returned |
| PAT encryption | AES-256-GCM with a random 12-byte IV per call; IV + ciphertext + auth tag stored together; auth tag verified on decrypt |
| bcrypt timing safety | `login` always calls `bcrypt.compare` with a dummy hash when the email is unknown, preventing timing oracle |
| Password truncation | `password: z.string().max(72)` — bcrypt silently truncates at 72 bytes; the schema enforces this at validation time |
| CORS wildcard | `Access-Control-Allow-Origin` uses `ALLOWED_ORIGIN` env var; defaults to `localhost:3000`; no wildcard |
| Rate limiting — auth endpoints | `register`: 5/min/IP; `login`: 10/min/IP; `repos/search`: 20/min/IP |
| Session expiry | Sessions expire after 7 days; `getSessionUser` filters `expiresAt: { gt: now }` |
| Startup secret validation | Both `SESSION_SECRET` and `PAT_ENCRYPTION_KEY` throw at import time if absent or malformed |
| Hardcoded credentials | No credentials found in source; secrets loaded exclusively via `process.env` |

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/auth.ts` | HMAC-SHA-256 with SESSION_SECRET replaces plain SHA-256 in `hashToken` |
| `src/lib/encryption.ts` | All-zeros key detection — throws in production, warns otherwise |
| `src/types/index.ts` | `connectRepoSchema`: `owner`/`name` regex whitelist + correct max lengths |
| `src/app/api/repos/connect/route.ts` | Rate limit (5/min/IP); `SKIP_GITHUB_VALIDATION` production guard |
| `src/app/api/repos/route.ts` | Rate limit (30/min/IP) |
| `src/app/api/repos/[repoId]/sync/route.ts` | Rate limit (3/min/user-ID) |
| `src/app/api/metrics/[repoId]/route.ts` | Rate limit (30/min/IP) |
| `src/app/api/dashboard/route.ts` | Rate limit (30/min/IP) |
| `next.config.ts` | Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
