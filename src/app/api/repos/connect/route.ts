import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { encryptPat } from "@/lib/encryption";
import { connectRepoSchema } from "@/types/index";

async function validateGitHubRepo(
  owner: string,
  name: string,
  pat: string
): Promise<{ githubId: string; fullName: string } | null> {
  // Allow tests to skip live GitHub API calls
  if (process.env.SKIP_GITHUB_VALIDATION === "true") {
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
