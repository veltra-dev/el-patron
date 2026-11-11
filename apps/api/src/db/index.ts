import { createClient } from "@supabase/supabase-js";
import { householdIds, householdKey, type Bill, type Budget, type ChatMessage, type Goal, type Member, type Note, type Recurrence, type Reminder, type Subscription, type Transaction, type TransactionKind, type User } from "@elpatron/shared";
import { env } from "../config/env.js";

export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

function rows<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  return check(res) ?? [];
}
const rows_ = rows;

// Conta conjunta: finanças (transações, contas, orçamentos, metas, assinaturas)
// são lidas dos dois membros da casa. Notas, lembretes e histórico seguem pessoais.
type Filterable = { in(col: string, v: string[]): Filterable; or(f: string): Filterable };
function household<Q>(q: Q, u: Member): Q {
  return (q as unknown as Filterable).in("user_id", householdIds(u)) as unknown as Q;
}
/** Transações do parceiro marcadas como pessoais não aparecem. */
function visibleTx<Q>(q: Q, u: Member): Q {
  const f = (q as unknown as Filterable).in("user_id", householdIds(u));
  return (u.partner_id ? f.or(`personal.eq.false,user_id.eq.${u.id}`) : f) as unknown as Q;
}

// ---------- idempotência ----------

/** Retorna true se a mensagem ainda não tinha sido processada (e a marca como processada). */
export async function claimMessage(id: string): Promise<boolean> {
  const { error } = await db.from("processed_messages").insert({ id });
  if (!error) return true;
  if (error.code === "23505") return false; // unique_violation
  throw new Error(`Supabase: ${error.message}`);
}

// ---------- usuários ----------

export async function findUserByPhone(phone: string): Promise<User | null> {
  return check(await db.from("users").select("*").eq("phone", phone).maybeSingle<User>());
}

export async function getUser(id: string): Promise<User | null> {
  return check(await db.from("users").select("*").eq("id", id).maybeSingle<User>());
}

export async function updateUser(id: string, patch: Partial<Pick<User, "wa_number" | "google_refresh_token" | "timezone">>) {
  check(await db.from("users").update(patch).eq("id", id));
}

// ---------- histórico ----------

export async function recentMessages(userId: string, limit: number): Promise<ChatMessage[]> {
  if (limit === 0) return [];
  const list = rows(
    await db
      .from("chat_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ChatMessage[]>(),
  );
  return list.reverse();
}

export async function saveMessage(userId: string, role: ChatMessage["role"], content: string, blocks?: unknown[]) {
  check(await db.from("chat_messages").insert({ user_id: userId, role, content, blocks: blocks ?? null }));
}

// ---------- finanças ----------

export async function insertTransaction(t: {
  user_id: string;
  kind: TransactionKind;
  amount: number;
  category: string;
  description?: string;
  occurred_on: string;
  source?: Transaction["source"];
  personal?: boolean;
}): Promise<Transaction> {
  return check(await db.from("transactions").insert(t).select().single<Transaction>());
}

export async function listTransactions(u: Member, from: string, to: string, category?: string): Promise<Transaction[]> {
  let q = visibleTx(db.from("transactions").select("*"), u)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false });
  if (category) q = q.eq("category", category);
  return rows(await q.returns<Transaction[]>());
}

export async function deleteTransaction(u: Member, id: string): Promise<boolean> {
  const list = rows(await visibleTx(db.from("transactions").delete(), u).eq("id", id).select("id"));
  return list.length > 0;
}

// ---------- notas ----------

export async function insertNote(userId: string, content: string, tags: string[]): Promise<Note> {
  return check(
    await db.from("notes").insert({ user_id: userId, content, tags }).select("id, user_id, content, tags, created_at").single<Note>(),
  );
}

