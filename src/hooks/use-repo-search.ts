"use client";

import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { RepoSearchResult } from "@/app/api/repos/search/route";

type UseRepoSearchResult = {
  results: RepoSearchResult[];
  isSearching: boolean;
};

export function useRepoSearch(query: string): UseRepoSearchResult {
  const [results, setResults] = useState<RepoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(
          `/api/repos/search?q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { items: RepoSearchResult[] };
          setResults(data.items);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { results, isSearching };
}
