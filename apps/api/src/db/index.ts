import { createClient } from "@supabase/supabase-js";
import type { Bill, ChatMessage, Note, Recurrence, Reminder, Transaction, TransactionKind, User } from "@elpatron/shared";
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
}): Promise<Transaction> {
  return check(await db.from("transactions").insert(t).select().single<Transaction>());
}

export async function listTransactions(userId: string, from: string, to: string, category?: string): Promise<Transaction[]> {
  let q = db
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false });
  if (category) q = q.eq("category", category);
  return rows(await q.returns<Transaction[]>());
}

export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  const list = rows(await db.from("transactions").delete().eq("user_id", userId).eq("id", id).select("id"));
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
  rows: { user_id: string; description: string; amount: number; category: string; due_on: string; source: Bill["source"] }[],
): Promise<Bill[]> {
  if (rows.length === 0) return [];
  return rows_(await db.from("bills").insert(rows).select().returns<Bill[]>());
}

export async function listBills(userId: string, opts: { from?: string; to?: string; status?: "pendentes" | "pagas" | "todas" }): Promise<Bill[]> {
  let q = db.from("bills").select("*").eq("user_id", userId).order("due_on");
  if (opts.from) q = q.gte("due_on", opts.from);
  if (opts.to) q = q.lte("due_on", opts.to);
  if (opts.status === "pendentes") q = q.is("paid_at", null);
  if (opts.status === "pagas") q = q.not("paid_at", "is", null);
  return rows_(await q.returns<Bill[]>());
}

export async function getBill(userId: string, id: string): Promise<Bill | null> {
  return check(await db.from("bills").select("*").eq("user_id", userId).eq("id", id).maybeSingle<Bill>());
}

export async function markBillPaid(userId: string, id: string, transactionId: string | null) {
  check(
    await db
      .from("bills")
      .update({ paid_at: new Date().toISOString(), transaction_id: transactionId })
      .eq("user_id", userId)
      .eq("id", id),
  );
  // o lembrete de vencimento deixa de fazer sentido
  check(await db.from("reminders").delete().eq("bill_id", id).is("sent_at", null));
}

export async function deleteBill(userId: string, id: string): Promise<boolean> {
  const list = rows(await db.from("bills").delete().eq("user_id", userId).eq("id", id).select("id"));
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
  rows: { user_id: string; kind: TransactionKind; amount: number; category: string; description?: string; occurred_on: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const list = rows_(await db.from("transactions").insert(rows).select("id"));
  return list.length;
}
