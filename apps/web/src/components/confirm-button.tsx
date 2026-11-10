"use client";

import { useFormStatus } from "react-dom";

/** Botão de submit que pede confirmação antes de enviar o form. */
export function ConfirmButton({
  message,
  children,
  label,
  tone = "danger",
}: {
  message: string;
  children: React.ReactNode;
  label: string;
  tone?: "danger" | "good";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={
        tone === "good"
          ? "rounded-lg border border-[var(--border)] px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--good-text)] disabled:opacity-50"
          : "rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--critical-text)] disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6 0 .7 9.1A2 2 0 0 0 8.7 17h2.6a2 2 0 0 0 2-1.9L14 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
