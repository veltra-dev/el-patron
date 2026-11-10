/**
 * Cria a instância na Evolution (se não existir) e aponta o webhook para esta API.
 * Uso: pnpm evolution:setup
 * Depois, abra {EVOLUTION_API_URL}/manager e leia o QR Code com o celular do bot.
 */
const { EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE = "elpatron", PUBLIC_URL, WEBHOOK_SECRET } = process.env;

if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !PUBLIC_URL || !WEBHOOK_SECRET) {
  console.error("Defina EVOLUTION_API_URL, EVOLUTION_API_KEY, PUBLIC_URL e WEBHOOK_SECRET no .env");
  process.exit(1);
}

const base = EVOLUTION_API_URL.replace(/\/$/, "");
const webhookUrl = `${PUBLIC_URL.replace(/\/$/, "")}/webhook/evolution/${WEBHOOK_SECRET}`;
const headers = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const webhook = {
  enabled: true,
  url: webhookUrl,
  byEvents: false,
  base64: true, // o áudio já chega no payload, sem chamada extra
  events: ["MESSAGES_UPSERT"],
};

const existing = await call("GET", `/instance/fetchInstances?instanceName=${encodeURIComponent(EVOLUTION_INSTANCE)}`);
const exists = existing.ok && existing.text.includes(`"${EVOLUTION_INSTANCE}"`);

if (!exists) {
  const created = await call("POST", "/instance/create", {
    instanceName: EVOLUTION_INSTANCE,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook,
  });
  console.log(created.ok ? "✅ Instância criada" : `❌ Erro ao criar instância (${created.status}): ${created.text}`);
} else {
  const set = await call("POST", `/webhook/set/${encodeURIComponent(EVOLUTION_INSTANCE)}`, { webhook });
  console.log(set.ok ? "✅ Webhook atualizado" : `❌ Erro ao configurar webhook (${set.status}): ${set.text}`);
}

console.log(`Webhook: ${webhookUrl.replace(WEBHOOK_SECRET, "***")}`);
console.log(`Agora abra ${base}/manager, entre na instância "${EVOLUTION_INSTANCE}" e leia o QR Code.`);
