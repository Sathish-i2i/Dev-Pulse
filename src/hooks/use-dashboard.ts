"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { DashboardResponse } from "@/types/index";

type UseDashboardResult = {
  data: DashboardResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useDashboard(params: { from: Date; to: Date }): UseDashboardResult {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const fromISO = params.from.toISOString();
  const toISO = params.to.toISOString();

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = `/api/dashboard?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;

    fetchWithAuth(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        return res.json() as Promise<DashboardResponse>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [fromISO, toISO, tick]);

  return { data, isLoading, error, refetch };
}
