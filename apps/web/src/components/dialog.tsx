"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";

export type FormState = { ok?: boolean; error?: string; at?: number };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent w-full">
      {pending ? "Salvando…" : label}
    </button>
  );
}

/**
 * Botão que abre um <dialog> com um formulário ligado a uma server action.
 * Fecha sozinho quando a action devolve { ok: true }.
 */
export function FormDialog({
  trigger,
  triggerClassName = "btn btn-accent",
  title,
  description,
  action,
  submitLabel = "Salvar",
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  title: string;
  description?: React.ReactNode;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {});

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      ref.current?.close();
    }
  }, [state]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${title}-t`}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <form ref={formRef} action={formAction} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`${title}-t`} className="display text-xl font-bold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" aria-label="Fechar" onClick={() => ref.current?.close()} className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised">
              <Icon name="x" size={18} />
            </button>
          </div>
          {children}
          {state.error && (
            <p role="alert" className="text-sm text-bad">
              {state.error}
            </p>
          )}
          <Submit label={submitLabel} />
        </form>
      </dialog>
    </>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
