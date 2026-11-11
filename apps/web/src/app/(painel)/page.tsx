import Link from "next/link";
import { budgetStatus, categoryLabel } from "@elpatron/shared";
import { BillRow } from "@/components/bills";
import { CategoryBars, MonthlyColumns } from "@/components/charts";
import { ForecastChart } from "@/components/forecast-chart";
import { Icon } from "@/components/icons";
import { MonthSwitcher } from "@/components/month-switcher";
import { CardTitle, Empty, Meter, PageHeader, PatronCard, Stat } from "@/components/ui";
import { listBills, listBudgets, overdueBills, transactionsBetween } from "@/lib/db";
import { cashForecast } from "@/lib/forecast";
import { currentMonth, dayShort, greeting, isValidMonth, money, monthLabel, monthRange, moneyShort, plural, shiftMonth, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Resumo · ElPatrón" };

const chat = (msg: string) => `/patron?msg=${encodeURIComponent(msg)}`;

export default async function ResumoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes } = await searchParams;
  const month = isValidMonth(mes) && mes <= current ? mes : current;
  const isCurrent = month === current;
  const today = todayIn(user.timezone);

  const firstMonth = shiftMonth(month, -5);
  const { from, to } = monthRange(month);
  const [all, monthBills, overdue, budgets, fc] = await Promise.all([
    transactionsBetween(user, monthRange(firstMonth).from, to),
    listBills(user, from, to),
    isCurrent ? overdueBills(user, from) : Promise.resolve([]),
    listBudgets(user),
    isCurrent ? cashForecast(user) : Promise.resolve(null),
  ]);

  const inMonth = all.filter((t) => t.occurred_on.startsWith(month));
  const despesas = inMonth.filter((t) => t.kind === "despesa");
  const totalDespesa = despesas.reduce((s, t) => s + Number(t.amount), 0);
  const receitas = inMonth.filter((t) => t.kind === "receita");
  const totalReceita = receitas.reduce((s, t) => s + Number(t.amount), 0);
  const saldo = totalReceita - totalDespesa;

  const openBills = [...overdue, ...monthBills.filter((b) => !b.paid_at)];
  const openTotal = openBills.reduce((s, b) => s + Number(b.amount), 0);
  // "vence hoje" (com atrasadas); se não houver, as próximas
  const dueNow = openBills.filter((b) => b.due_on <= today);
  const highlight = (dueNow.length ? dueNow : openBills).slice(0, 4);

  const spent: Record<string, number> = {};
  for (const t of despesas) spent[t.category] = (spent[t.category] ?? 0) + Number(t.amount);
  const catRows = Object.entries(spent)
    .map(([cat, value]) => ({ label: categoryLabel(cat), value, count: despesas.filter((t) => t.category === cat).length }))
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

  // Sugestão do Patrón calculada (nada inventado): cobertura das contas pelo saldo.
  const coverage = openTotal > 0 ? Math.max(0, saldo) / openTotal : 1;
  const suggestion =
    isCurrent && openTotal > 0 && coverage < 1
      ? {
          text: (
            <>
              O saldo do mês cobre <strong>{Math.round(coverage * 100)}%</strong> das contas em aberto ({money(openTotal)}). Faltam{" "}
              <strong>{money(openTotal - Math.max(0, saldo))}</strong>. Quer que eu monte um plano de pagamento por prioridade?
            </>
          ),
          action: "Monta um plano de pagamento por prioridade pras contas do mês",
        }
      : null;

  return (
    <>
      <PageHeader
        title="Resumo"
        subtitle={
          <>
            {monthLabel(month)} · {greeting(user.timezone).toLowerCase()}, {user.name.split(" ")[0]}
          </>
        }
      >
        <MonthSwitcher month={month} current={current} basePath="/" />
        <Link href="/patron" className="btn btn-accent hidden lg:inline-flex">
          <Icon name="patron" size={18} /> Falar com o Patrón
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
        <Stat
          label="Saldo do mês"
          value={saldo}
          highlight
          hint={inMonth.length ? (saldo >= 0 ? "positivo" : "negativo") : "sem lançamentos"}
          className="col-span-2 lg:col-span-1"
        />
        <Stat label="Receitas" value={moneyShort(totalReceita)} tone="good" hint={plural(receitas.length, "lançamento", "lançamentos")} />
        <Stat label="Despesas" value={moneyShort(totalDespesa)} hint={plural(despesas.length, "lançamento", "lançamentos")} />
        <Stat
          label={isCurrent ? "A pagar" : "Contas em aberto"}
          value={moneyShort(openTotal)}
          tone={openTotal > 0 ? "bad" : undefined}
          hint={plural(openBills.length, "conta", "contas")}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {fc && (
          <section className="card flex flex-col gap-2 p-5">
            <CardTitle href="/previsao">Previsão de caixa · {monthLabel(month, "short").toLowerCase()}</CardTitle>
            <ForecastChart points={fc.points} zeroOn={fc.zeroOn} compact />
            <p className="text-[13px] leading-relaxed text-soft">
              {fc.zeroOn ? (
                <>
                  Sem mudar nada, o saldo fica negativo em <strong className="text-bad-soft">{dayShort(fc.zeroOn)}</strong> e fecha o mês em{" "}
                  <strong className="text-bad-soft">{money(fc.endBalance)}</strong>.
                </>
              ) : (
                <>
                  Pagando tudo o que está previsto, o mês fecha em <strong className="text-good">{money(fc.endBalance)}</strong>.
                </>
              )}
            </p>
          </section>
        )}

        <section className="card p-5">
          <CardTitle href={isCurrent ? "/contas" : `/contas?mes=${month}`} linkLabel={`Ver todas · ${openBills.length}`}>
            {dueNow.length ? "Vence hoje" : "Próximas contas"}
          </CardTitle>
          {highlight.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {highlight.map((b) => (
                <BillRow key={b.id} bill={b} today={today} showDue={!dueNow.length || b.due_on < today} />
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma conta em aberto. Mande “conta de luz de 180 vence dia 15” pro Patrón.</Empty>
          )}
          {openBills.length > highlight.length && (
            <Link href="/contas" className="mt-1 flex items-center justify-between border-t border-line pt-3 text-[13px] text-muted hover:text-ink">
              + {openBills.length - highlight.length} outras contas no mês <Icon name="chevronRight" size={16} />
            </Link>
          )}
        </section>

        <section className="card p-5">
          <CardTitle href="/orcamentos">Orçamentos</CardTitle>
          {budgets.length ? (
            <ul className="flex flex-col gap-4 pt-1">
              {budgets.slice(0, 4).map((b) => {
                const g = spent[b.category] ?? 0;
                const st = budgetStatus(g, Number(b.amount), user.budget_alert_pct);
                return (
                  <li key={b.id} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2 text-[15px]">
                      <span>{categoryLabel(b.category)}</span>
                      <span className={`num text-sm ${st.level === "estourou" ? "text-bad-soft" : "text-soft"}`}>
                        {moneyShort(g)} / {moneyShort(Number(b.amount))}
                      </span>
                    </div>
                    <Meter pct={st.pct} level={st.level} label={`${categoryLabel(b.category)}: ${Math.round(st.pct)}% do teto`} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>
              Defina um teto por categoria e o Patrón te avisa antes de estourar.{" "}
              <Link href="/orcamentos" className="link-accent">
                Criar orçamento
              </Link>
            </Empty>
          )}
        </section>

        {suggestion && (
          <PatronCard
            title="Patrón sugere"
            actions={
              <>
                <Link href={chat(suggestion.action)} className="btn btn-accent">
                  Montar plano
                </Link>
                <Link href="/previsao" className="btn btn-outline">
                  Ver previsão
                </Link>
              </>
            }
          >
            {suggestion.text}
          </PatronCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <CardTitle>Despesas por categoria</CardTitle>
          {catRows.length ? (
            <CategoryBars rows={catRows} />
          ) : (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm leading-relaxed text-muted">
                Nenhuma despesa em {monthLabel(month).toLowerCase()}. Mande um destes pro Patrón no WhatsApp:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="pill">“gastei 30 no almoço”</span>
                <span className="pill">“paguei o mercado”</span>
              </div>
            </div>
          )}
        </section>
        <section className="card p-5">
          <CardTitle>Últimos 6 meses</CardTitle>
          <MonthlyColumns data={months} highlight={month} />
        </section>
      </div>

      <section className="card p-5">
        <CardTitle href={isCurrent ? "/transacoes" : `/transacoes?mes=${month}`} linkLabel="Ver todas">
          Lançamentos recentes
        </CardTitle>
        {inMonth.length ? (
          <ul className="divide-y divide-line">
            {inMonth.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className={`icon-box ${t.kind === "receita" ? "!bg-good-bg !text-good" : "!text-soft"}`}>
                  <Icon name={t.kind === "receita" ? "arrowDownLeft" : "arrowUpRight"} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.description || categoryLabel(t.category)}</div>
                  <div className="text-[13px] text-muted">
                    {dayShort(t.occurred_on)} · {categoryLabel(t.category)}
                  </div>
                </div>
                <span className={`num shrink-0 font-semibold ${t.kind === "receita" ? "text-good" : ""}`}>
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
    </>
  );
}
