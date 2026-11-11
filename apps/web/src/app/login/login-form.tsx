"use client";

import { useActionState, useState } from "react";
import { requestCode, verifyCode, type LoginState } from "./actions";

function maskInput(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function LoginForm() {
  const [phoneState, sendCode, sending] = useActionState<LoginState, FormData>(requestCode, { step: "phone" });
  const [codeState, checkCode, checking] = useActionState<LoginState, FormData>(verifyCode, { step: "phone" });
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);

  const onCodeStep = phoneState.step === "code" && !editing;
  const sentTo = phoneState.step === "code" ? phoneState.phone : "";
  const error = onCodeStep ? (codeState.error ?? phoneState.error) : phoneState.error;

  if (onCodeStep) {
    return (
      <form action={checkCode} className="space-y-4">
        <input type="hidden" name="phone" value={sentTo} />
        <p className="text-sm text-soft">
          Mandei um código de 6 dígitos no seu WhatsApp. Ele chega numa conversa com o ElPatrón.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Código</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
            placeholder="000000"
            className="input text-center font-mono text-2xl tracking-[0.5em]"
          />
        </label>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button className="btn btn-accent w-full" disabled={checking}>
          {checking ? "Conferindo…" : "Entrar"}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" className="link-accent" onClick={() => setEditing(true)}>
            Trocar número
          </button>
          <button type="submit" formAction={sendCode} formNoValidate className="link-accent" disabled={sending}>
            {sending ? "Enviando…" : "Reenviar código"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={(fd) => { setEditing(false); return sendCode(fd); }} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Seu número de WhatsApp</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          required
          placeholder="(16) 99798-7859"
          value={phone}
          onChange={(e) => setPhone(maskInput(e.target.value))}
          className="input text-lg"
        />
      </label>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button className="btn btn-accent w-full" disabled={sending}>
        {sending ? "Enviando código…" : "Receber código no WhatsApp"}
      </button>
    </form>
  );
}
