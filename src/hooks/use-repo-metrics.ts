"use client";

import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { MetricRow } from "@/types/index";

type UseRepoMetricsResult = {
  metrics: MetricRow[];
  isLoading: boolean;
  error: string | null;
};

export function useRepoMetrics(
  repoId: string | null,
  params: { from: Date; to: Date }
): UseRepoMetricsResult {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromISO = params.from.toISOString();
  const toISO = params.to.toISOString();

  useEffect(() => {
    if (!repoId) {
      setMetrics([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = `/api/metrics/${encodeURIComponent(repoId)}?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;

    fetchWithAuth(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        return res.json() as Promise<{ metrics: MetricRow[] }>;
      })
      .then((d) => { if (!cancelled) setMetrics(d.metrics); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [repoId, fromISO, toISO]);

  return { metrics, isLoading, error };
}
