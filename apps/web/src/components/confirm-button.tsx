"use client";

import { useFormStatus } from "react-dom";

/** Botão de submit que pede confirmação antes de enviar o form. */
export function ConfirmButton({
  message,
  children,
  label,
  className = "grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-bad",
}: {
  message?: string;
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={(e) => {
        if (message && !window.confirm(message)) e.preventDefault();
      }}
      className={`${className} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export function SubmitButton({ children, className = "btn btn-accent", pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
