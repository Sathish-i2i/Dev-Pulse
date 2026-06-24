const TOKEN_KEY = "devpulse_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Also set a cookie so Next.js middleware can read it for redirects
  document.cookie = `devpulse_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = "devpulse_token=; path=/; max-age=0";
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
