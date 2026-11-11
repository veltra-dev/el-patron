import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  householdIds,
  householdKey,
  localToIso,
  monthOf,
  subscriptionDueIn,
  type Bill,
  type Budget,
  type ChatMessage,
  type Goal,
  type Member,
  type Note,
  type Recurrence,
  type Reminder,
  type Subscription,
  type Transaction,
  type User,
} from "@elpatron/shared";
import { env } from "./env";

// Toda leitura passa por aqui, sempre filtrada pelo usuário da sessão.
// A chave secret nunca sai do servidor do Next.
let client: SupabaseClient | null = null;
function db() {
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Conta conjunta: finanças vêm dos dois membros da casa; notas, lembretes e chat são pessoais.
type Filterable = { in(col: string, v: string[]): Filterable; or(f: string): Filterable };
function household<Q>(q: Q, u: Member): Q {
  return (q as unknown as Filterable).in("user_id", householdIds(u)) as unknown as Q;
}
/** Lançamentos pessoais do parceiro ficam de fora. */
function visibleTx<Q>(q: Q, u: Member): Q {
  const f = (q as unknown as Filterable).in("user_id", householdIds(u));
  return (u.partner_id ? f.or(`personal.eq.false,user_id.eq.${u.id}`) : f) as unknown as Q;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

export async function getUser(id: string): Promise<User | null> {
  return ok(await db().from("users").select("*").eq("id", id).maybeSingle<User>());
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  return ok(await db().from("users").select("*").eq("phone", phone).maybeSingle<User>());
}

// ---------- login ----------

export async function countRecentCodes(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await db()
    .from("login_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count ?? 0;
}

export async function insertLoginCode(userId: string, codeHash: string, expiresAt: string) {
  ok(await db().from("login_codes").insert({ user_id: userId, code_hash: codeHash, expires_at: expiresAt }));
}

export async function latestLoginCode(userId: string) {
  return ok(
    await db()
      .from("login_codes")
      .select("id, code_hash, attempts, expires_at, consumed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null }>(),
  );
}

export async function updateLoginCode(id: string, patch: { attempts?: number; consumed_at?: string }) {
  ok(await db().from("login_codes").update(patch).eq("id", id));
}

// ---------- dados do painel ----------

export async function transactionsBetween(u: Member, from: string, to: string): Promise<Transaction[]> {
  return (
    ok(
      await visibleTx(db().from("transactions").select("*"), u)
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<Transaction[]>(),
    ) ?? []
  );
}

export async function deleteTransaction(u: Member, id: string) {
  ok(await visibleTx(db().from("transactions").delete(), u).eq("id", id));
}

export async function listNotes(userId: string, query?: string): Promise<Note[]> {
  let q = db()
    .from("notes")
    .select("id, user_id, content, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (query) q = q.textSearch("search", query, { config: "portuguese", type: "websearch" });
  return ok(await q.returns<Note[]>()) ?? [];
}

export async function deleteNote(userId: string, id: string) {
  ok(await db().from("notes").delete().eq("user_id", userId).eq("id", id));
}

export async function listReminders(userId: string): Promise<{ pending: Reminder[]; sent: Reminder[] }> {
  const [pending, sent] = await Promise.all([
    db().from("reminders").select("*").eq("user_id", userId).is("sent_at", null).order("remind_at").returns<Reminder[]>(),
    db()
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .is("recurrence", null)
      .not("sent_at", "is", null)
      .order("remind_at", { ascending: false })
      .limit(20)
      .returns<Reminder[]>(),
  ]);
  return { pending: ok(pending) ?? [], sent: ok(sent) ?? [] };
}

export async function cancelReminder(userId: string, id: string) {
  ok(await db().from("reminders").delete().eq("user_id", userId).eq("id", id).is("sent_at", null));
}

// ---------- contas a pagar ----------

export async function listBills(u: Member, from: string, to: string): Promise<Bill[]> {
  return (
    ok(
      await household(db().from("bills").select("*"), u)
        .gte("due_on", from)
        .lte("due_on", to)
        .order("due_on")
        .returns<Bill[]>(),
    ) ?? []
  );
}

/** Contas pendentes vencidas antes de `before` (atrasadas). */
export async function overdueBills(u: Member, before: string): Promise<Bill[]> {
  return (
    ok(
      await household(db().from("bills").select("*"), u)
        .is("paid_at", null)
        .lt("due_on", before)
        .order("due_on")
        .returns<Bill[]>(),
    ) ?? []
  );
}

/** Marca como paga e lança a despesa no dia de hoje (mesmo comportamento do WhatsApp). */
export async function payBill(u: Member, id: string, today: string) {
  const bill = ok(await household(db().from("bills").select("*"), u).eq("id", id).maybeSingle<Bill>());
  if (!bill || bill.paid_at) return;
  const tx = ok(
    await db()
      .from("transactions")
      .insert({
        user_id: u.id, // quem pagou
        kind: "despesa",
        amount: bill.amount,
        category: bill.category,
        description: bill.description,
        occurred_on: today,
      })
      .select("id")
      .single<{ id: string }>(),
  );
  ok(await db().from("bills").update({ paid_at: new Date().toISOString(), transaction_id: tx.id }).eq("id", id));
  ok(await db().from("reminders").delete().eq("bill_id", id).is("sent_at", null));
}

export async function deleteBill(u: Member, id: string) {
  ok(await household(db().from("bills").delete(), u).eq("id", id));
}

// ---------- criação pelo painel ----------

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function insertTransaction(t: {
  user_id: string;
  kind: "despesa" | "receita";
  amount: number;
  category: string;
  description: string | null;
  occurred_on: string;
  personal?: boolean;
}) {
  ok(await db().from("transactions").insert({ ...t, source: "web" }));
}

/** Só quem lançou pode esconder/mostrar o lançamento para o parceiro. */
export async function togglePersonal(userId: string, id: string) {
  const t = ok(await db().from("transactions").select("personal").eq("user_id", userId).eq("id", id).maybeSingle<{ personal: boolean }>());
  if (!t) return;
  ok(await db().from("transactions").update({ personal: !t.personal }).eq("user_id", userId).eq("id", id));
}

/** Conta nova + aviso às 9h do vencimento (igual ao WhatsApp). */
export async function insertBill(user: User, b: { description: string; amount: number; category: string; due_on: string; subscription_id?: string; installment?: number | null }) {
  const { data, error } = await db()
    .from("bills")
    .insert({ user_id: user.id, source: "web", ...b })
    .select()
    .single<Bill>();
  if (error?.code === "23505") return null; // conta da assinatura já lançada
  if (error) throw new Error(`Supabase: ${error.message}`);
  const when = localToIso(data.due_on, "09:00", user.timezone);
  if (new Date(when).getTime() > Date.now()) {
    ok(
      await db().from("reminders").insert({
        user_id: user.id,
        message: `💸 Vence hoje: ${data.description}, ${brl.format(Number(data.amount))}. Quando pagar, me avisa que eu marco como paga.`,
        remind_at: when,
        bill_id: data.id,
      }),
    );
  }
  return data;
}

export async function insertNote(userId: string, content: string, tags: string[]) {
  ok(await db().from("notes").insert({ user_id: userId, content, tags }));
}

export async function insertReminder(r: { user_id: string; message: string; remind_at: string; recurrence: Recurrence | null; recurrence_days: number[] | null }) {
  ok(await db().from("reminders").insert(r));
}

export async function recentChat(userId: string, limit = 60): Promise<ChatMessage[]> {
  const list =
    ok(
      await db()
        .from("chat_messages")
        .select("id, user_id, role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<ChatMessage[]>(),
    ) ?? [];
  return list.reverse();
}

// ---------- orçamentos ----------

/** Orçamentos da casa; categoria repetida (de antes de juntar) vale a da chave da casa. */
export async function listBudgets(u: Member): Promise<Budget[]> {
  const key = householdKey(u);
  const list = ok(await household(db().from("budgets").select("*"), u).order("amount", { ascending: false }).returns<Budget[]>()) ?? [];
  const byCat = new Map<string, Budget>();
  for (const b of list) if (!byCat.has(b.category) || b.user_id === key) byCat.set(b.category, b);
  return [...byCat.values()];
}

export async function upsertBudget(u: Member, category: string, amount: number) {
  const key = householdKey(u);
  ok(await household(db().from("budgets").delete(), u).eq("category", category).neq("user_id", key));
  ok(await db().from("budgets").upsert({ user_id: key, category, amount }, { onConflict: "user_id,category" }));
}

export async function deleteBudget(u: Member, id: string) {
  const b = ok(await household(db().from("budgets").select("category"), u).eq("id", id).maybeSingle<{ category: string }>());
  if (b) ok(await household(db().from("budgets").delete(), u).eq("category", b.category));
}

export async function setBudgetAlertPct(userId: string, pct: number) {
  ok(await db().from("users").update({ budget_alert_pct: pct }).eq("id", userId));
}

// ---------- metas ----------

export async function listGoals(u: Member): Promise<Goal[]> {
  return ok(await household(db().from("goals").select("*"), u).order("created_at").returns<Goal[]>()) ?? [];
}

export async function insertGoal(g: { user_id: string; name: string; target_amount: number; deadline: string | null; saved_amount: number }) {
  ok(await db().from("goals").insert({ ...g, completed_at: g.saved_amount >= g.target_amount ? new Date().toISOString() : null }));
}

export async function depositGoal(u: Member, id: string, amount: number) {
  const g = ok(await household(db().from("goals").select("*"), u).eq("id", id).maybeSingle<Goal>());
  if (!g) return;
  ok(await db().from("goal_deposits").insert({ goal_id: id, user_id: u.id, amount }));
  const saved = Math.max(0, Math.round((Number(g.saved_amount) + amount) * 100) / 100);
  const done = saved >= Number(g.target_amount);
  ok(
    await db()
      .from("goals")
      .update({ saved_amount: saved, completed_at: done ? (g.completed_at ?? new Date().toISOString()) : null })
      .eq("id", id),
  );
}

export async function deleteGoal(u: Member, id: string) {
  ok(await household(db().from("goals").delete(), u).eq("id", id));
}

// ---------- assinaturas & parcelamentos ----------

export async function listSubscriptions(u: Member): Promise<Subscription[]> {
  return ok(await household(db().from("subscriptions").select("*"), u).eq("active", true).order("billing_day").returns<Subscription[]>()) ?? [];
}

/** Cria a assinatura e lança a conta deste mês se o vencimento ainda não passou (mesma regra da API). */
export async function insertSubscription(user: User, s: Omit<Subscription, "id" | "user_id" | "created_at" | "active" | "last_billed_on">, today: string) {
  const month = monthOf(today);
  const due = subscriptionDueIn(s, month);
  const billNow = due && due.due_on >= today;
  const sub = ok(
    await db()
      .from("subscriptions")
      .insert({ ...s, user_id: user.id, last_billed_on: due && !billNow ? due.due_on : null })
      .select()
      .single<Subscription>(),
  );
  if (due && billNow) {
    const label = s.kind === "parcelamento" && due.installment ? `${s.description} (${due.installment}/${s.installments_total})` : s.description;
    await insertBill(user, { description: label, amount: Number(s.amount), category: s.category, due_on: due.due_on, subscription_id: sub.id, installment: due.installment });
    ok(await db().from("subscriptions").update({ last_billed_on: due.due_on }).eq("id", sub.id));
  }
}

export async function cancelSubscription(u: Member, id: string, today: string) {
  const sub = ok(await household(db().from("subscriptions").update({ active: false }), u).eq("id", id).select("id").maybeSingle<{ id: string }>());
  if (sub) ok(await db().from("bills").delete().eq("subscription_id", id).is("paid_at", null).gt("due_on", today));
}

// ---------- modo casal ----------

export async function partnerInvites(userId: string) {
  const [sent, received] = await Promise.all([
    db().from("partner_invites").select("to_user, created_at, users:to_user(name, phone)").eq("from_user", userId),
    db().from("partner_invites").select("from_user, created_at, users:from_user(name, phone)").eq("to_user", userId),
  ]);
  type Row = { users: { name: string; phone: string } | null };
  return {
    sent: (ok(sent) as unknown as (Row & { to_user: string })[]) ?? [],
    received: (ok(received) as unknown as (Row & { from_user: string })[]) ?? [],
  };
}

export async function createInvite(from: string, to: string) {
  ok(await db().from("partner_invites").upsert({ from_user: from, to_user: to }, { onConflict: "from_user,to_user" }));
}

export async function deleteInvite(from: string, to: string) {
  ok(await db().from("partner_invites").delete().eq("from_user", from).eq("to_user", to));
}

/** Liga os dois (só se nenhum já tiver parceiro) e limpa os convites pendentes. */
export async function linkPartners(a: string, b: string): Promise<boolean> {
  const both = ok(await db().from("users").select("id, partner_id").in("id", [a, b]).returns<{ id: string; partner_id: string | null }[]>()) ?? [];
  if (both.length !== 2 || both.some((u) => u.partner_id)) return false;
  ok(await db().from("users").update({ partner_id: b }).eq("id", a));
  ok(await db().from("users").update({ partner_id: a }).eq("id", b));
  ok(await db().from("partner_invites").delete().or(`from_user.in.(${a},${b}),to_user.in.(${a},${b})`));
  return true;
}

export async function unlinkPartners(a: string, b: string) {
  ok(await db().from("users").update({ partner_id: null }).eq("id", a).eq("partner_id", b));
  ok(await db().from("users").update({ partner_id: null }).eq("id", b).eq("partner_id", a));
}
