"use client";

import { getToken, clearToken } from "./client-auth";

/**
 * Drop-in replacement for fetch() that:
 *  - Injects the session token as a Bearer header
 *  - On 401: clears local session state and redirects to /login
 */
export async function fetchWithAuth(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = getToken();

  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 401) {
    clearToken();
    // Preserve current path so the user lands back here after re-login
    const from = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?from=${from}`;
  }

  return res;
}
