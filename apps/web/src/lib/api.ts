import "server-only";
import { env } from "./env";

async function post<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${env.API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": env.INTERNAL_API_SECRET },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`API respondeu ${res.status}`);
  return (await res.json()) as T;
}

/** Manda uma mensagem no WhatsApp do usuário pelo número do bot. */
export const sendWhatsApp = (userId: string, text: string) => post<{ sent: boolean }>("/internal/send-message", { userId, text });

/** Conversa com o Patrón pelo painel (mesmo histórico do WhatsApp). */
export const chatWithPatron = (userId: string, text: string) => post<{ reply: string }>("/internal/chat", { userId, text }, 120_000);
