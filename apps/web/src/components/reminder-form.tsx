"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createReminder } from "@/app/(painel)/actions";
import type { FormState } from "./dialog";

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function ReminderForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createReminder, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("09:00");
  const [repeat, setRepeat] = useState("");

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setRepeat("");
    }
  }, [state]);

  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const nextFriday = addDays(today, ((5 - wd + 7) % 7) || 7);
  const day = Number(today.slice(8, 10));
  const next5 = day < 5 ? `${today.slice(0, 8)}05` : (() => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m, 5)).toISOString().slice(0, 10);
  })();

  const presets = [
    { label: "Amanhã 9h", d: addDays(today, 1), t: "09:00", r: "" },
    { label: "Sexta 18h", d: nextFriday, t: "18:00", r: "" },
    { label: "Todo dia 5", d: next5, t: "09:00", r: "mensal" },
    { label: "Dias úteis 8h", d: addDays(today, 1), t: "08:00", r: "dias_uteis" },
  ];

  return (
    <form ref={formRef} action={action} className="card flex flex-col gap-3.5 p-5">
      <h2 className="eyebrow">Novo lembrete</h2>
      <label className="sr-only" htmlFor="rem-msg">
        Lembrete
      </label>
      <input id="rem-msg" name="message" required placeholder="Ex.: pagar o aluguel" className="input" />
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={date === p.d && time === p.t && repeat === p.r}
            className="pill"
            onClick={() => {
              setDate(p.d);
              setTime(p.t);
              setRepeat(p.r);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-soft">{repeat ? "A partir de" : "Dia"}</span>
          <input name="date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-soft">Horário</span>
          <input name="time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="input" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-soft">Repetir</span>
        <select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="input">
          <option value="">Não repetir</option>
          <option value="diario">Todo dia</option>
          <option value="dias_uteis">Dias úteis</option>
          <option value="semanal">Toda semana (mesmo dia)</option>
          <option value="mensal">Todo mês (mesmo dia)</option>
        </select>
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-good">Agendado ✓ O Patrón manda no WhatsApp.</p>}
      <button type="submit" disabled={pending} className="btn btn-accent w-full">
        {pending ? "Agendando…" : "Agendar"}
      </button>
    </form>
  );
}
