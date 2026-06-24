import { z } from "zod";

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  name: z.string().min(1, "Name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const connectRepoSchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  pat: z.string().min(10, "PAT must be at least 10 characters").max(255),
});

export const metricsQuerySchema = z
  .object({
    from: z.string().datetime({ message: "from must be an ISO 8601 datetime" }),
    to: z.string().datetime({ message: "to must be an ISO 8601 datetime" }),
  })
  .refine((d) => new Date(d.from) <= new Date(d.to), {
    message: "from must be before or equal to to",
    path: ["from"],
  })
  .refine(
    (d) => {
      const diffMs = new Date(d.to).getTime() - new Date(d.from).getTime();
      return diffMs <= 365 * 24 * 60 * 60 * 1000;
    },
    { message: "Date range must not exceed 365 days", path: ["to"] }
  );

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ConnectRepoInput = z.infer<typeof connectRepoSchema>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

// ── API response shapes ───────────────────────────────────────────────────────

export type UserPublic = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

export type RepoSummary = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
};

export type MetricRow = {
  date: Date;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  contributors: number;
};

export type DashboardSummary = {
  totalCommits: number;
  totalPrsOpened: number;
  totalPrsMerged: number;
  avgDailyCommits: number;
  activeDays: number;
};

export type DashboardRepoTotal = RepoSummary & {
  commits: number;
  prsOpened: number;
  prsMerged: number;
};

export type DashboardResponse = {
  summary: DashboardSummary;
  timeline: MetricRow[];
  repos: DashboardRepoTotal[];
};
