"use client";

import { useActionState, useEffect, useRef } from "react";
import { createNote } from "@/app/(painel)/actions";
import type { FormState } from "./dialog";

export function NoteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createNote, {});
  const ref = useRef<HTMLFormElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card flex flex-col gap-3 p-5">
      <label htmlFor="note" className="eyebrow">
        Nova nota
      </label>
      <textarea
        id="note"
        ref={area}
        name="content"
        rows={2}
        required
        placeholder="Escreva aqui ou mande “nota: …” pro Patrón. Use #etiquetas."
        className="min-h-14 resize-y bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="pill text-soft"
          onClick={() => {
            const el = area.current;
            if (!el) return;
            el.value = `${el.value}${el.value && !el.value.endsWith(" ") ? " " : ""}#`;
            el.focus();
          }}
        >
          Adicionar #etiqueta
        </button>
        <button type="submit" disabled={pending} className="btn btn-accent rounded-full px-5">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
