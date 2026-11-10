import { runAgent } from "../ai/agent.js";
import { claimMessage, findUserByPhone, updateUser } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { normalizePhone } from "../lib/phone.js";
import { transcribe } from "../services/transcription.js";
import type { IncomingMessage } from "../whatsapp/types.js";
import { whatsapp } from "../whatsapp/evolution.js";

// Fila por usuário: mensagens da mesma pessoa são processadas em ordem,
// para o histórico não embaralhar quando ela manda várias seguidas.
const queues = new Map<string, Promise<void>>();

export function enqueueIncoming(msg: IncomingMessage) {
  const prev = queues.get(msg.from) ?? Promise.resolve();
  const next = prev
    .then(() => handleIncoming(msg))
    .catch((err) => logger.error({ err, msgId: msg.id }, "erro ao processar mensagem"))
    .finally(() => {
      if (queues.get(msg.from) === next) queues.delete(msg.from);
    });
  queues.set(msg.from, next);
}

async function handleIncoming(msg: IncomingMessage) {
  const user = await findUserByPhone(normalizePhone(msg.from));
  if (!user) {
    logger.info({ from: msg.from }, "número fora da whitelist; ignorando");
    return;
  }
  if (!(await claimMessage(msg.id))) return; // já processada

  if (user.wa_number !== msg.from) await updateUser(user.id, { wa_number: msg.from });

  try {
    let text: string;
    if (msg.kind === "audio") {
      await whatsapp.sendPresence(msg.from, "composing");
      const audio = await whatsapp.downloadAudio(msg);
      const transcript = await transcribe(audio.data, audio.mimetype);
      if (!transcript) {
        await whatsapp.sendText(msg.from, "Não consegui entender esse áudio 😕");
        return;
      }
      text = `[Áudio transcrito]: ${transcript}`;
    } else if (msg.kind === "text" && msg.text) {
      text = msg.text;
    } else {
      await whatsapp.sendText(msg.from, "Por enquanto eu entendo mensagens de texto e áudio 🙂");
      return;
    }

    await whatsapp.sendPresence(msg.from, "composing");
    const reply = await runAgent(user, text);
    await whatsapp.sendText(msg.from, reply);
  } catch (err) {
    logger.error({ err, msgId: msg.id }, "falha no fluxo da mensagem");
    await whatsapp
      .sendText(msg.from, "Tive um problema para processar isso agora. Tenta de novo em instantes? 🙏")
      .catch(() => {});
  }
}
