import { localToIso, type Bill, type User } from "@elpatron/shared";
import * as db from "../db/index.js";
import { formatDateTime } from "../lib/time.js";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number) => brl.format(v);

const BILL_REMINDER_TIME = "09:00";

/** "vence hoje", "vence amanhã", "vence em 5 dias", "venceu há 3 dias" — calculado aqui, não pelo modelo. */
export function dueLabel(dueOn: string, today: string): string {
  const days = Math.round((Date.parse(`${dueOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days > 1) return `vence em ${days} dias`;
  return days === -1 ? "venceu ontem" : `venceu há ${-days} dias`;
}

/** Lembrete às 9h do dia do vencimento. Não cria se esse horário já passou. */
export async function createBillReminder(user: User, bill: Bill): Promise<string | null> {
  const when = localToIso(bill.due_on, BILL_REMINDER_TIME, user.timezone);
  if (new Date(when).getTime() <= Date.now()) return null;
  await db.insertReminder({
    user_id: user.id,
    message: `💸 Vence hoje: ${bill.description}, ${money(Number(bill.amount))}. Quando pagar, me avisa que eu marco como paga.`,
    remind_at: when,
    bill_id: bill.id,
  });
  return formatDateTime(when, user.timezone);
}

type Tx = { tipo: "despesa" | "receita"; valor: number; categoria: string; descricao: string; data: string };
type Conta = { descricao: string; valor: number; vencimento: string };

/** Resumo do rascunho para o modelo apresentar ao usuário. */
export async function importSummary(userId: string, txs: Tx[], contas: Conta[], today: string) {
  const despesas = txs.filter((t) => t.tipo === "despesa");
  const receitas = txs.filter((t) => t.tipo === "receita");
  const porCategoria: Record<string, number> = {};
  for (const t of despesas) porCategoria[t.categoria] = (porCategoria[t.categoria] ?? 0) + t.valor;

  let possiveisDuplicadas = 0;
  if (txs.length) {
    const dates = txs.map((t) => t.data).sort();
    const existing = await db.listTransactions(userId, dates[0]!, dates.at(-1)!);
    const seen = new Set(existing.map((e) => `${e.occurred_on}|${Number(e.amount).toFixed(2)}`));
    possiveisDuplicadas = txs.filter((t) => seen.has(`${t.data}|${t.valor.toFixed(2)}`)).length;
  }

  const dates = txs.map((t) => t.data).sort();
  return {
    transacoes: {
      quantidade: txs.length,
      periodo: dates.length ? { de: dates[0], ate: dates.at(-1) } : null,
      total_despesas: money(despesas.reduce((s, t) => s + t.valor, 0)),
      total_receitas: money(receitas.reduce((s, t) => s + t.valor, 0)),
      despesas_por_categoria: Object.fromEntries(
        Object.entries(porCategoria)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [k, money(v)]),
      ),
      possiveis_duplicadas_ja_registradas: possiveisDuplicadas,
    },
    contas_a_pagar: {
      quantidade: contas.length,
      total: money(contas.reduce((s, c) => s + c.valor, 0)),
      itens: [...contas]
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
        .map((c) => ({ descricao: c.descricao, valor: money(c.valor), vencimento: c.vencimento, situacao: dueLabel(c.vencimento, today) })),
    },
  };
}
