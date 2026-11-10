import { categoryLabel, type Transaction } from "@elpatron/shared";
import { ConfirmButton, TrashIcon } from "@/components/confirm-button";
import { MonthSwitcher } from "@/components/month-switcher";
import { transactionsBetween } from "@/lib/db";
import { currentMonth, isValidMonth, money, monthLabel, monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeTransaction } from "../actions";

export const metadata = { title: "Transações · ElPatrón" };

const weekday = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .replace(/^./, (c) => c.toUpperCase());

export default async function TransacoesPage({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes, tipo } = await searchParams;
  const month = isValidMonth(mes) && mes <= current ? mes : current;
  const filter = tipo === "despesa" || tipo === "receita" ? tipo : undefined;

  const { from, to } = monthRange(month);
  const all = await transactionsBetween(user.id, from, to);
  const rows = filter ? all.filter((t) => t.kind === filter) : all;

  const days = new Map<string, Transaction[]>();
  for (const t of rows) days.set(t.occurred_on, [...(days.get(t.occurred_on) ?? []), t]);

  const base = month === current ? "/transacoes" : `/transacoes?mes=${month}`;
  const withTipo = (t?: string) => (t ? `${base}${base.includes("?") ? "&" : "?"}tipo=${t}` : base);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transações</h1>
        <MonthSwitcher month={month} current={current} basePath="/transacoes" />
      </div>

      <div className="flex gap-2 text-sm">
        {[
          { v: undefined, label: "Todas" },
          { v: "despesa", label: "Despesas" },
          { v: "receita", label: "Receitas" },
        ].map((o) => (
          <a
            key={o.label}
            href={withTipo(o.v)}
            className={`rounded-full border px-3 py-1 ${
              filter === o.v ? "border-[var(--btn)] bg-[var(--btn)] text-[var(--btn-ink)]" : "border-[var(--border)] text-[var(--text-secondary)]"
            }`}
          >
            {o.label}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card py-10 text-center text-sm text-[var(--text-muted)]">Nada registrado em {monthLabel(month).toLowerCase()}.</p>
      ) : (
        [...days.entries()].map(([day, items]) => (
          <section key={day}>
            <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{weekday(day)}</h2>
            <ul className="card divide-y divide-[var(--border)]">
              {items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{t.description || categoryLabel(t.category)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{categoryLabel(t.category)}</div>
                  </div>
                  <span className={`num shrink-0 font-medium ${t.kind === "receita" ? "text-[var(--good-text)]" : ""}`}>
                    {t.kind === "receita" ? "+ " : "− "}
                    {money(Number(t.amount))}
                  </span>
                  <form action={removeTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmButton label="Apagar lançamento" message={`Apagar "${t.description || categoryLabel(t.category)}" (${money(Number(t.amount))})?`}>
                      <TrashIcon />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
