"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen) {
      el.showModal();
    } else {
      el.close();
    }
  }, [isOpen]);

  // Close on backdrop click
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  // Close on Escape (native dialog handles this, but we sync state)
  function handleClose() {
    onClose();
  }

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleClick}
      onClose={handleClose}
      className={cn(
        "w-full max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-xl",
        "backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm",
        "open:animate-in open:fade-in-0 open:zoom-in-95",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
