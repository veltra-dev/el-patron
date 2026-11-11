"use server";

import { EXPENSE_CATEGORIES, firstOccurrence, localToIso, normalizePhone, type Recurrence } from "@elpatron/shared";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/dialog";
import { chatWithPatron, sendWhatsApp } from "@/lib/api";
import * as db from "@/lib/db";
import { money, parseMoney, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";

const id = (form: FormData) => String(form.get("id") ?? "");
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCategory = (v: string): v is (typeof EXPENSE_CATEGORIES)[number] => (EXPENSE_CATEGORIES as readonly string[]).includes(v);
const done = (): FormState => {
  revalidatePath("/", "layout");
  return { ok: true, at: Date.now() };
};

// ---------- transações ----------

export async function removeTransaction(form: FormData) {
  const user = await requireUser();
  await db.deleteTransaction(user, id(form));
  revalidatePath("/", "layout");
}

export async function togglePersonalTransaction(form: FormData) {
  const user = await requireUser();
  if (!user.partner_id) return;
  await db.togglePersonal(user.id, id(form));
  revalidatePath("/", "layout");
}

export async function createTransaction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = str(form, "kind") === "receita" ? "receita" : "despesa";
  const amount = parseMoney(form.get("amount"));
  const category = str(form, "category");
  const date = str(form, "date") || todayIn(user.timezone);
  if (!(amount > 0)) return { error: "Informe um valor maior que zero." };
  if (!isCategory(category)) return { error: "Escolha uma categoria." };
  if (!isDate(date)) return { error: "Data inválida." };
  await db.insertTransaction({
    user_id: user.id,
    kind,
    amount,
    category,
    description: str(form, "description") || null,
    occurred_on: date,
    personal: Boolean(user.partner_id && form.get("personal")),
  });
  return done();
}

// ---------- contas ----------

export async function markBillPaid(form: FormData) {
  const user = await requireUser();
  await db.payBill(user, id(form), todayIn(user.timezone));
  revalidatePath("/", "layout");
}

export async function removeBill(form: FormData) {
  const user = await requireUser();
  await db.deleteBill(user, id(form));
  revalidatePath("/", "layout");
}

export async function createBill(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const amount = parseMoney(form.get("amount"));
  const description = str(form, "description");
  const due = str(form, "due_on");
  const category = str(form, "category") || "contas";
  if (!description) return { error: "Dê um nome para a conta." };
  if (!(amount > 0)) return { error: "Informe um valor maior que zero." };
  if (!isDate(due)) return { error: "Informe o vencimento." };
  if (!isCategory(category)) return { error: "Categoria inválida." };
  await db.insertBill(user, { description, amount, category, due_on: due });
  return done();
}

// ---------- notas ----------

export async function removeNote(form: FormData) {
  const user = await requireUser();
  await db.deleteNote(user.id, id(form));
  revalidatePath("/notas");
}

export async function createNote(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = str(form, "content");
  if (!raw) return { error: "Escreva alguma coisa." };
  // #etiquetas no texto viram tags
  const tags = [...new Set([...raw.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]!.toLowerCase()))];
  const content = raw.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, "").trim() || raw;
  await db.insertNote(user.id, content, tags);
  return done();
}

// ---------- lembretes ----------

export async function removeReminder(form: FormData) {
  const user = await requireUser();
  await db.cancelReminder(user.id, id(form));
  revalidatePath("/lembretes");
}

export async function createReminder(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const message = str(form, "message");
  const date = str(form, "date");
  const time = str(form, "time");
  const rep = str(form, "repeat");
  if (!message) return { error: "Escreva o lembrete." };
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha data e horário." };
  const recurrence = (["diario", "dias_uteis", "semanal", "mensal"] as const).find((r) => r === rep) ?? null;
  const start = localToIso(date, time, user.timezone);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const days: number[] | null = recurrence === "semanal" ? [weekday] : recurrence === "mensal" ? [Number(date.slice(8, 10))] : null;
  const remindAt = recurrence ? firstOccurrence(start, recurrence as Recurrence, days, user.timezone) : start;
  if (new Date(remindAt).getTime() <= Date.now()) return { error: "Esse horário já passou." };
  await db.insertReminder({ user_id: user.id, message, remind_at: remindAt, recurrence, recurrence_days: days });
  return done();
}

// ---------- orçamentos ----------

export async function saveBudget(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const category = str(form, "category");
  const amount = parseMoney(form.get("amount"));
  if (!isCategory(category)) return { error: "Escolha uma categoria." };
  if (!(amount > 0)) return { error: "Informe o teto mensal." };
  await db.upsertBudget(user, category, amount);
  return done();
}

export async function removeBudget(form: FormData) {
  const user = await requireUser();
  await db.deleteBudget(user, id(form));
  revalidatePath("/", "layout");
}

