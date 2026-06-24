"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRepoSearch } from "@/hooks/use-repo-search";
import type { RepoSummary } from "@/types/index";
import type { RepoSearchResult } from "@/app/api/repos/search/route";

export type ConnectRepoFormProps = {
  onSuccess: (repo: RepoSummary) => void;
  onConnect: (input: { owner: string; name: string; pat: string }) => Promise<RepoSummary>;
};

function StarIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function ConnectRepoForm({ onSuccess, onConnect }: ConnectRepoFormProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [pat, setPat] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const { results, isSearching } = useRepoSearch(searchQuery);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Show dropdown whenever there are results or a search is in flight
  useEffect(() => {
    setShowDropdown(searchQuery.trim().length >= 2);
  }, [searchQuery, results]);

  function selectResult(r: RepoSearchResult) {
    setOwner(r.owner);
    setName(r.name);
    setSearchQuery(r.fullName);
    setShowDropdown(false);
    setShowManual(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!owner.trim() || !name.trim() || !pat.trim()) return;

    setError("");
    setIsLoading(true);

    try {
      const repo = await onConnect({ owner: owner.trim(), name: name.trim(), pat: pat.trim() });
      onSuccess(repo);
      setSearchQuery("");
      setOwner("");
      setName("");
      setPat("");
      setShowManual(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect repository.");
    } finally {
      setIsLoading(false);
    }
  }

  const hasSelection = owner.trim() !== "" && name.trim() !== "";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* GitHub repository search — powered by GitHub MCP / search API */}
      <div className="relative" ref={dropdownRef}>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Search GitHub repositories
        </label>
        <div className="relative">
          <input
            type="text"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search by owner, name, or topic…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery((e.target as HTMLInputElement).value);
              if (!showManual) setOwner("");
              if (!showManual) setName("");
            }}
            autoComplete="off"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            </div>
          )}
        </div>

        {showDropdown && (results.length > 0 || isSearching) && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.length === 0 && isSearching ? (
              <div className="px-4 py-3 text-sm text-slate-400">Searching…</div>
            ) : (
              <ul className="max-h-60 overflow-y-auto py-1">
                {results.map((r) => (
                  <li key={r.fullName}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-slate-50"
                      onClick={() => selectResult(r)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{r.fullName}</span>
                        {r.isPrivate && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                            private
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-0.5 text-xs text-slate-500">
                          <StarIcon />
                          {r.stars.toLocaleString()}
                        </span>
                      </div>
                      {r.description && (
                        <span className="truncate text-xs text-slate-500">{r.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Manual entry toggle — shown after a search result is selected or on request */}
      {!hasSelection && !showManual && (
        <button
          type="button"
          className="text-left text-xs text-blue-600 hover:underline"
          onClick={() => setShowManual(true)}
        >
          Or enter owner / repository name manually
        </button>
      )}

      {(showManual || hasSelection) && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Owner"
            placeholder="vercel"
            value={owner}
            onChange={(e) => setOwner((e.target as HTMLInputElement).value)}
            required
            autoComplete="off"
          />
          <Input
            label="Repository"
            placeholder="next.js"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            required
            autoComplete="off"
          />
        </div>
      )}

      <Input
        label="Personal Access Token"
        type="password"
        placeholder="ghp_••••••••••••••••"
        value={pat}
        onChange={(e) => setPat((e.target as HTMLInputElement).value)}
        hint="Needs repo read access. Token is encrypted at rest."
        required
        autoComplete="off"
      />

      <div className="flex justify-end gap-3 pt-1">
        <Button
          type="submit"
          isLoading={isLoading}
          disabled={!owner.trim() || !name.trim() || !pat.trim()}
        >
          Connect repository
        </Button>
      </div>
    </form>
  );
}
