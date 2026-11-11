import "server-only";
import { dueDateIn, forecast, monthOf, subscriptionDueIn, type Outflow, type User } from "@elpatron/shared";
import { listBills, listSubscriptions, overdueBills, transactionsBetween } from "./db";
import { todayIn } from "./format";

/** Mesma conta da ferramenta previsao_caixa da API: saldo do mês - contas abertas - assinaturas a lançar. */
export async function cashForecast(user: User) {
  const today = todayIn(user.timezone);
  const month = monthOf(today);
  const from = `${month}-01`;
  const end = dueDateIn(month, 31);
  const [txs, bills, late, subs] = await Promise.all([
    transactionsBetween(user.id, from, end),
    listBills(user.id, from, end),
    overdueBills(user.id, from),
    listSubscriptions(user.id),
  ]);
  const receitas = txs.filter((t) => t.kind === "receita").reduce((s, t) => s + Number(t.amount), 0);
  const despesas = txs.filter((t) => t.kind === "despesa").reduce((s, t) => s + Number(t.amount), 0);
  const balance = receitas - despesas;
  const open = [...late, ...bills.filter((b) => !b.paid_at)];
  const outflows: Outflow[] = open.map((b) => ({ date: b.due_on, amount: Number(b.amount), label: b.description }));
  for (const s of subs) {
    const due = subscriptionDueIn(s, month);
    if (!due || due.due_on < today || (s.last_billed_on && due.due_on <= s.last_billed_on)) continue;
    outflows.push({ date: due.due_on, amount: Number(s.amount), label: s.description });
  }
  return { today, end, month, balance, receitas, despesas, txs, open, outflows, ...forecast(balance, today, end, outflows) };
}
