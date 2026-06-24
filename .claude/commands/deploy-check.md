Run a pre-deployment verification checklist for DevPulse. Work through each section in order and report pass/fail for every item. Fix any failures you can fix automatically (type errors, missing env var docs); flag anything that requires human action.

## 1. Static analysis

- Run `npm run type-check` (tsc --noEmit). All errors must be resolved before deployment.
- Check that no `any` type assertions (`as any`, `: any`) were introduced since the last commit: `git diff main -- '*.ts' '*.tsx' | grep '+.*any'`.

## 2. Test suite

- Run `npm run test:coverage`. All tests must pass.
- Verify coverage thresholds are met (80% statements/functions/lines, 65% branches — enforced by vitest.config.ts). The command exits non-zero if thresholds fail.
- Report the exact coverage percentages for each category.

## 3. Build

- Run `npm run build` (Next.js production build). Confirm it exits 0.
- Check for any build warnings about missing environment variables or invalid configuration.

## 4. Security

- Run `npm audit --audit-level=high`. Report any high or critical CVEs. Do not proceed if any are found — run `npm audit fix` and re-check.
- Verify `docs/SECURITY-AUDIT.md` exists and was updated within the last 30 days (check `git log --follow -1 -- docs/SECURITY-AUDIT.md`).
- Confirm no secrets or API keys appear in tracked files: `git grep -rn --cached "ghp_\|sk-\|AKIA\|password.*=.*['\"][^$]\|secret.*=.*['\"][^$]" -- . ':(exclude).env*' ':(exclude)*.md'`.

## 5. Environment variables

Read `.env.example` and list every variable defined there. For each one, confirm:
- It has a non-empty description comment in `.env.example`.
- It is documented in `CLAUDE.md` or `docs/SECURITY-AUDIT.md`.
- The `PAT_ENCRYPTION_KEY` example value is NOT all zeros (all-zeros is a known-weak placeholder).

## 6. Database

- Confirm `prisma/migrations/` contains at least one migration directory.
- Confirm no uncommitted schema changes: compare `prisma/schema.prisma` with the last commit (`git diff HEAD -- prisma/schema.prisma`). Uncommitted schema changes mean a migration was not generated.
- Check that `prisma migrate deploy` (not `migrate dev`) is used in CI — read `.github/workflows/ci.yml` or `Dev-Pulse/.github/workflows/ci.yml`.

## 7. API surface

For each route under `src/app/api/`:
- Confirm the handler calls `requireAuth` (or explicitly documents why auth is not needed).
- Confirm all POST/PATCH body parsing goes through a Zod `safeParse` before any DB write.
- Confirm there is a `checkRateLimit` call on every endpoint.

## 8. Git hygiene

- Run `git status` — there must be no uncommitted changes to tracked files at deploy time.
- Run `git log --oneline -5` to show the last five commits for the record.
- Confirm the branch is `main` or that a release branch is being deployed intentionally.

## 9. Final report

Produce a table:

| Section | Status | Notes |
|---------|--------|-------|
| Static analysis | PASS/FAIL | ... |
| Tests + coverage | PASS/FAIL | statements X%, branches X%, functions X%, lines X% |
| Build | PASS/FAIL | ... |
| Security | PASS/FAIL | ... |
| Environment variables | PASS/FAIL | ... |
| Database migrations | PASS/FAIL | ... |
| API surface | PASS/FAIL | ... |
| Git hygiene | PASS/FAIL | ... |

If any section is FAIL, do not declare the deployment ready. List the exact steps needed to reach PASS.
