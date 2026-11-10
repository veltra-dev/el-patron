import Link from "next/link";
import { categoryLabel } from "@elpatron/shared";
import { CategoryBars, MonthlyColumns, StatTile } from "@/components/charts";
import { MonthSwitcher } from "@/components/month-switcher";
import { listBills, overdueBills, transactionsBetween } from "@/lib/db";
import { currentMonth, dayMonth, isValidMonth, money, monthLabel, monthRange, shiftMonth } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Resumo · ElPatrón" };

export default async function ResumoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes } = await searchParams;
  const month = isValidMonth(mes) && mes <= current ? mes : current;

  // Uma consulta para os 6 meses do gráfico; o mês selecionado sai dela.
  const firstMonth = shiftMonth(month, -5);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date());
  const [all, monthBills, overdue] = await Promise.all([
    transactionsBetween(user.id, monthRange(firstMonth).from, monthRange(month).to),
    listBills(user.id, monthRange(month).from, monthRange(month).to),
    month === current ? overdueBills(user.id, monthRange(month).from) : Promise.resolve([]),
  ]);
  const openBills = [...overdue, ...monthBills.filter((b) => !b.paid_at)];
  const openTotal = openBills.reduce((s, b) => s + Number(b.amount), 0);
  const inMonth = all.filter((t) => t.occurred_on.startsWith(month));

  const despesas = inMonth.filter((t) => t.kind === "despesa");
  const totalDespesa = despesas.reduce((s, t) => s + Number(t.amount), 0);
  const totalReceita = inMonth.filter((t) => t.kind === "receita").reduce((s, t) => s + Number(t.amount), 0);
  const saldo = totalReceita - totalDespesa;

  const byCat = new Map<string, { value: number; count: number }>();
  for (const t of despesas) {
    const c = byCat.get(t.category) ?? { value: 0, count: 0 };
    c.value += Number(t.amount);
    c.count += 1;
    byCat.set(t.category, c);
  }
  const catRows = [...byCat.entries()]
    .map(([cat, v]) => ({ label: categoryLabel(cat), ...v }))
    .sort((a, b) => b.value - a.value);

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(firstMonth, i)).map((m) => {
    const ts = all.filter((t) => t.occurred_on.startsWith(m));
    return {
      month: m,
      label: monthLabel(m, "short"),
      despesa: ts.filter((t) => t.kind === "despesa").reduce((s, t) => s + Number(t.amount), 0),
      receita: ts.filter((t) => t.kind === "receita").reduce((s, t) => s + Number(t.amount), 0),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Resumo</h1>
        <MonthSwitcher month={month} current={current} basePath="/" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Despesas" value={totalDespesa} hint={`${despesas.length} lançamento${despesas.length === 1 ? "" : "s"}`} />
        <StatTile label="Receitas" value={totalReceita} />
        <div className="col-span-2 sm:col-span-1">
          <StatTile label="Saldo" value={saldo} tone={inMonth.length ? (saldo >= 0 ? "good" : "bad") : undefined} />
        </div>
      </div>

      {openBills.length > 0 && (
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              Contas a pagar <span className="num font-normal text-[var(--text-muted)]">· {money(openTotal)}</span>
            </h2>
            <Link href={month === current ? "/contas" : `/contas?mes=${month}`} className="link text-sm">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {openBills.slice(0, 4).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{b.description}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {b.due_on < today ? (
                      <span className="text-[var(--critical-text)]">⚠️ Venceu {dayMonth(b.due_on)}</span>
                    ) : b.due_on === today ? (
                      <strong className="text-[var(--text-primary)]">Vence hoje</strong>
                    ) : (
                      `Vence ${dayMonth(b.due_on)}`
                    )}
                  </div>
                </div>
                <span className="num shrink-0 font-medium">{money(Number(b.amount))}</span>
              </li>
            ))}
          </ul>
          {openBills.length > 4 && <p className="mt-1 text-xs text-[var(--text-muted)]">+ {openBills.length - 4} outras</p>}
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Despesas por categoria</h2>
        {catRows.length ? (
          <CategoryBars rows={catRows} />
        ) : (
          <Empty>
            Nenhuma despesa em {monthLabel(month).toLowerCase()}. Mande <em>“gastei 30 no almoço”</em> pro ElPatrón.
          </Empty>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Últimos 6 meses</h2>
        <MonthlyColumns data={months} highlight={month} />
      </section>

      <section className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Lançamentos recentes</h2>
          <Link href={month === current ? "/transacoes" : `/transacoes?mes=${month}`} className="link text-sm">
            Ver todos
          </Link>
        </div>
        {inMonth.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {inMonth.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{t.description || categoryLabel(t.category)}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {dayMonth(t.occurred_on)} · {categoryLabel(t.category)}
                  </div>
                </div>
                <span className={`num shrink-0 font-medium ${t.kind === "receita" ? "text-[var(--good-text)]" : ""}`}>
                  {t.kind === "receita" ? "+ " : "− "}
                  {money(Number(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Sem lançamentos neste mês.</Empty>
        )}
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{children}</p>;
}
