"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setToken } from "@/lib/client-auth";

type FieldErrors = { email?: string[]; password?: string[]; name?: string[] };

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json() as { token?: string; error?: { fieldErrors?: FieldErrors } | string };

      if (res.status === 400) {
        const fe = typeof data.error === "object" ? data.error?.fieldErrors : undefined;
        setFieldErrors(fe ?? {});
        return;
      }
      if (res.status === 409) {
        setFieldErrors({ email: ["This email is already registered."] });
        return;
      }
      if (!res.ok) {
        setServerError(typeof data.error === "string" ? data.error : "Registration failed.");
        return;
      }

      setToken(data.token!);
      router.push("/dashboard");
    } catch {
      setServerError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
              <path d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">DevPulse</h1>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              error={fieldErrors.name?.[0]}
              autoComplete="name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              error={fieldErrors.email?.[0]}
              autoComplete="email"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              error={fieldErrors.password?.[0]}
              hint="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <Button type="submit" isLoading={isLoading} className="mt-1 w-full">
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
