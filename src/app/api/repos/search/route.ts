import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { Octokit } from "@octokit/rest";

export type RepoSearchResult = {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  isPrivate: boolean;
};

// Uses GITHUB_PAT env var — same credential the MCP GitHub server reads.
// Gracefully degrades to unauthenticated search (60 req/hr) when absent.
const octokit = new Octokit(
  process.env.GITHUB_PAT ? { auth: process.env.GITHUB_PAT } : {}
);

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;

  const ip = getClientIp(req);
  const { allowed, retryAfterSec } = checkRateLimit(ip, "repo-search", 20, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) {
    return Response.json({ items: [] });
  }

  try {
    const { data } = await octokit.rest.search.repos({
      q,
      per_page: 8,
      sort: "stars",
      order: "desc",
    });

    const items: RepoSearchResult[] = data.items.map((r) => ({
      fullName: r.full_name,
      owner: r.owner?.login ?? "",
      name: r.name,
      description: r.description ?? null,
      stars: r.stargazers_count ?? 0,
      isPrivate: r.private,
    }));

    return Response.json({ items });
  } catch {
    return Response.json({ items: [] });
  }
}