export async function saveAlertPct(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const pct = Number(form.get("pct"));
  if (!Number.isInteger(pct) || pct < 10 || pct > 100) return { error: "Escolha entre 10% e 100%." };
  await db.setBudgetAlertPct(user.id, pct);
  return done();
}

// ---------- metas ----------

export async function createGoal(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(form, "name");
  const target = parseMoney(form.get("target"));
  const saved = form.get("saved") ? parseMoney(form.get("saved")) : 0;
  const deadline = str(form, "deadline");
  if (!name) return { error: "Dê um nome para a meta." };
  if (!(target > 0)) return { error: "Informe quanto quer juntar." };
  if (Number.isNaN(saved) || saved < 0) return { error: "Valor guardado inválido." };
  await db.insertGoal({ user_id: user.id, name, target_amount: target, saved_amount: saved, deadline: isDate(deadline) ? deadline : null });
  return done();
}

export async function depositGoal(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const amount = parseMoney(form.get("amount"));
  if (!(amount > 0)) return { error: "Informe um valor maior que zero." };
  await db.depositGoal(user, id(form), str(form, "op") === "retirar" ? -amount : amount);
  return done();
}

export async function removeGoal(form: FormData) {
  const user = await requireUser();
  await db.deleteGoal(user, id(form));
  revalidatePath("/", "layout");
}

// ---------- assinaturas ----------

export async function createSubscription(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = str(form, "kind") === "parcelamento" ? "parcelamento" : "assinatura";
  const description = str(form, "description");
  const amount = parseMoney(form.get("amount"));
  const day = Number(form.get("day"));
  const category = str(form, "category") || "assinaturas";
  const total = Number(form.get("total") || 0);
  const current = Number(form.get("current") || 1);
  if (!description) return { error: "Dê um nome." };
  if (!(amount > 0)) return { error: "Informe o valor mensal." };
  if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "Dia da cobrança entre 1 e 31." };
  if (!isCategory(category)) return { error: "Categoria inválida." };
  if (kind === "parcelamento" && (!Number.isInteger(total) || total < 2)) return { error: "Informe o total de parcelas." };
  if (kind === "parcelamento" && (!Number.isInteger(current) || current < 1 || current > total)) return { error: "Parcela atual inválida." };
  const today = todayIn(user.timezone);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 - (kind === "parcelamento" ? current - 1 : 0), 1)).toISOString().slice(0, 10);
  await db.insertSubscription(
    user,
    { kind, description, amount, category, billing_day: day, start_month: start, installments_total: kind === "parcelamento" ? total : null },
    today,
  );
  return done();
}

export async function removeSubscription(form: FormData) {
  const user = await requireUser();
  await db.cancelSubscription(user, id(form), todayIn(user.timezone));
  revalidatePath("/", "layout");
}

// ---------- modo casal ----------

export async function invitePartner(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.partner_id) return { error: "O modo casal já está ativo." };
  const phone = normalizePhone(str(form, "phone"));
  const other = await db.findUserByPhone(phone);
  if (!other) return { error: "Esse número ainda não usa o ElPatrón. A pessoa precisa ser cliente para juntar as contas." };
  if (other.id === user.id) return { error: "Esse é o seu próprio número 🙂" };
  if (other.partner_id) return { error: "Essa pessoa já está no modo casal com outra conta." };
  await db.createInvite(user.id, other.id);
  await sendWhatsApp(
    other.id,
    `💛 ${user.name} quer juntar as finanças com você no *ElPatrón* (conta conjunta). Para aceitar, abra o painel em *Modo casal*.`,
  ).catch(() => {});
  return done();
}

export async function answerInvite(form: FormData) {
  const user = await requireUser();
  const from = str(form, "from");
  if (str(form, "answer") === "aceitar") {
    const ok = await db.linkPartners(user.id, from);
    if (ok) await sendWhatsApp(from, `💛 ${user.name} aceitou! A conta conjunta está ativa: agora vocês veem os lançamentos um do outro no ElPatrón.`).catch(() => {});
  } else {
    await db.deleteInvite(from, user.id);
  }
  revalidatePath("/", "layout");
}

export async function cancelInvite(form: FormData) {
  const user = await requireUser();
  await db.deleteInvite(user.id, str(form, "to"));
  revalidatePath("/casal");
}

export async function unlinkPartner() {
  const user = await requireUser();
  if (user.partner_id) await db.unlinkPartners(user.id, user.partner_id);
  revalidatePath("/", "layout");
}

// ---------- chat ----------

export async function sendChat(text: string): Promise<{ reply?: string; error?: string }> {
  const user = await requireUser();
  const msg = text.trim();
  if (!msg) return { error: "Mensagem vazia." };
  if (msg.length > 2000) return { error: "Mensagem muito longa." };
  try {
    const { reply } = await chatWithPatron(user.id, msg);
    revalidatePath("/", "layout");
    return { reply };
  } catch {
    return { error: "O Patrón não respondeu agora. Tente de novo em instantes." };
  }
}
