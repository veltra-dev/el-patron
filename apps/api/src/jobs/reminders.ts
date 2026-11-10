import { nextOccurrence } from "@elpatron/shared";
import { claimDueReminders, getUser, rescheduleReminder, saveMessage } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { whatsapp } from "../whatsapp/evolution.js";

const INTERVAL_MS = 30_000;

async function tick() {
  const due = await claimDueReminders();
  for (const r of due) {
    try {
      const user = await getUser(r.user_id);
      const to = user?.wa_number ?? user?.phone;
      if (!user || !to) continue;
      // Recorrente: reagenda antes de enviar, para não repetir se o envio falhar no meio.
      if (r.recurrence) {
        const next = nextOccurrence(r.remind_at, r.recurrence, r.recurrence_days, user.timezone);
        await rescheduleReminder(r.id, next, new Date().toISOString());
      }
      const text = r.bill_id ? r.message : `⏰ *Lembrete:* ${r.message}`;
      await whatsapp.sendText(to, text);
      // Entra no histórico para a IA saber que o lembrete foi enviado.
      await saveMessage(user.id, "assistant", text);
    } catch (err) {
      logger.error({ err, reminderId: r.id }, "falha ao enviar lembrete");
    }
  }
}

export function startReminderScheduler() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      logger.error({ err }, "erro no scheduler de lembretes");
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  return () => clearInterval(timer);
}
