import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { IncomingMessage, WhatsAppProvider } from "./types.js";

// Formato (parcial) do evento messages.upsert da Evolution API v2.
interface EvolutionMessageData {
  key?: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    senderPn?: string;
    fromMe?: boolean;
  };
  pushName?: string;
  messageType?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { mimetype?: string };
    documentMessage?: EvolutionDocument;
    documentWithCaptionMessage?: { message?: { documentMessage?: EvolutionDocument } };
    base64?: string;
  };
}

interface EvolutionDocument {
  fileName?: string;
  mimetype?: string;
  caption?: string;
}

function documentOf(d: EvolutionMessageData): EvolutionDocument | undefined {
  return d.message?.documentMessage ?? d.message?.documentWithCaptionMessage?.message?.documentMessage;
}

function jidToNumber(jid: string): string {
  return jid.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
}

export class EvolutionProvider implements WhatsAppProvider {
  private readonly base = env.EVOLUTION_API_URL.replace(/\/$/, "");
  private readonly instance = encodeURIComponent(env.EVOLUTION_INSTANCE);

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.EVOLUTION_API_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Evolution ${path} -> ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  parseWebhook(body: unknown): IncomingMessage[] {
    const payload = body as { event?: string; data?: EvolutionMessageData | EvolutionMessageData[] };
    if (payload?.event !== "messages.upsert" || !payload.data) return [];

    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    const out: IncomingMessage[] = [];

    for (const d of items) {
      const key = d.key;
      if (!key?.id || !key.remoteJid || key.fromMe) continue;
      if (key.remoteJid.endsWith("@g.us") || key.remoteJid === "status@broadcast") continue;

      // Com o endereçamento LID do WhatsApp, o número real vem em remoteJidAlt/senderPn.
      let jid = key.remoteJid;
      if (jid.endsWith("@lid")) {
        const alt = key.remoteJidAlt ?? key.senderPn;
        if (!alt) {
          logger.warn({ jid }, "mensagem com LID sem número alternativo; ignorando");
          continue;
        }
        jid = alt;
      }

      const m = d.message ?? {};
      const doc = documentOf(d);
      const text = m.conversation ?? m.extendedTextMessage?.text ?? doc?.caption;
      const kind: IncomingMessage["kind"] = m.audioMessage ? "audio" : doc ? "document" : text ? "text" : "unsupported";

      out.push({
        id: key.id,
        from: jidToNumber(jid),
        pushName: d.pushName,
        kind,
        text: text ?? undefined,
        fileName: doc?.fileName,
        mimetype: doc?.mimetype,
        raw: d,
      });
    }
    return out;
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.call(`/message/sendText/${this.instance}`, { number: to, text });
  }

  async downloadMedia(msg: IncomingMessage): Promise<{ data: Buffer; mimetype: string }> {
    const d = msg.raw as EvolutionMessageData;
    const mimetype = d.message?.audioMessage?.mimetype ?? documentOf(d)?.mimetype ?? "application/octet-stream";

    // Se o webhook foi configurado com base64 ligado, a mídia já vem no payload.
    if (d.message?.base64) {
      return { data: Buffer.from(d.message.base64, "base64"), mimetype };
    }

    const res = await this.call<{ base64: string; mimetype?: string }>(
      `/chat/getBase64FromMediaMessage/${this.instance}`,
      { message: { key: { id: msg.id } }, convertToMp4: false },
    );
    return { data: Buffer.from(res.base64, "base64"), mimetype: res.mimetype ?? mimetype };
  }

  async sendPresence(to: string, presence: "composing" | "recording"): Promise<void> {
    try {
      await this.call(`/chat/sendPresence/${this.instance}`, { number: to, presence, delay: 3000 });
    } catch (err) {
      logger.debug({ err }, "falha ao enviar presença (ignorado)");
    }
  }
}

export const whatsapp: WhatsAppProvider = new EvolutionProvider();
