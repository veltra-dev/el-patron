import {
  budgetStatus,
  categoryLabel,
  dueDateIn,
  forecast,
  localToIso,
  monthOf,
  subscriptionDueIn,
  type Bill,
  type Outflow,
  type Subscription,
  type User,
} from "@elpatron/shared";
import * as db from "../db/index.js";
import { formatDateTime, localDate } from "../lib/time.js";

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

// ---------------- orçamentos ----------------

/**
 * Depois de um gasto: se a categoria tem orçamento e cruzou o % de aviso (ou
 * estourou), devolve o texto do alerta, uma vez por nível por mês.
 */
export async function budgetAlert(user: User, category: string, date: string): Promise<string | null> {
  const budget = (await db.listBudgets(user.id)).find((b) => b.category === category);
  if (!budget) return null;
  const month = monthOf(date);
  const spent = (await db.spentByCategory(user.id, `${month}-01`, dueDateIn(month, 31)))[category] ?? 0;
  const limit = Number(budget.amount);
  const st = budgetStatus(spent, limit, user.budget_alert_pct);
  const label = categoryLabel(category);
  if (st.level === "estourou" && (await db.claimBudgetAlert(user.id, category, month, 100))) {
    return `Estourou o orçamento de ${label}: ${money(spent)} de ${money(limit)} (passou ${money(spent - limit)}).`;
  }
  if (st.level === "alerta" && (await db.claimBudgetAlert(user.id, category, month, user.budget_alert_pct))) {
    return `${label} chegou a ${Math.round(st.pct)}% do orçamento: ${money(spent)} de ${money(limit)}, restam ${money(st.remaining)}.`;
  }
  return null;
}

// ---------------- assinaturas ----------------

export function subscriptionBillLabel(sub: Pick<Subscription, "description" | "kind" | "installments_total">, installment: number | null) {
  return sub.kind === "parcelamento" && installment ? `${sub.description} (${installment}/${sub.installments_total})` : sub.description;
}

/** Lança a conta do mês da assinatura/parcela, se ainda não foi lançada. */
export async function billSubscription(sub: Subscription, user: User): Promise<Bill | null> {
  const today = localDate(user.timezone);
  const month = monthOf(today);
  const due = subscriptionDueIn(sub, month);
  if (!due) {
    // parcelamento já terminou
    if (sub.kind === "parcelamento" && month > monthOf(sub.start_month)) await db.updateSubscription(sub.id, { active: false });
    return null;
  }
  if (sub.last_billed_on && due.due_on <= sub.last_billed_on) return null;
  const bill = await db.insertSubscriptionBill({
    user_id: user.id,
    description: subscriptionBillLabel(sub, due.installment),
    amount: Number(sub.amount),
    category: sub.category,
    due_on: due.due_on,
    subscription_id: sub.id,
    installment: due.installment,
  });
  await db.updateSubscription(sub.id, { last_billed_on: due.due_on });
  if (bill) await createBillReminder(user, bill);
  return bill;
}

// ---------------- previsão de caixa ----------------

/** Saldo do mês até hoje e projeção até o fim do mês, descontando contas e assinaturas ainda não lançadas. */
export async function cashForecast(user: User) {
  const today = localDate(user.timezone);
  const month = monthOf(today);
  const end = dueDateIn(month, 31);
  const [txs, bills, subs] = await Promise.all([
    db.listTransactions(user.id, `${month}-01`, end),
    db.listBills(user.id, { to: end, status: "pendentes" }),
    db.listSubscriptions(user.id),
  ]);
  const balance = txs.reduce((s, t) => s + (t.kind === "receita" ? 1 : -1) * Number(t.amount), 0);
  const outflows: Outflow[] = bills.map((b) => ({ date: b.due_on, amount: Number(b.amount), label: b.description }));
  for (const sub of subs) {
    const due = subscriptionDueIn(sub, month);
    if (!due || due.due_on < today || (sub.last_billed_on && due.due_on <= sub.last_billed_on)) continue;
    outflows.push({ date: due.due_on, amount: Number(sub.amount), label: subscriptionBillLabel(sub, due.installment) });
  }
  return { today, end, balance, outflows, ...forecast(balance, today, end, outflows) };
}