export async function searchNotes(userId: string, query: string | undefined, limit: number): Promise<Note[]> {
  let q = db
    .from("notes")
    .select("id, user_id, content, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (query) q = q.textSearch("search", query, { config: "portuguese", type: "websearch" });
  return rows(await q.returns<Note[]>());
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const list = rows(await db.from("notes").delete().eq("user_id", userId).eq("id", id).select("id"));
  return list.length > 0;
}

// ---------- lembretes ----------

export async function insertReminder(r: {
  user_id: string;
  message: string;
  remind_at: string;
  recurrence?: Recurrence | null;
  recurrence_days?: number[] | null;
  bill_id?: string | null;
}): Promise<Reminder> {
  return check(await db.from("reminders").insert(r).select().single<Reminder>());
}

export async function pendingReminders(userId: string): Promise<Reminder[]> {
  return rows(
    await db
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .is("sent_at", null)
      .order("remind_at")
      .returns<Reminder[]>(),
  );
}

export async function cancelReminder(userId: string, id: string): Promise<boolean> {
  const list = rows(
    await db.from("reminders").delete().eq("user_id", userId).eq("id", id).is("sent_at", null).select("id"),
  );
  return list.length > 0;
}

/** Reagenda um lembrete recorrente para a próxima ocorrência. */
export async function rescheduleReminder(id: string, nextIso: string, sentAt: string) {
  check(await db.from("reminders").update({ remind_at: nextIso, sent_at: null, last_sent_at: sentAt }).eq("id", id));
}

/** Marca como enviados os lembretes vencidos e os devolve (claim atômico por linha). */
export async function claimDueReminders(): Promise<Reminder[]> {
  return rows(
    await db
      .from("reminders")
      .update({ sent_at: new Date().toISOString() })
      .is("sent_at", null)
      .lte("remind_at", new Date().toISOString())
      .select()
      .returns<Reminder[]>(),
  );
}

// ---------- contas a pagar ----------

export async function insertBills(
  rows: {
    user_id: string;
    description: string;
    amount: number;
    category: string;
    due_on: string;
    source: Bill["source"];
    subscription_id?: string;
    installment?: number | null;
  }[],
): Promise<Bill[]> {
  if (rows.length === 0) return [];
  return rows_(await db.from("bills").insert(rows).select().returns<Bill[]>());
}

export async function listBills(u: Member, opts: { from?: string; to?: string; status?: "pendentes" | "pagas" | "todas" }): Promise<Bill[]> {
  let q = household(db.from("bills").select("*"), u).order("due_on");
  if (opts.from) q = q.gte("due_on", opts.from);
  if (opts.to) q = q.lte("due_on", opts.to);
  if (opts.status === "pendentes") q = q.is("paid_at", null);
  if (opts.status === "pagas") q = q.not("paid_at", "is", null);
  return rows_(await q.returns<Bill[]>());
}

export async function getBill(u: Member, id: string): Promise<Bill | null> {
  return check(await household(db.from("bills").select("*"), u).eq("id", id).maybeSingle<Bill>());
}

export async function markBillPaid(u: Member, id: string, transactionId: string | null) {
  check(await household(db.from("bills").update({ paid_at: new Date().toISOString(), transaction_id: transactionId }), u).eq("id", id));
  // o lembrete de vencimento deixa de fazer sentido
  check(await db.from("reminders").delete().eq("bill_id", id).is("sent_at", null));
}

export async function deleteBill(u: Member, id: string): Promise<boolean> {
  const list = rows(await household(db.from("bills").delete(), u).eq("id", id).select("id"));
  return list.length > 0;
}

// ---------- importações pendentes ----------

export async function savePendingImport(userId: string, fileName: string | null, payload: unknown): Promise<string> {
  // só uma importação pendente por vez
  check(await db.from("pending_imports").delete().eq("user_id", userId));
  const row = check(
    await db.from("pending_imports").insert({ user_id: userId, file_name: fileName, payload }).select("id").single<{ id: string }>(),
  );
  return row.id;
}

export async function takePendingImport(userId: string, maxAgeHours = 24) {
  const since = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  const row = check(
    await db
      .from("pending_imports")
      .select("id, file_name, payload")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; file_name: string | null; payload: unknown }>(),
  );
  if (row) check(await db.from("pending_imports").delete().eq("id", row.id));
  return row;
}

export async function discardPendingImport(userId: string): Promise<boolean> {
  const list = rows(await db.from("pending_imports").delete().eq("user_id", userId).select("id"));
  return list.length > 0;
}

export async function insertTransactions(
  rows: {
    user_id: string;
    kind: TransactionKind;
    amount: number;
    category: string;
    description?: string;
    occurred_on: string;
    source?: Transaction["source"];
  }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const list = rows_(await db.from("transactions").insert(rows).select("id"));
  return list.length;
}

// ---------- números fora da whitelist ----------

/**
 * Registra a mensagem de um número desconhecido e diz se devemos responder
 * o aviso agora (primeira vez, ou passou `cooldownDays` desde o último aviso).
 */
export async function trackUnknownContact(phone: string, pushName: string | undefined, cooldownDays: number): Promise<boolean> {
  const now = new Date();
  const existing = check(
    await db
      .from("unknown_contacts")
      .select("message_count, last_replied_at")
      .eq("phone", phone)
      .maybeSingle<{ message_count: number; last_replied_at: string | null }>(),
  );
  const shouldReply =
    !existing?.last_replied_at || now.getTime() - new Date(existing.last_replied_at).getTime() > cooldownDays * 86_400_000;
  check(
    await db.from("unknown_contacts").upsert(
      {
        phone,
        push_name: pushName ?? null,
        message_count: (existing?.message_count ?? 0) + 1,
        last_seen_at: now.toISOString(),
        ...(shouldReply ? { last_replied_at: now.toISOString() } : {}),
      },
      { onConflict: "phone" },
    ),
  );
  return shouldReply;
}

// ---------- orçamentos ----------

/** Orçamentos da casa. Se os dois tinham teto para a mesma categoria antes de juntar, vale o da chave da casa. */
export async function listBudgets(u: Member): Promise<Budget[]> {
  const key = householdKey(u);
  const list = rows(await household(db.from("budgets").select("*"), u).order("category").returns<Budget[]>());
  const byCat = new Map<string, Budget>();
  for (const b of list) if (!byCat.has(b.category) || b.user_id === key) byCat.set(b.category, b);
  return [...byCat.values()];
}

