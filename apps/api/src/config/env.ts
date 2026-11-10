import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  // URL pública desta API (Render). Usada no webhook e no OAuth do Google.
  PUBLIC_URL: z.url(),
  LOG_LEVEL: z.string().default("info"),
  DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),

  // IA
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  AI_HISTORY_MESSAGES: z.coerce.number().int().min(0).default(20),

  // Transcrição de áudio
  OPENAI_API_KEY: z.string().min(1),
  TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),

  // Supabase
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Evolution API
  EVOLUTION_API_URL: z.url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().default("elpatron"),
  // Segredo que vai na URL do webhook, para ninguém além da Evolution chamar.
  WEBHOOK_SECRET: z.string().min(16),

  // Google Calendar (opcional: sem isso as ferramentas de agenda ficam desligadas)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Segredo compartilhado com o painel web (apps/web) para o endpoint interno.
  // Sem ele, o endpoint /internal/send-message fica desligado.
  INTERNAL_API_SECRET: z.string().min(24).optional(),

  // 32 bytes em base64: `openssl rand -base64 32`
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY precisa ter 32 bytes em base64"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
