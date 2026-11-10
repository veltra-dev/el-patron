/**
 * Camada de canal. Todo o resto do código fala só com esta interface,
 * então trocar Evolution pela Cloud API da Meta é escrever outro provider.
 */
export interface IncomingMessage {
  id: string;
  /** Número do remetente exatamente como o canal entrega (só dígitos). */
  from: string;
  pushName?: string;
  kind: "text" | "audio" | "document" | "unsupported";
  /** Texto da mensagem, ou a legenda de um documento. */
  text?: string;
  /** Para documentos. */
  fileName?: string;
  mimetype?: string;
  /** Payload original, usado pelo provider para baixar mídia. */
  raw: unknown;
}

export interface WhatsAppProvider {
  parseWebhook(body: unknown): IncomingMessage[];
  sendText(to: string, text: string): Promise<void>;
  /** Baixa a mídia de uma mensagem de áudio ou documento. */
  downloadMedia(msg: IncomingMessage): Promise<{ data: Buffer; mimetype: string }>;
  /** Mostra "digitando..." / "gravando áudio...". Best-effort. */
  sendPresence(to: string, presence: "composing" | "recording"): Promise<void>;
}
