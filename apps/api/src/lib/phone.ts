/**
 * Normaliza números brasileiros para 55 + DDD + 9 dígitos.
 * Contas antigas do WhatsApp entregam o JID sem o nono dígito
 * (ex.: 551188887777), então adicionamos o 9 para casar com a whitelist.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits;
}
