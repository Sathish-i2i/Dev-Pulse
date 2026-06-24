"use client";

import { cn } from "@/lib/cn";

export type InputProps = {
  label?: string;
  error?: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-900",
          "placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          error
            ? "border-red-400 focus:ring-red-400"
            : "border-slate-300",
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
