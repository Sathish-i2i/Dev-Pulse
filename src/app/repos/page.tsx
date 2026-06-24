"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRepos } from "@/hooks/use-repos";
import { RepoCard } from "@/components/repos/repo-card";
import { ConnectRepoForm } from "@/components/repos/connect-repo-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { clearToken } from "@/lib/client-auth";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { RepoSummary } from "@/types/index";

export default function ReposPage() {
  const router = useRouter();
  const { repos, isLoading, error, connectRepo, refetch } = useRepos();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync(repoId: string) {
    setSyncingId(repoId);
    setSyncError(null);
    try {
      const res = await fetchWithAuth(`/api/repos/${repoId}/sync`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncError(body.error ?? "Sync failed");
      } else {
        refetch();
      }
    } catch {
      setSyncError("Network error during sync");
    } finally {
      setSyncingId(null);
    }
  }

  function handleConnectSuccess(repo: RepoSummary) {
    setIsModalOpen(false);
    refetch();
    void repo;
  }

  async function handleLogout() {
    try {
      await fetchWithAuth("/api/auth/logout", { method: "DELETE" });
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-900">DevPulse</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">Dashboard</Link>
              <Link href="/repos" className="font-medium text-blue-600">Repositories</Link>
            </nav>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Repositories</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Connect GitHub repositories to start tracking metrics.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>Connect repository</Button>
        </div>

        {syncError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {syncError}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-slate-500">No repositories connected yet.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => setIsModalOpen(true)}
            >
              Connect your first repo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                onSync={handleSync}
                isSyncing={syncingId === repo.id}
              />
            ))}
          </div>
        )}
      </main>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Connect a GitHub repository"
      >
        <ConnectRepoForm
          onSuccess={handleConnectSuccess}
          onConnect={connectRepo}
        />
      </Modal>
    </div>
  );
}
