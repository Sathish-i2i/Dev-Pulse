import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { encryptPat } from "@/lib/encryption";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { connectRepoSchema } from "@/types/index";

async function validateGitHubRepo(
  owner: string,
  name: string,
  pat: string
): Promise<{ githubId: string; fullName: string } | null> {
  // SKIP_GITHUB_VALIDATION is only honoured outside of production to prevent
  // a misconfigured production deployment from bypassing GitHub validation.
  if (process.env.SKIP_GITHUB_VALIDATION === "true" && process.env.NODE_ENV !== "production") {
    return { githubId: `${owner}-${name}-stub`, fullName: `${owner}/${name}` };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: number; full_name: string };
    return { githubId: String(data.id), fullName: data.full_name };
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user } = authResult;

  const { allowed, retryAfterSec } = checkRateLimit(
    getClientIp(req),
    "repo-connect",
    5,
    60_000
  );
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = connectRepoSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { owner, name, pat } = parsed.data;

    const github = await validateGitHubRepo(owner, name, pat);
    if (!github) {
      return Response.json(
        { error: "Repository not found or PAT does not have access" },
        { status: 404 }
      );
    }

    const existing = await prisma.repository.findFirst({
      where: { userId: user.id, githubId: github.githubId },
    });
    if (existing) {
      return Response.json(
        { error: "Repository already connected" },
        { status: 409 }
      );
    }

    const repo = await prisma.repository.create({
      data: {
        githubId: github.githubId,
        owner,
        name,
        fullName: github.fullName,
        encryptedPat: encryptPat(pat),
        userId: user.id,
      },
      select: {
        id: true,
        owner: true,
        name: true,
        fullName: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    });

    return Response.json({ repo }, { status: 201 });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
