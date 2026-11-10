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

export interface Reminder {
  id: string;
  user_id: string;
  message: string;
  remind_at: string;
  sent_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
