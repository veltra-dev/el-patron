// Tipos e constantes compartilhados entre a API e o futuro app web.
// Espelham as tabelas definidas em supabase/migrations.

export const EXPENSE_CATEGORIES = [
  "alimentacao",
  "mercado",
  "transporte",
  "moradia",
  "contas",
  "saude",
  "educacao",
  "lazer",
  "compras",
  "assinaturas",
  "viagem",
  "pets",
  "presentes",
  "investimentos",
  "salario",
  "outros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type TransactionKind = "despesa" | "receita";

export interface User {
  id: string;
  phone: string; // normalizado (55 + DDD + 9 dígitos)
  wa_number: string | null; // número exatamente como o WhatsApp entrega
  name: string;
  timezone: string;
  google_refresh_token: string | null; // criptografado
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  kind: TransactionKind;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  content: string;
  tags: string[];
  created_at: string;
}

export type Recurrence = "diario" | "dias_uteis" | "semanal" | "mensal";

export interface Reminder {
  id: string;
  user_id: string;
  message: string;
  remind_at: string; // próxima ocorrência
  sent_at: string | null; // só para lembretes únicos
  recurrence: Recurrence | null;
  recurrence_days: number[] | null;
  last_sent_at: string | null;
  bill_id: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  due_on: string; // YYYY-MM-DD
  paid_at: string | null;
  transaction_id: string | null;
  source: "whatsapp" | "importacao" | "web";
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  /** Mensagens da rodada (tool_use/tool_result + resposta final), no formato da API. */
  blocks: unknown[] | null;
  created_at: string;
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  alimentacao: "Alimentação",
  mercado: "Mercado",
  transporte: "Transporte",
  moradia: "Moradia",
  contas: "Contas",
  saude: "Saúde",
  educacao: "Educação",
  lazer: "Lazer",
  compras: "Compras",
  assinaturas: "Assinaturas",
  viagem: "Viagem",
  pets: "Pets",
  presentes: "Presentes",
  investimentos: "Investimentos",
  salario: "Salário",
  outros: "Outros",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as ExpenseCategory] ?? c;
}

/**
 * Normaliza números brasileiros para 55 + DDD + 9 dígitos.
 * Aceita "(16) 99798-7859", "16997987859", "+55 16 9 9798-7859"...
 * Contas antigas do WhatsApp entregam o JID sem o nono dígito
 * (ex.: 551688887777), então adicionamos o 9 para casar com a whitelist.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`; // sem DDI
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits;
}

// ---------------- datas e recorrência ----------------

/** Offset do fuso no instante dado, ex.: "-03:00". */
export function tzOffset(timeZone: string, date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m?.[1] ?? "+00:00";
}

/** Converte data + hora locais ("2026-11-12", "09:00") em instante ISO no fuso. */
export function localToIso(date: string, time: string, timeZone: string): string {
  const offset = tzOffset(timeZone, new Date(`${date}T12:00:00Z`));
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}

/** Partes locais (data, hora, dia da semana) de um instante no fuso. */
export function localParts(iso: string | Date, timeZone: string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, time, weekday };
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function matches(date: string, recurrence: Recurrence, days: number[] | null): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = d.getUTCDay();
  switch (recurrence) {
    case "diario":
      return true;
    case "dias_uteis":
      return wd >= 1 && wd <= 5;
    case "semanal":
      return (days ?? []).includes(wd);
    case "mensal": {
      const want = days?.[0] ?? 1;
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return d.getUTCDate() === Math.min(want, lastDay); // dia 31 cai no último dia de meses curtos
    }
  }
}

/**
 * Próxima ocorrência (estritamente depois de `after`) de um lembrete recorrente,
 * mantendo o horário local de `anchorIso`. Ocorrências perdidas são puladas.
 */
export function nextOccurrence(
  anchorIso: string,
  recurrence: Recurrence,
  days: number[] | null,
  timeZone: string,
  after = new Date(),
): string {
  const { time } = localParts(anchorIso, timeZone);
  let date = localParts(after, timeZone).date;
  for (let i = 0; i < 800; i++, date = addDays(date, 1)) {
    if (!matches(date, recurrence, days)) continue;
    const iso = localToIso(date, time, timeZone);
    if (new Date(iso) > after) return iso;
  }
  throw new Error("Não encontrei próxima ocorrência");
}

/** A primeira ocorrência válida a partir de `startIso` (inclusive). */
export function firstOccurrence(startIso: string, recurrence: Recurrence, days: number[] | null, timeZone: string): string {
  return nextOccurrence(startIso, recurrence, days, timeZone, new Date(new Date(startIso).getTime() - 1000));
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Dias úteis às 09:00", "Toda segunda e quarta às 18:30", "Todo dia 10 às 08:00". */
export function describeRecurrence(r: Pick<Reminder, "recurrence" | "recurrence_days" | "remind_at">, timeZone: string): string | null {
  if (!r.recurrence) return null;
  const { time } = localParts(r.remind_at, timeZone);
  switch (r.recurrence) {
    case "diario":
      return `Todo dia às ${time}`;
    case "dias_uteis":
      return `Dias úteis às ${time}`;
    case "semanal": {
      const names = [...(r.recurrence_days ?? [])].sort().map((d) => WEEKDAYS[d]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0];
      return `Toda ${list} às ${time}`;
    }
    case "mensal":
      return `Todo dia ${r.recurrence_days?.[0] ?? "?"} às ${time}`;
  }
}
