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
  budget_alert_pct: number; // % do teto em que o Patrón avisa
  partner_id: string | null; // modo casal
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
  source: "whatsapp" | "importacao" | "web";
  personal: boolean; // conta conjunta: só quem lançou enxerga
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
  subscription_id: string | null;
  installment: number | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category: ExpenseCategory;
  amount: number;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null; // YYYY-MM-DD
  completed_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  kind: "assinatura" | "parcelamento";
  description: string;
  amount: number;
  category: ExpenseCategory;
  billing_day: number;
  start_month: string; // YYYY-MM-01
  installments_total: number | null;
  last_billed_on: string | null;
  active: boolean;
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

// Cálculos financeiros puros, usados pela API (ferramentas do Patrón) e pelo
// painel web, para os dois mostrarem sempre os mesmos números.

export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11" de "2026-11-10". */
export const monthOf = (date: string) => date.slice(0, 7);

export function lastDayOfMonth(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Vencimento no mês, com dia 31 caindo no último dia de meses curtos. */
export function dueDateIn(month: string, day: number): string {
  return `${month}-${String(Math.min(day, lastDayOfMonth(month))).padStart(2, "0")}`;
}

export function shiftMonthIso(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Quantos meses de `from` até `to` ("YYYY-MM"). */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number) as [number, number];
  const [y2, m2] = to.split("-").map(Number) as [number, number];
  return (y2 - y1) * 12 + (m2 - m1);
}

// ---------------- assinaturas & parcelamentos ----------------

type SubLike = {
  kind: "assinatura" | "parcelamento";
  amount: number | string;
  billing_day: number;
  start_month: string;
  installments_total: number | null;
};

/** Cobrança da assinatura/parcela no mês, ou null se não houver (antes do início ou depois da última parcela). */
export function subscriptionDueIn(sub: SubLike, month: string): { due_on: string; installment: number | null } | null {
  const n = monthsBetween(monthOf(sub.start_month), month) + 1;
  if (n < 1) return null;
  if (sub.kind === "parcelamento" && sub.installments_total && n > sub.installments_total) return null;
  return { due_on: dueDateIn(month, sub.billing_day), installment: sub.kind === "parcelamento" ? n : null };
}

/** Situação de um parcelamento hoje: parcela atual, quantas faltam e quanto falta pagar. */
export function installmentStatus(sub: SubLike, today: string) {
  const total = sub.installments_total ?? 0;
  const month = monthOf(today);
  let current = monthsBetween(monthOf(sub.start_month), month) + 1;
  // parcela do mês ainda não venceu: conta como "a pagar"
  const dueThisMonth = dueDateIn(month, sub.billing_day);
  const paidThrough = Math.max(0, Math.min(total, today >= dueThisMonth ? current : current - 1));
  current = Math.max(1, Math.min(total, current));
  const remaining = total - paidThrough;
  const endMonth = shiftMonthIso(monthOf(sub.start_month), total - 1);
  return { current, total, paid: paidThrough, remaining, remainingAmount: remaining * Number(sub.amount), endMonth };
}

// ---------------- orçamentos ----------------

export type BudgetLevel = "ok" | "alerta" | "estourou";

export function budgetStatus(spent: number, limit: number, alertPct: number) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const level: BudgetLevel = spent > limit ? "estourou" : pct >= alertPct ? "alerta" : "ok";
  return { pct, level, remaining: limit - spent };
}

// ---------------- previsão de caixa ----------------

export type Outflow = { date: string; amount: number; label: string };

/**
 * Projeta o saldo dia a dia, de hoje até `end`, descontando as saídas
 * previstas. Saídas com data anterior a hoje (atrasadas) caem hoje.
 */
export function forecast(startBalance: number, today: string, end: string, outflows: Outflow[]) {
  const byDay = new Map<string, number>();
  for (const o of outflows) {
    const d = o.date < today ? today : o.date;
    if (d > end) continue;
    byDay.set(d, (byDay.get(d) ?? 0) + o.amount);
  }
  const points: { date: string; balance: number }[] = [];
  let balance = startBalance;
  let zeroOn: string | null = startBalance < 0 ? today : null;
  for (let d = today; d <= end; d = addDaysIso(d, 1)) {
    balance -= byDay.get(d) ?? 0;
    points.push({ date: d, balance: Math.round(balance * 100) / 100 });
    if (zeroOn === null && balance < 0) zeroOn = d;
  }
  const totalOut = [...byDay.values()].reduce((s, v) => s + v, 0);
  return { points, endBalance: balance, zeroOn, totalOut, coverage: totalOut > 0 ? Math.max(0, startBalance) / totalOut : 1 };
}

// ---------------- conta conjunta (modo casal) ----------------

export type Member = Pick<User, "id" | "partner_id">;

/** Donos dos dados que o usuário enxerga: ele e, no modo casal, o parceiro. */
export function householdIds(u: Member): string[] {
  return u.partner_id ? [u.id, u.partner_id] : [u.id];
}

/** Dono dos dados únicos da casa (orçamentos e avisos): sempre o mesmo para os dois. */
export function householdKey(u: Member): string {
  return householdIds(u).sort()[0]!;
}