export async function upsertBudget(u: Member, category: string, amount: number): Promise<Budget> {
  const key = householdKey(u);
  check(await household(db.from("budgets").delete(), u).eq("category", category).neq("user_id", key));
  return check(
    await db
      .from("budgets")
      .upsert({ user_id: key, category, amount }, { onConflict: "user_id,category" })
      .select()
      .single<Budget>(),
  );
}

export async function deleteBudget(u: Member, category: string): Promise<boolean> {
  const list = rows(await household(db.from("budgets").delete(), u).eq("category", category).select("id"));
  return list.length > 0;
}

/** Total de despesas por categoria entre duas datas (da casa, no modo casal). */
export async function spentByCategory(u: Member, from: string, to: string): Promise<Record<string, number>> {
  const list = rows(
    await visibleTx(db.from("transactions").select("category, amount"), u)
      .eq("kind", "despesa")
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .returns<{ category: string; amount: number }[]>(),
  );
  const out: Record<string, number> = {};
  for (const r of list) out[r.category] = (out[r.category] ?? 0) + Number(r.amount);
  return out;
}

/** Registra que o aviso foi mandado; false se já tinha sido neste mês. */
export async function claimBudgetAlert(u: Member, category: string, month: string, level: number): Promise<boolean> {
  // pela chave da casa: o aviso sai uma vez só, para quem fez o gasto que cruzou o limite
  const { error } = await db.from("budget_alerts_sent").insert({ user_id: householdKey(u), category, month, level });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Supabase: ${error.message}`);
}

export async function setBudgetAlertPct(userId: string, pct: number) {
  check(await db.from("users").update({ budget_alert_pct: pct }).eq("id", userId));
}

// ---------- metas ----------

export async function listGoals(u: Member): Promise<Goal[]> {
  return rows(await household(db.from("goals").select("*"), u).order("created_at").returns<Goal[]>());
}

export async function insertGoal(g: { user_id: string; name: string; target_amount: number; deadline?: string | null; saved_amount?: number }): Promise<Goal> {
  return check(await db.from("goals").insert(g).select().single<Goal>());
}

export async function getGoal(u: Member, id: string): Promise<Goal | null> {
  return check(await household(db.from("goals").select("*"), u).eq("id", id).maybeSingle<Goal>());
}

/** Guarda (ou retira, se negativo) dinheiro na meta. Devolve a meta atualizada. */
export async function depositGoal(u: Member, goal: Goal, amount: number): Promise<Goal> {
  check(await db.from("goal_deposits").insert({ goal_id: goal.id, user_id: u.id, amount }));
  const saved = Math.max(0, Math.round((Number(goal.saved_amount) + amount) * 100) / 100);
  const done = saved >= Number(goal.target_amount);
  return check(
    await db
      .from("goals")
      .update({ saved_amount: saved, completed_at: done ? (goal.completed_at ?? new Date().toISOString()) : null })
      .eq("id", goal.id)
      .select()
      .single<Goal>(),
  );
}

export async function deleteGoal(u: Member, id: string): Promise<boolean> {
  const list = rows(await household(db.from("goals").delete(), u).eq("id", id).select("id"));
  return list.length > 0;
}

// ---------- assinaturas & parcelamentos ----------

export async function insertSubscription(s: Omit<Subscription, "id" | "created_at" | "active" | "last_billed_on"> & { last_billed_on?: string | null }): Promise<Subscription> {
  return check(await db.from("subscriptions").insert(s).select().single<Subscription>());
}

export async function listSubscriptions(u: Member, onlyActive = true): Promise<Subscription[]> {
  let q = household(db.from("subscriptions").select("*"), u).order("billing_day");
  if (onlyActive) q = q.eq("active", true);
  return rows(await q.returns<Subscription[]>());
}

export async function activeSubscriptionsAllUsers(): Promise<Subscription[]> {
  return rows(await db.from("subscriptions").select("*").eq("active", true).returns<Subscription[]>());
}

export async function updateSubscription(id: string, patch: Partial<Pick<Subscription, "last_billed_on" | "active">>) {
  check(await db.from("subscriptions").update(patch).eq("id", id));
}

export async function cancelSubscription(u: Member, id: string): Promise<boolean> {
  const list = rows(await household(db.from("subscriptions").update({ active: false }), u).eq("id", id).select("id"));
  if (list.length) {
    // contas futuras ainda não pagas dessa assinatura saem junto
    const today = new Date().toISOString().slice(0, 10);
    check(await db.from("bills").delete().eq("subscription_id", id).is("paid_at", null).gt("due_on", today));
  }
  return list.length > 0;
}

/** Insere a conta do mês da assinatura; false se já existia. */
export async function insertSubscriptionBill(b: {
  user_id: string;
  description: string;
  amount: number;
  category: string;
  due_on: string;
  subscription_id: string;
  installment: number | null;
}): Promise<Bill | null> {
  const { data, error } = await db.from("bills").insert({ ...b, source: "web" }).select().single<Bill>();
  if (error?.code === "23505") return null;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}
