Scaffold a new full-stack feature for DevPulse. The user will provide a feature name and a brief description. Use that to generate the API route, React component, client hook, and test file — all wired together and consistent with the existing codebase conventions.

## What to ask first (if not already provided)

Before scaffolding, confirm:
1. **Feature name** — used to derive file names (kebab-case) and symbol names (PascalCase / camelCase).
2. **HTTP method and path** — e.g., `GET /api/repos/[repoId]/contributors`.
3. **Auth required?** — almost always yes; note if this is a public endpoint.
4. **Request shape** — query params, route params, or POST body fields.
5. **Response shape** — what JSON the route returns.
6. **UI surface** — a new page, a new card on an existing page, or no UI (API-only).

## Files to create

### 1. Zod schema — `src/types/index.ts`

Add the new request/response schemas to the existing file. Follow the naming pattern `<featureName>Schema` and export an inferred TypeScript type `type <FeatureName>Input = z.infer<typeof <featureName>Schema>`.

### 2. API route — `src/app/api/<path>/route.ts`

Use this exact structure:

```typescript
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { <featureName>Schema } from "@/types/index";

export async function <METHOD>(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  const { allowed, retryAfterSec } = checkRateLimit(getClientIp(req), "<feature-key>", <limit>, 60_000);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
  }

  try {
    // For POST: parse and validate body
    // const body = await req.json();
    // const parsed = <featureName>Schema.safeParse(body);
    // if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

    // All DB queries must include userId in the where clause
    // Non-owned resources: return 404, not 403

    return Response.json({ /* result */ });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

Rate limit guidance:
- Auth-adjacent (create, delete): 5/min/IP
- Expensive (calls GitHub API, multiple DB writes): 3/min/user-ID
- Read endpoints: 30/min/IP

### 3. Client hook — `src/hooks/use-<feature-name>.ts`

```typescript
"use client";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export function use<FeatureName>(<params>) {
  const [data, setData] = useState<ResultType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchWithAuth("/api/<path>")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch(() => setError("Failed to load"))
      .finally(() => setIsLoading(false));
  }, [/* deps */]);

  return { data, isLoading, error };
}
```

Use `fetchWithAuth` (never bare `fetch`) — it injects the Bearer token and redirects to `/login` on 401.

### 4. React component — `src/components/<area>/<FeatureName>.tsx`

- Server Component by default. Add `"use client"` only if the component needs event handlers, hooks, or browser APIs.
- Use `cn()` for conditional classes.
- Show a loading skeleton and an error state.
- Never call the API directly from a Server Component — use the hook in a Client Component wrapper, or fetch server-side using `src/lib/prisma` directly.

### 5. Integration test — `tests/integration/<feature-name>.integration.test.ts`

Follow the existing test structure:

```typescript
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearRateLimitStore } from "@/lib/rate-limit";
import { POST as register } from "@/app/api/auth/register/route";
import { <METHOD> as <handlerAlias> } from "@/app/api/<path>/route";

let userToken: string;

beforeAll(async () => {
  await prisma.<model>.deleteMany();
  // ... seed minimal data ...
  clearRateLimitStore();
});

afterAll(async () => {
  await prisma.<model>.deleteMany();
  await prisma.$disconnect();
});

describe("<METHOD> /api/<path>", () => {
  it("401 — missing Authorization header", async () => { /* ... */ });
  it("400 — invalid input", async () => { /* ... */ });
  it("200 — happy path returns expected shape", async () => { /* ... */ });
  it("404 — IDOR: another user's resource", async () => { /* ... */ });
  it("429 — rate limited after N requests", async () => { /* ... */ });
  // Add at least 2 edge-case tests specific to this feature
});
```

Mandatory tests for every feature:
- `401` — no auth header
- `400` — validation failure (malformed body or missing required field)
- `200`/`201` — happy path, assert full response shape and DB side-effects
- `404` IDOR — authenticated user tries to access another user's resource
- `429` — rate limit enforcement (call clearRateLimitStore first, then exhaust the limit)

## After scaffolding

1. Run `npm run type-check` — resolve all errors before reporting done.
2. Run `npm test -- --reporter=verbose` — new tests must pass; no existing tests may regress.
3. Update `CLAUDE.md`'s API endpoint table with the new route.
4. If the feature adds a new environment variable, add it to `.env.example` with a description comment.
