import { budgetStatus, categoryLabel } from "@elpatron/shared";
import { CategorySelect } from "@/components/category-select";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { Empty, Meter, PageHeader, PatronStrip, Stat } from "@/components/ui";
import { listBudgets, transactionsBetween } from "@/lib/db";
import { currentMonth, monthLabel, monthRange, moneyShort } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { removeBudget, saveAlertPct, saveBudget } from "../actions";

export const metadata = { title: "Orçamentos · ElPatrón" };

export default async function OrcamentosPage() {
  const user = await requireUser();
  const month = currentMonth(user.timezone);
  const { from, to } = monthRange(month);
  const [budgets, txs] = await Promise.all([listBudgets(user), transactionsBetween(user, from, to)]);
  const despesas = txs.filter((t) => t.kind === "despesa");

  const rows = budgets.map((b) => {
    const items = despesas.filter((t) => t.category === b.category);
    const spent = items.reduce((s, t) => s + Number(t.amount), 0);
    // maiores lançamentos explicam o estouro
    const top = [...items].sort((a, c) => Number(c.amount) - Number(a.amount)).slice(0, 2).map((t) => t.description || categoryLabel(t.category));
    return { b, spent, top, st: budgetStatus(spent, Number(b.amount), user.budget_alert_pct) };
  });
  const totalLimit = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const available = totalLimit - totalSpent;

  return (
    <>
      <PageHeader title="Orçamentos" subtitle={`${monthLabel(month)} · teto por categoria`}>
        <FormDialog
          title="Novo orçamento"
          description="Se a categoria já tiver orçamento, o valor é atualizado."
          action={saveBudget}
          trigger={
            <>
              <Icon name="plus" size={18} /> Novo orçamento
            </>
          }
        >
          <Field label="Categoria">
            <CategorySelect exclude={["salario"]} />
          </Field>
          <Field label="Teto mensal">
            <input name="amount" inputMode="decimal" required placeholder="0,00" className="input num text-lg" />
          </Field>
        </FormDialog>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Gasto do mês" value={moneyShort(totalSpent)} hint="nas categorias com teto" />
        <Stat label="Teto total" value={moneyShort(totalLimit)} />
        <Stat
          label={available >= 0 ? "Disponível" : "Acima do teto"}
          value={moneyShort(Math.abs(available))}
          tone={available >= 0 ? "good" : "bad"}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty>
            Nenhum orçamento ainda. Crie um aqui ou mande pro Patrón: <strong className="text-ink">“quero gastar no máximo 1.200 no mercado”</strong>.
          </Empty>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ b, spent, top, st }) => (
            <section key={b.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{categoryLabel(b.category)}</h2>
                <span className="num text-[15px] font-semibold">
                  {moneyShort(spent)} / {moneyShort(Number(b.amount))}
                </span>
              </div>
              <Meter pct={st.pct} level={st.level} label={`${Math.round(st.pct)}% do teto usado`} />
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[13px] ${st.level === "estourou" ? "text-bad-soft" : st.level === "alerta" ? "text-accent-soft" : "text-muted"}`}>
                  {st.level === "estourou"
                    ? `Estourou ${moneyShort(-st.remaining)}${top.length ? ` · ${top.join(" + ")}` : ""}`
                    : `${Math.round(st.pct)}% usado · ${moneyShort(st.remaining)} restantes`}
                </p>
                <form action={removeBudget}>
                  <input type="hidden" name="id" value={b.id} />
                  <ConfirmButton label={`Remover orçamento de ${categoryLabel(b.category)}`} message={`Remover o orçamento de ${categoryLabel(b.category)}?`}>
                    <Icon name="trash" size={16} />
                  </ConfirmButton>
                </form>
              </div>
            </section>
          ))}
        </div>
      )}

      <PatronStrip
        action={
          <FormDialog
            title="Ajustar alertas"
            description="Em qual % do teto o Patrón te avisa no WhatsApp. O aviso de estouro (100%) sempre vem."
            action={saveAlertPct}
            triggerClassName="btn btn-outline-accent"
            trigger="Ajustar alertas"
          >
            <Field label="Avisar quando chegar a">
              <select name="pct" defaultValue={String(user.budget_alert_pct)} className="input">
                {[50, 60, 70, 75, 80, 85, 90, 95, 100].map((p) => (
                  <option key={p} value={p}>
                    {p}% do teto
                  </option>
                ))}
              </select>
            </Field>
          </FormDialog>
        }
      >
        <strong className="text-accent-soft">Patrón avisa no WhatsApp</strong> quando uma categoria passa do teto que você escolher. Hoje: a{" "}
        {user.budget_alert_pct}% do teto.
      </PatronStrip>
    </>
  );
}
