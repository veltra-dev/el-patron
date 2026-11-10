import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Bill, Note, Reminder, Transaction, User } from "@elpatron/shared";
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

export async function transactionsBetween(userId: string, from: string, to: string): Promise<Transaction[]> {
  return (
    ok(
      await db()
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<Transaction[]>(),
    ) ?? []
  );
}

export async function deleteTransaction(userId: string, id: string) {
  ok(await db().from("transactions").delete().eq("user_id", userId).eq("id", id));
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

export async function listBills(userId: string, from: string, to: string): Promise<Bill[]> {
  return (
    ok(
      await db()
        .from("bills")
        .select("*")
        .eq("user_id", userId)
        .gte("due_on", from)
        .lte("due_on", to)
        .order("due_on")
        .returns<Bill[]>(),
    ) ?? []
  );
}

/** Contas pendentes vencidas antes de `before` (atrasadas). */
export async function overdueBills(userId: string, before: string): Promise<Bill[]> {
  return (
    ok(
      await db()
        .from("bills")
        .select("*")
        .eq("user_id", userId)
        .is("paid_at", null)
        .lt("due_on", before)
        .order("due_on")
        .returns<Bill[]>(),
    ) ?? []
  );
}

/** Marca como paga e lança a despesa no dia de hoje (mesmo comportamento do WhatsApp). */
export async function payBill(userId: string, id: string, today: string) {
  const bill = ok(await db().from("bills").select("*").eq("user_id", userId).eq("id", id).maybeSingle<Bill>());
  if (!bill || bill.paid_at) return;
  const tx = ok(
    await db()
      .from("transactions")
      .insert({
        user_id: userId,
        kind: "despesa",
        amount: bill.amount,
        category: bill.category,
        description: bill.description,
        occurred_on: today,
      })
      .select("id")
      .single<{ id: string }>(),
  );
  ok(await db().from("bills").update({ paid_at: new Date().toISOString(), transaction_id: tx.id }).eq("id", id).eq("user_id", userId));
  ok(await db().from("reminders").delete().eq("bill_id", id).is("sent_at", null));
}

export async function deleteBill(userId: string, id: string) {
  ok(await db().from("bills").delete().eq("user_id", userId).eq("id", id));
}
