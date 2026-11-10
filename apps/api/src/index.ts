import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env, googleEnabled } from "./config/env.js";
import { getUser } from "./db/index.js";
import { enqueueIncoming } from "./handlers/incoming.js";
import { startReminderScheduler } from "./jobs/reminders.js";
import { verifyState } from "./lib/crypto.js";
import { logger } from "./lib/logger.js";
import { finishGoogleConnect, GOOGLE_REDIRECT_PATH } from "./services/calendar.js";
import { whatsapp } from "./whatsapp/evolution.js";

// Áudios em base64 podem deixar o payload do webhook grande.
const app = Fastify({ loggerInstance: logger, bodyLimit: 30 * 1024 * 1024 });

app.get("/health", async () => ({ ok: true }));

function safeEqual(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const sameSecret = (given: string) => safeEqual(given, env.WEBHOOK_SECRET);

app.post<{ Params: { secret: string } }>("/webhook/evolution/:secret", async (req, reply) => {
  if (!sameSecret(req.params.secret)) return reply.code(401).send();
  // Responde na hora e processa em segundo plano.
  for (const msg of whatsapp.parseWebhook(req.body)) enqueueIncoming(msg);
  return { received: true };
});

// Usado pelo painel web para mandar mensagens (ex.: código de login) pelo
// mesmo canal do bot, sem o web precisar conhecer a Evolution.
if (env.INTERNAL_API_SECRET) {
  const internalSecret = env.INTERNAL_API_SECRET;
  app.post<{ Body: { userId?: string; text?: string } }>("/internal/send-message", async (req, reply) => {
    const given = req.headers["x-internal-secret"];
    if (typeof given !== "string" || !safeEqual(given, internalSecret)) return reply.code(401).send();
    const { userId, text } = req.body ?? {};
    if (!userId || !text) return reply.code(400).send({ error: "userId e text são obrigatórios" });
    const user = await getUser(userId);
    if (!user) return reply.code(404).send({ error: "usuário não encontrado" });
    await whatsapp.sendText(user.wa_number ?? user.phone, text);
    return { sent: true };
  });
}

const page = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:2rem;text-align:center"><h2>${msg}</h2></body>`;

if (googleEnabled) {
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(GOOGLE_REDIRECT_PATH, async (req, reply) => {
    reply.type("text/html");
    const userId = req.query.state ? verifyState(req.query.state) : null;
    if (req.query.error || !req.query.code || !userId) {
      return reply.code(400).send(page("Link inválido ou expirado. Peça um novo link no WhatsApp."));
    }
    const user = await getUser(userId);
    if (!user) return reply.code(404).send(page("Usuário não encontrado."));

    await finishGoogleConnect(user.id, req.query.code);
    await whatsapp
      .sendText(user.wa_number ?? user.phone, "✅ Agenda do Google conectada! Agora posso ver e criar seus compromissos.")
      .catch((err) => logger.warn({ err }, "não consegui avisar no WhatsApp"));
    return page("Agenda conectada! ✅ Pode voltar para o WhatsApp.");
  });
}

startReminderScheduler();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  logger.fatal(err);
  process.exit(1);
});
