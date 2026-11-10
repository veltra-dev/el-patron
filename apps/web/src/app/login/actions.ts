"use server";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { normalizePhone } from "@elpatron/shared";
import { countRecentCodes, findUserByPhone, insertLoginCode, latestLoginCode, updateLoginCode } from "@/lib/db";
import { env } from "@/lib/env";
import { createSession, destroySession } from "@/lib/session";

const CODE_TTL_MIN = 10;
const MAX_CODES_PER_WINDOW = 3;
const WINDOW_MIN = 15;
const MAX_ATTEMPTS = 5;

export type LoginState =
  | { step: "phone"; error?: string }
  | { step: "code"; phone: string; error?: string };

const hashCode = (userId: string, code: string) =>
  createHmac("sha256", env.SESSION_SECRET).update(`${userId}:${code}`).digest("hex");

async function sendWhatsApp(userId: string, text: string) {
  const res = await fetch(`${env.API_URL}/internal/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": env.INTERNAL_API_SECRET },
    body: JSON.stringify({ userId, text }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API respondeu ${res.status}`);
}

export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const raw = String(form.get("phone") ?? "");
  const phone = normalizePhone(raw);
  if (phone.length !== 13) {
    return { step: "phone", error: "Digite o número com DDD, ex.: (16) 99798-7859" };
  }

  const user = await findUserByPhone(phone);
  if (!user) {
    return { step: "phone", error: "Esse número não está cadastrado no ElPatrón." };
  }

  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  if ((await countRecentCodes(user.id, since)) >= MAX_CODES_PER_WINDOW) {
    return { step: "code", phone, error: `Muitos códigos pedidos. Use o último que chegou ou espere ${WINDOW_MIN} minutos.` };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await insertLoginCode(user.id, hashCode(user.id, code), new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString());

  try {
    await sendWhatsApp(
      user.id,
      `🔐 Seu código de acesso ao painel do ElPatrón é *${code}*.\n\nVale por ${CODE_TTL_MIN} minutos. Se não foi você, ignore esta mensagem.`,
    );
  } catch {
    return { step: "phone", error: "Não consegui enviar o código pelo WhatsApp agora. Tente de novo em instantes." };
  }

  return { step: "code", phone };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = String(form.get("phone") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const back = (error: string): LoginState => ({ step: "code", phone, error });

  if (code.length !== 6) return back("O código tem 6 dígitos.");

  const user = await findUserByPhone(phone);
  const last = user ? await latestLoginCode(user.id) : null;
  if (!user || !last || last.consumed_at || new Date(last.expires_at) < new Date()) {
    return back("Código expirado. Peça um novo.");
  }
  if (last.attempts >= MAX_ATTEMPTS) return back("Tentativas esgotadas. Peça um novo código.");

  const expected = Buffer.from(last.code_hash, "hex");
  const given = Buffer.from(hashCode(user.id, code), "hex");
  if (!timingSafeEqual(expected, given)) {
    await updateLoginCode(last.id, { attempts: last.attempts + 1 });
    const left = MAX_ATTEMPTS - last.attempts - 1;
    return back(left > 0 ? `Código incorreto. Você ainda tem ${left} tentativa(s).` : "Tentativas esgotadas. Peça um novo código.");
  }

  await updateLoginCode(last.id, { consumed_at: new Date().toISOString() });
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
