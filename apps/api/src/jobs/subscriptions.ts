import type { User } from "@elpatron/shared";
import { billSubscription } from "../ai/helpers.js";
import { activeSubscriptionsAllUsers, getUser } from "../db/index.js";
import { logger } from "../lib/logger.js";

const INTERVAL_MS = 60 * 60_000; // de hora em hora (idempotente)

/** Lança em contas a pagar a cobrança do mês de cada assinatura/parcelamento ativo. */
async function tick() {
  const subs = await activeSubscriptionsAllUsers();
  const users = new Map<string, User | null>();
  let created = 0;
  for (const sub of subs) {
    try {
      if (!users.has(sub.user_id)) users.set(sub.user_id, await getUser(sub.user_id));
      const user = users.get(sub.user_id);
      if (user && (await billSubscription(sub, user))) created++;
    } catch (err) {
      logger.error({ err, subscriptionId: sub.id }, "falha ao lançar assinatura");
    }
  }
  if (created) logger.info({ created }, "contas de assinaturas lançadas");
}

export function startSubscriptionScheduler() {
  const run = () => tick().catch((err) => logger.error({ err }, "erro no job de assinaturas"));
  setTimeout(run, 10_000);
  const timer = setInterval(run, INTERVAL_MS);
  return () => clearInterval(timer);
}
