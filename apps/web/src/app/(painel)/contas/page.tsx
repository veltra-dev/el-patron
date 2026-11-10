import { categoryLabel, type Bill } from "@elpatron/shared";
import { ConfirmButton, TrashIcon } from "@/components/confirm-button";
import { MonthSwitcher } from "@/components/month-switcher";
import { listBills, overdueBills } from "@/lib/db";
import { currentMonth, dayMonth, isValidMonth, money, monthLabel, monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { markBillPaid, removeBill } from "../actions";

export const metadata = { title: "Contas · ElPatrón" };

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes } = await searchParams;
  // contas podem vencer no futuro: permite navegar até 12 meses à frente
  const month = isValidMonth(mes) ? mes : current;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date());

  const { from, to } = monthRange(month);
  const [bills, overdueBefore] = await Promise.all([
    listBills(user.id, from, to),
    month === current ? overdueBills(user.id, from) : Promise.resolve([] as Bill[]),
  ]);

  const pending = bills.filter((b) => !b.paid_at);
  const late = [...overdueBefore, ...pending.filter((b) => b.due_on < today)];
  const upcoming = pending.filter((b) => b.due_on >= today);
  const paid = bills.filter((b) => b.paid_at);

  const sum = (xs: Bill[]) => xs.reduce((s, b) => s + Number(b.amount), 0);
  const maxMonth = (() => {
    const [y, m] = current.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + 12, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Contas a pagar</h1>
        <MonthSwitcher month={month} current={maxMonth} basePath="/contas" homeMonth={current} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">A pagar</div>
          <div className="num mt-1 text-xl font-semibold">{money(sum(late) + sum(upcoming))}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {late.length + upcoming.length} conta{late.length + upcoming.length === 1 ? "" : "s"}
            {late.length > 0 && <span className="text-[var(--critical-text)]"> · {late.length} atrasada{late.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Pagas</div>
          <div className="num mt-1 text-xl font-semibold">{money(sum(paid))}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {paid.length} conta{paid.length === 1 ? "" : "s"} em {monthLabel(month, "short").toLowerCase()}
          </div>
        </div>
      </div>

      {bills.length === 0 && overdueBefore.length === 0 ? (
        <p className="card py-10 text-center text-sm text-[var(--text-muted)]">
          Nenhuma conta em {monthLabel(month).toLowerCase()}. Mande “conta de luz de 180 vence dia 15” ou uma planilha/fatura em PDF pro ElPatrón.
        </p>
      ) : (
        <>
          <BillList title="⚠️ Atrasadas" bills={late} today={today} />
          <BillList title="A vencer" bills={upcoming} today={today} />
          <BillList title="✓ Pagas" bills={paid} today={today} />
        </>
      )}
    </div>
  );
}

function BillList({ title, bills, today }: { title: string; bills: Bill[]; today: string }) {
  if (bills.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</h2>
      <ul className="card divide-y divide-[var(--border)]">
        {bills.map((b) => {
          const late = !b.paid_at && b.due_on < today;
          const dueToday = !b.paid_at && b.due_on === today;
          return (
            <li key={b.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className={`truncate ${b.paid_at ? "text-[var(--text-secondary)]" : ""}`}>{b.description}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {b.paid_at ? "Paga" : late ? <span className="text-[var(--critical-text)]">Venceu {dayMonth(b.due_on)}</span> : dueToday ? <strong className="text-[var(--text-primary)]">Vence hoje</strong> : `Vence ${dayMonth(b.due_on)}`}
                  {" · "}
                  {categoryLabel(b.category)}
                </div>
              </div>
              <span className={`num shrink-0 font-medium ${b.paid_at ? "text-[var(--text-secondary)] line-through decoration-1" : ""}`}>
                {money(Number(b.amount))}
              </span>
              {!b.paid_at && (
                <form action={markBillPaid}>
                  <input type="hidden" name="id" value={b.id} />
                  <ConfirmButton
                    label="Marcar como paga"
                    message={`Marcar "${b.description}" como paga? ${money(Number(b.amount))} entra como gasto de hoje.`}
                    tone="good"
                  >
                    <span className="px-1 text-xs font-medium">Paguei</span>
                  </ConfirmButton>
                </form>
              )}
              <form action={removeBill}>
                <input type="hidden" name="id" value={b.id} />
                <ConfirmButton label="Apagar conta" message={`Apagar a conta "${b.description}"?`}>
                  <TrashIcon />
                </ConfirmButton>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
