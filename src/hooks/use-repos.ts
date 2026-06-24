"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { RepoSummary, ConnectRepoInput } from "@/types/index";

type UseReposResult = {
  repos: RepoSummary[];
  isLoading: boolean;
  error: string | null;
  connectRepo: (input: ConnectRepoInput) => Promise<RepoSummary>;
  refetch: () => void;
};

export function useRepos(): UseReposResult {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchWithAuth("/api/repos")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        return res.json() as Promise<{ repos: RepoSummary[] }>;
      })
      .then((d) => { if (!cancelled) setRepos(d.repos); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick]);

  const connectRepo = useCallback(async (input: ConnectRepoInput): Promise<RepoSummary> => {
    const res = await fetchWithAuth("/api/repos/connect", {
      method: "POST",
      body: JSON.stringify(input),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error ?? `Failed to connect repo: ${res.status}`);
    }

    refetch();
    return data.repo as RepoSummary;
  }, [refetch]);

  return { repos, isLoading, error, connectRepo, refetch };
}
