"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { sendChat } from "@/app/(painel)/actions";
import { Icon } from "./icons";

export type ChatMsg = { id: string; role: "user" | "assistant"; text: string; at: string };

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~) sem HTML cru. */
function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const inner = m[0].slice(1, -1);
    const k = `${key}-${i++}`;
    out.push(m[0][0] === "*" ? <strong key={k}>{inner}</strong> : m[0][0] === "_" ? <em key={k}>{inner}</em> : <s key={k}>{inner}</s>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Formatted({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {inline(l, String(i))}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

const time = (iso: string, tz: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

function dayLabel(key: string, today: string) {
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
}

export const SHORTCUTS = ["Resumo do dia", "Contas de hoje", "Previsão do mês", "Como estão meus orçamentos?", "Quanto gastei esse mês?"];

export function Chat({ initial, timezone, prefill }: { initial: ChatMsg[]; timezone: string; prefill?: string }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = dayKey(new Date().toISOString(), timezone);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, pending]);

  useEffect(() => {
    if (prefill) inputRef.current?.focus();
  }, [prefill]);

  const send = (value: string) => {
    const t = value.trim();
    if (!t || pending) return;
    setError(null);
    setText("");
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", text: t, at: new Date().toISOString() }]);
    start(async () => {
      const res = await sendChat(t);
      if (res.reply) setMsgs((m) => [...m, { id: `r-${Date.now()}`, role: "assistant", text: res.reply!, at: new Date().toISOString() }]);
      else setError(res.error ?? "Algo deu errado.");
    });
  };

  let lastDay = "";
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0d0f0e] lg:static lg:z-auto lg:h-[calc(100dvh-150px)] lg:min-h-[480px] lg:rounded-[20px] lg:border lg:border-line lg:bg-surface">
      {/* cabeçalho só no mobile */}
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 lg:hidden">
        <Link href="/" aria-label="Voltar" className="grid size-10 place-items-center rounded-full text-soft hover:bg-raised">
          <Icon name="chevronLeft" />
        </Link>
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-ink">
          <Icon name="patron" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[17px] font-semibold">Patrón</div>
          <div className="flex items-center gap-1.5 text-xs text-[#8FBEA6]">
            <span className="size-1.5 rounded-full bg-good" /> online · mesma conversa do WhatsApp
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-5" aria-live="polite">
        {msgs.length === 0 && (
          <p className="mx-auto mt-10 max-w-xs text-center text-sm text-muted">
            Aqui é a mesma conversa do WhatsApp. Mande “gastei 30 no almoço” ou toque num atalho.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {msgs.map((m) => {
            const d = dayKey(m.at, timezone);
            const sep = d !== lastDay;
            lastDay = d;
            return (
              <Fragment key={m.id}>
                {sep && <li className="py-1 text-center text-xs text-muted">{dayLabel(d, today)}</li>}
                {m.role === "user" ? (
                  <li className="flex flex-col items-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#26352d] px-3.5 py-2.5 text-[15px] leading-snug">
                      {m.text}
                    </div>
                  </li>
                ) : (
                  <li className="flex flex-col items-start gap-1">
                    <div className="max-w-[85%] break-words rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-2.5 text-[15px] leading-snug lg:bg-[#141312]">
                      <Formatted text={m.text} />
                    </div>
                    <span className="px-1 text-[11px] text-muted">Patrón · {time(m.at, timezone)}</span>
                  </li>
                )}
              </Fragment>
            );
          })}
          {pending && (
            <li className="flex">
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
                <span className="inline-flex gap-1" aria-label="Patrón está digitando">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted" />
                </span>
              </div>
            </li>
          )}
        </ul>
        <div ref={endRef} />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
        {SHORTCUTS.map((s) => (
          <button key={s} type="button" className="pill shrink-0" onClick={() => send(s)} disabled={pending}>
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-bad">
          {error}
        </p>
      )}

      <form
        className="flex items-end gap-2.5 border-t border-line px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Mensagem para o Patrón
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Mensagem para o Patrón"
          className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-muted focus:border-accent lg:bg-surface-2"
        />
        <button type="submit" aria-label="Enviar" disabled={pending || !text.trim()} className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-50">
          <Icon name="send" size={20} />
        </button>
      </form>
    </div>
  );
}

export function ShortcutLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {SHORTCUTS.map((s) => (
        <Link key={s} href={`/patron?msg=${encodeURIComponent(s)}`} className="pill">
          {s}
        </Link>
      ))}
    </div>
  );
}
