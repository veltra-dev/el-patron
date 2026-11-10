import { runAgent } from "../ai/agent.js";
import { claimMessage, findUserByPhone, trackUnknownContact, updateUser } from "../db/index.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { normalizePhone } from "@elpatron/shared";
import { readAttachment, UnsupportedFileError, type Attachment } from "../services/files.js";
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
    await handleUnknown(msg);
    return;
  }
  if (!(await claimMessage(msg.id))) return; // já processada

  if (user.wa_number !== msg.from) await updateUser(user.id, { wa_number: msg.from });

  try {
    let text: string;
    let attachment: Attachment | undefined;
    if (msg.kind === "audio") {
      await whatsapp.sendPresence(msg.from, "composing");
      const audio = await whatsapp.downloadMedia(msg);
      const transcript = await transcribe(audio.data, audio.mimetype);
      if (!transcript) {
        await whatsapp.sendText(msg.from, "Não consegui entender esse áudio 😕");
        return;
      }
      text = `[Áudio transcrito]: ${transcript}`;
    } else if (msg.kind === "document") {
      await whatsapp.sendPresence(msg.from, "composing");
      const fileName = msg.fileName ?? "arquivo";
      try {
        const file = await whatsapp.downloadMedia(msg);
        attachment = await readAttachment(fileName, msg.mimetype ?? file.mimetype, file.data);
      } catch (err) {
        if (err instanceof UnsupportedFileError) {
          await whatsapp.sendText(msg.from, err.message);
          return;
        }
        throw err;
      }
      text = `[Arquivo enviado: ${fileName}]${msg.text ? `\n${msg.text}` : ""}`;
    } else if (msg.kind === "text" && msg.text) {
      text = msg.text;
    } else {
      await whatsapp.sendText(msg.from, "Por enquanto eu entendo texto, áudio, planilhas (.xlsx, .csv) e PDF 🙂");
      return;
    }

    await whatsapp.sendPresence(msg.from, "composing");
    const reply = await runAgent(user, text, attachment);
    await whatsapp.sendText(msg.from, reply);
  } catch (err) {
    logger.error({ err, msgId: msg.id }, "falha no fluxo da mensagem");
    await whatsapp
      .sendText(msg.from, "Tive um problema para processar isso agora. Tenta de novo em instantes? 🙏")
      .catch(() => {});
  }
}

function notClientMessage(pushName?: string) {
  const firstName = pushName?.trim().split(/\s+/)[0];
  const support = env.SUPPORT_CONTACT ? `, é só falar com o suporte: ${env.SUPPORT_CONTACT}` : ", é só falar com o suporte";
  return (
    `Olá${firstName ? `, ${firstName}` : ""}! 👋 Aqui é o *ElPatrón*, um assistente no WhatsApp que organiza gastos, contas e lembretes.\n\n` +
    `Infelizmente o seu número ainda não está na minha lista de clientes. Se quiser contratar${support} 🤠`
  );
}

async function handleUnknown(msg: IncomingMessage) {
  const phone = normalizePhone(msg.from);
  const reply = await trackUnknownContact(phone, msg.pushName, env.UNKNOWN_REPLY_COOLDOWN_DAYS);
  logger.info({ from: msg.from, replied: reply }, "número fora da whitelist");
  if (reply) await whatsapp.sendText(msg.from, notClientMessage(msg.pushName));
}
