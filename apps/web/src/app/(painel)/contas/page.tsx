import Link from "next/link";
import { addDaysIso, categoryLabel, type Bill } from "@elpatron/shared";
import { BillRow, DeleteBillButton, dueText, PayButton } from "@/components/bills";
import { CategorySelect } from "@/components/category-select";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { MonthSwitcher } from "@/components/month-switcher";
import { Chips, Empty, PageHeader, Stat } from "@/components/ui";
import { listBills, overdueBills } from "@/lib/db";
import { currentMonth, dayShort, isValidMonth, money, monthLabel, monthRange, plural, shiftMonth, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { createBill } from "../actions";

export const metadata = { title: "Contas · ElPatrón" };

type Filtro = "hoje" | "semana" | "atrasadas" | `cat:${string}` | undefined;

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ mes?: string; f?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes, f } = await searchParams;
  const month = isValidMonth(mes) ? mes : current;
  const isCurrent = month === current;
  const today = todayIn(user.timezone);
  const weekEnd = addDaysIso(today, 6);

  const { from, to } = monthRange(month);
  const [bills, overdueBefore] = await Promise.all([
    listBills(user, from, to),
    isCurrent ? overdueBills(user, from) : Promise.resolve([] as Bill[]),
  ]);

  const open = [...overdueBefore, ...bills.filter((b) => !b.paid_at)];
  const paid = bills.filter((b) => b.paid_at);
  const late = open.filter((b) => b.due_on < today);
  const dueToday = open.filter((b) => b.due_on === today);
  const sum = (xs: Bill[]) => xs.reduce((s, b) => s + Number(b.amount), 0);

  const filter = f as Filtro;
  const shown = open.filter((b) =>
    !filter
      ? true
      : filter === "hoje"
        ? b.due_on <= today
        : filter === "semana"
          ? b.due_on <= weekEnd
          : filter === "atrasadas"
            ? b.due_on < today
            : b.category === filter.slice(4),
  );
  const cats = [...new Set(open.map((b) => b.category))].slice(0, 5);
  const href = (v?: string) => {
    const p = new URLSearchParams();
    if (!isCurrent) p.set("mes", month);
    if (v) p.set("f", v);
    const s = p.toString();
    return s ? `/contas?${s}` : "/contas";
  };
  const maxMonth = shiftMonth(current, 12); // contas futuras: até 12 meses à frente

  return (
    <>
      <PageHeader title="Contas a pagar" subtitle={monthLabel(month)}>
        <MonthSwitcher month={month} current={maxMonth} basePath="/contas" homeMonth={current} short />
        <a href={`/contas/exportar${isCurrent ? "" : `?mes=${month}`}`} className="btn btn-outline hidden sm:inline-flex">
          <Icon name="download" size={17} /> Exportar
        </a>
        <FormDialog
          title="Nova conta"
          description="Ou mande pro Patrón: “conta de luz de 180 vence dia 15”. Ele avisa às 9h do vencimento."
          action={createBill}
          trigger={
            <>
              <Icon name="plus" size={18} /> Nova conta
            </>
          }
        >
          <Field label="Conta">
            <input name="description" required placeholder="Ex.: Conta de luz" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor">
              <input name="amount" inputMode="decimal" required placeholder="0,00" className="input num" />
            </Field>
            <Field label="Vencimento">
              <input name="due_on" type="date" required defaultValue={today} className="input" />
            </Field>
          </div>
          <Field label="Categoria">
            <CategorySelect defaultValue="contas" exclude={["salario"]} />
          </Field>
        </FormDialog>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="A pagar" value={sum(open)} hint={plural(open.length, "conta", "contas")} />
        <Stat label="Pagas" value={sum(paid)} hint={`${paid.length} em ${monthLabel(month, "short").toLowerCase()}`} />
        {isCurrent && <Stat label="Vence hoje" value={sum(dueToday)} tone={dueToday.length ? "accent" : undefined} hint={plural(dueToday.length, "conta", "contas")} />}
        {isCurrent && (
          <Stat label="Atrasadas" value={sum(late)} tone={late.length ? "bad" : "good"} hint={late.length ? plural(late.length, "conta", "contas") : "em dia 👍"} />
        )}
      </div>

      <Chips
        items={[
          { href: href(), label: `Todas · ${open.length}`, active: !filter },
          ...(isCurrent
            ? [
                { href: href("hoje"), label: "Vence hoje", active: filter === "hoje" },
                { href: href("semana"), label: "Esta semana", active: filter === "semana" },
                { href: href("atrasadas"), label: "Atrasadas", active: filter === "atrasadas" },
              ]
            : []),
          ...cats.map((c) => ({ href: href(`cat:${c}`), label: categoryLabel(c), active: filter === `cat:${c}` })),
        ]}
      />

      {shown.length === 0 ? (
        <div className="card">
          <Empty>
            {open.length
              ? "Nenhuma conta nesse filtro."
              : `Nenhuma conta em aberto em ${monthLabel(month).toLowerCase()}. Mande “conta de luz de 180 vence dia 15” ou uma planilha/fatura em PDF pro Patrón.`}
          </Empty>
        </div>
      ) : (
        <>
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-5 py-4 font-semibold">Conta</th>
                  <th className="px-3 py-4 font-semibold">Categoria</th>
                  <th className="px-3 py-4 font-semibold">Vencimento</th>
                  <th className="px-3 py-4 text-right font-semibold">Valor</th>
                  <th className="px-5 py-4 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((b) => {
                  const d = dueText(b, today);
                  return (
                    <tr key={b.id}>
                      <td className="px-5 py-3 font-semibold">{b.description}</td>
                      <td className="px-3 py-3 text-soft">{categoryLabel(b.category)}</td>
                      <td className={`px-3 py-3 ${d.tone === "text-muted" ? "text-soft" : d.tone}`}>{d.text}</td>
                      <td className="num px-3 py-3 text-right font-semibold">{money(Number(b.amount))}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <PayButton bill={b} variant="text" />
                          <DeleteBillButton bill={b} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="card px-4 pb-1 pt-4 md:hidden">
            <h2 className="eyebrow !text-accent px-1">{filter === "hoje" ? `Vence hoje · ${dayShort(today)}` : "Em aberto"}</h2>
            <ul className="divide-y divide-line">
              {shown.map((b) => (
                <BillRow key={b.id} bill={b} today={today} showDue />
              ))}
            </ul>
          </section>
          <p className="px-1 text-[13px] leading-relaxed text-muted">
            Tocar no ✓ lança a despesa no dia de hoje e dá baixa na conta. Também dá pra avisar o Patrón: “paguei o mercado”.
          </p>
        </>
      )}

      {paid.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow px-1">Pagas em {monthLabel(month, "short").toLowerCase()}</h2>
          <ul className="card divide-y divide-line px-4">
            {paid.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3 text-soft">
                <span className="icon-box !bg-good-bg !text-good">
                  <Icon name="check" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{b.description}</div>
                  <div className="text-[13px] text-muted">
                    {categoryLabel(b.category)} · venceu {dayShort(b.due_on)}
                  </div>
                </div>
                <span className="num font-semibold">{money(Number(b.amount))}</span>
                <DeleteBillButton bill={b} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isCurrent && (
        <Link href="/contas" className="link-accent self-start">
          Voltar para o mês atual
        </Link>
      )}
    </>
  );
}
