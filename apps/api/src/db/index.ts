import { createClient } from "@supabase/supabase-js";
import type { ChatMessage, Note, Reminder, Transaction, TransactionKind, User } from "@elpatron/shared";
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

export async function saveMessage(userId: string, role: ChatMessage["role"], content: string) {
  check(await db.from("chat_messages").insert({ user_id: userId, role, content }));
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

export async function insertReminder(userId: string, message: string, remindAt: string): Promise<Reminder> {
  return check(
    await db.from("reminders").insert({ user_id: userId, message, remind_at: remindAt }).select().single<Reminder>(),
  );
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
