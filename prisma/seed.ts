import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** AES-256-GCM encrypt using the seed's fixed dev key (all zeros + 1). */
function encryptPat(pat: string): string {
  const key = Buffer.from(
    "0000000000000000000000000000000000000000000000000000000000000001",
    "hex"
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(pat, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(
    JSON.stringify({
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: tag.toString("base64"),
    })
  ).toString("base64");
}

/** Return a date N days before today, time set to midnight UTC. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** Seeded pseudo-random so the data looks realistic but is reproducible. */
function seededRand(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return Math.floor(frac * (max - min + 1)) + min;
}

// ── seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding DevPulse database…");

  // Wipe existing data (safe for development only)
  await prisma.metric.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ─────────────────────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("password123", 10);

  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      passwordHash,
      name: "Alice Chen",
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      passwordHash,
      name: "Bob Martinez",
    },
  });

  console.log(`  ✓ Users: ${alice.email}, ${bob.email}`);

  // ── Sessions ──────────────────────────────────────────────────────────────

  const aliceRawToken = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: alice.id,
      token: hashToken(aliceRawToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Bob gets an already-expired session to test expiry handling
  await prisma.session.create({
    data: {
      userId: bob.id,
      token: hashToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  console.log("  ✓ Sessions: 1 active (alice), 1 expired (bob)");
  console.log(`  ℹ  Alice's raw token (for manual testing): ${aliceRawToken}`);

  // ── Repositories ──────────────────────────────────────────────────────────

  // Placeholder encrypted PAT — decrypts to "ghp_placeholder_dev_token"
  const placeholderPat = encryptPat("ghp_placeholder_dev_token");

  const repoNext = await prisma.repository.create({
    data: {
      githubId: "169112984",
      owner: "vercel",
      name: "next.js",
      fullName: "vercel/next.js",
      encryptedPat: placeholderPat,
      userId: alice.id,
      lastSyncedAt: daysAgo(0),
    },
  });

  const repoReact = await prisma.repository.create({
    data: {
      githubId: "10270250",
      owner: "facebook",
      name: "react",
      fullName: "facebook/react",
      encryptedPat: placeholderPat,
      userId: alice.id,
      lastSyncedAt: daysAgo(0),
    },
  });

  // Bob has one repo
  const repoPrisma = await prisma.repository.create({
    data: {
      githubId: "185580495",
      owner: "prisma",
      name: "prisma",
      fullName: "prisma/prisma",
      encryptedPat: placeholderPat,
      userId: bob.id,
      lastSyncedAt: daysAgo(2),
    },
  });

  console.log(
    `  ✓ Repositories: ${repoNext.fullName}, ${repoReact.fullName}, ${repoPrisma.fullName}`
  );

  // ── Metrics — 60 days of data ─────────────────────────────────────────────

  const DAYS = 60;

  type MetricInput = {
    repoId: string;
    date: Date;
    commits: number;
    prsOpened: number;
    prsMerged: number;
    contributors: number;
  };

  const metrics: MetricInput[] = [];

  for (let i = DAYS; i >= 0; i--) {
    const date = daysAgo(i);
    const dow = date.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    // next.js: busy, high-activity open-source repo
    // Weekend activity is ~30% of weekday; spike around day 30 (simulated release)
    const nextSeed = i * 7 + 1;
    const nextBase = isWeekend ? 3 : 12;
    const nextSpike = i >= 28 && i <= 32 ? 2 : 1;
    metrics.push({
      repoId: repoNext.id,
      date,
      commits: seededRand(nextSeed, nextBase, nextBase + 8) * nextSpike,
      prsOpened: seededRand(nextSeed + 1, isWeekend ? 0 : 2, isWeekend ? 2 : 6),
      prsMerged: seededRand(nextSeed + 2, isWeekend ? 0 : 1, isWeekend ? 1 : 4),
      contributors: seededRand(nextSeed + 3, isWeekend ? 2 : 5, isWeekend ? 6 : 15),
    });

    // react: more stable, lower but steady commit cadence
    const reactSeed = i * 7 + 100;
    const reactBase = isWeekend ? 2 : 7;
    metrics.push({
      repoId: repoReact.id,
      date,
      commits: seededRand(reactSeed, reactBase, reactBase + 5),
      prsOpened: seededRand(reactSeed + 1, isWeekend ? 0 : 1, isWeekend ? 1 : 4),
      prsMerged: seededRand(reactSeed + 2, 0, isWeekend ? 1 : 3),
      contributors: seededRand(reactSeed + 3, isWeekend ? 1 : 3, isWeekend ? 4 : 10),
    });

    // prisma/prisma (bob's repo): smaller team, 5-day work week
    if (!isWeekend) {
      const prismaSeed = i * 7 + 200;
      metrics.push({
        repoId: repoPrisma.id,
        date,
        commits: seededRand(prismaSeed, 2, 9),
        prsOpened: seededRand(prismaSeed + 1, 0, 3),
        prsMerged: seededRand(prismaSeed + 2, 0, 2),
        contributors: seededRand(prismaSeed + 3, 2, 6),
      });
    }
  }

  await prisma.metric.createMany({ data: metrics });

  const countNext = metrics.filter((m) => m.repoId === repoNext.id).length;
  const countReact = metrics.filter((m) => m.repoId === repoReact.id).length;
  const countPrisma = metrics.filter((m) => m.repoId === repoPrisma.id).length;

  console.log(
    `  ✓ Metrics: ${countNext} rows (vercel/next.js), ` +
      `${countReact} rows (facebook/react), ` +
      `${countPrisma} rows (prisma/prisma)`
  );

  // ── Summary ───────────────────────────────────────────────────────────────

  const [userCount, repoCount, metricCount, sessionCount] = await Promise.all([
    prisma.user.count(),
    prisma.repository.count(),
    prisma.metric.count(),
    prisma.session.count(),
  ]);

  console.log("\n  Database totals after seed:");
  console.log(`    users:        ${userCount}`);
  console.log(`    sessions:     ${sessionCount}`);
  console.log(`    repositories: ${repoCount}`);
  console.log(`    metrics:      ${metricCount}`);
  console.log("\n✅  Seed complete.");
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
