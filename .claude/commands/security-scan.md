Run a full security audit of the DevPulse codebase and produce an updated `docs/SECURITY-AUDIT.md`. Apply fixes for any issues you can resolve automatically; document issues that require architectural changes.

## Scope

Read every file under `src/app/api/`, `src/lib/`, `src/middleware.ts`, `src/types/index.ts`, `next.config.ts`, `prisma/schema.prisma`, and `.env.example`.

## Checklist — evaluate each item for every file in scope

### Input validation
- Every POST/PATCH/PUT handler parses the request body with a Zod schema using `safeParse` before touching the DB or calling external APIs.
- Every route parameter (`repoId`, etc.) is used only after confirming ownership in a DB query.
- Query string parameters (`from`, `to`, `q`) are validated with Zod before being passed to Prisma date filters or external calls.
- String fields that are interpolated into URLs (e.g., `owner`, `name`) are constrained by a strict character-whitelist regex.

### Authentication and authorization
- Every protected route handler calls `requireAuth` and returns early on failure.
- Non-owned resources return **404**, not 403 (IDOR hardening — do not confirm resource existence).
- Session tokens are validated with both a hash match and an `expiresAt > now` check.
- No route bypasses authentication based on an env var that could be set in production.

### Rate limiting
- Every route (including GET endpoints) calls `checkRateLimit` with an appropriate key and window.
- Auth endpoints (`register`, `login`) use tighter limits than read endpoints.
- Expensive operations (sync, connect) are rate-limited per user ID or per IP.

### Injection
- No raw SQL. All DB access goes through Prisma parameterized queries.
- No `eval`, `Function()`, or `child_process.exec` with user-supplied input.
- No `dangerouslySetInnerHTML` in React components; if present, confirm the value is sanitized.
- No string interpolation of user input into shell commands.

### Secrets and keys
- `process.env` is the only source of secrets; no secrets in source files or committed `.env` files.
- `SESSION_SECRET` is used in an HMAC (not plain hash).
- `PAT_ENCRYPTION_KEY` is checked for the known-weak all-zeros value; production throws, dev warns.
- `SKIP_GITHUB_VALIDATION` or similar test flags are guarded against running in `NODE_ENV === "production"`.
- Run: `git grep -rn --cached "ghp_\|sk-\|AKIA" -- . ':(exclude).env*'` — must return empty.

### CORS and HTTP headers
- `Access-Control-Allow-Origin` uses a specific origin, not `*`.
- The following headers are present on all responses in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy`.
- `Strict-Transport-Security` is set in production.
- CSP includes `frame-ancestors 'none'` and restricts `connect-src` to known origins.

### Sensitive field leakage
- No Prisma query returns `passwordHash`, `encryptedPat`, or `Session.token` to API responses.
- All Prisma queries use explicit `select` clauses rather than selecting all fields.
- Error responses in production return generic messages; stack traces are never serialized to JSON.

### Cryptography
- PATs are encrypted with AES-256-GCM (authenticated encryption).
- A fresh random IV (12 bytes minimum) is generated for every encryption call.
- The IV, ciphertext, and authentication tag are all stored and verified on decryption.

## Output format

After completing the checklist, write `docs/SECURITY-AUDIT.md` with this structure:

```
# DevPulse Security Audit

**Date:** <today>
**Scope:** <list of files checked>
**Status:** N findings — X fixed, Y documented

## Summary table (severity × count)

## Findings
For each finding:
### SEV-NN — Short title
| Severity | File | Line | Status |
Finding description, vulnerable code snippet, fix applied or recommended fix.

## Verified-secure items
Table of areas checked and found clean.

## Files changed
Table of every file modified and what changed.
```

Fix every finding you can fix in-place. For findings that require architectural changes (e.g., replacing in-memory rate limiter with Redis, adding nonces to CSP), document them with a "Recommended fix" section but do not make the change.

Run `npm run type-check` after applying all fixes and confirm it exits 0 before writing the final report.
