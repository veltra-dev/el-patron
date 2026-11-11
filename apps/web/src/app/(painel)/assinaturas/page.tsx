import { categoryLabel, installmentStatus } from "@elpatron/shared";
import { CategorySelect } from "@/components/category-select";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { CardTitle, Empty, Initial, PageHeader, PatronStrip } from "@/components/ui";
import { listSubscriptions } from "@/lib/db";
import { money, moneyShort, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { createSubscription, removeSubscription } from "../actions";

export const metadata = { title: "Assinaturas · ElPatrón" };

const monthYear = (m: string) => {
  const [y, mm] = m.split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(mm) - 1]}/${y}`;
};

function CancelButton({ id, name }: { id: string; name: string }) {
  return (
    <form action={removeSubscription}>
      <input type="hidden" name="id" value={id} />
      <ConfirmButton label={`Cancelar ${name}`} message={`Cancelar "${name}"? As próximas cobranças deixam de entrar em contas a pagar.`}>
        <Icon name="trash" size={16} />
      </ConfirmButton>
    </form>
  );
}

export default async function AssinaturasPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const subs = await listSubscriptions(user);
  const recurring = subs.filter((s) => s.kind === "assinatura");
  const installments = subs.map((s) => ({ s, st: s.kind === "parcelamento" ? installmentStatus(s, today) : null })).filter((x) => x.st && x.st.remaining > 0);
  const monthlyFixed = recurring.reduce((s, x) => s + Number(x.amount), 0) + installments.reduce((s, x) => s + Number(x.s.amount), 0);
  const instMonthly = installments.reduce((s, x) => s + Number(x.s.amount), 0);
  const lastEnd = installments.map((x) => x.st!.endMonth).sort().at(-1);

  return (
    <>
      <PageHeader title="Assinaturas & parcelas" subtitle={`Compromisso fixo de ${money(monthlyFixed)}/mês`}>
        <FormDialog
          title="Nova assinatura ou parcela"
          description="Todo mês o Patrón lança a conta no dia da cobrança e avisa no vencimento."
          action={createSubscription}
          trigger={
            <>
              <Icon name="plus" size={18} /> Nova
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
            {(["assinatura", "parcelamento"] as const).map((k) => (
              <label key={k} className="pill cursor-pointer justify-center has-[:checked]:border-accent has-[:checked]:text-accent">
                <input type="radio" name="kind" value={k} defaultChecked={k === "assinatura"} className="peer sr-only" />
                {k === "assinatura" ? "Assinatura" : "Parcelamento"}
              </label>
            ))}
          </div>
          <Field label="Nome">
            <input name="description" required placeholder="Ex.: Netflix, Celular novo" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor por mês">
              <input name="amount" inputMode="decimal" required placeholder="0,00" className="input num" />
            </Field>
            <Field label="Dia da cobrança">
              <input name="day" type="number" min={1} max={31} required defaultValue={10} className="input num" />
            </Field>
          </div>
          <Field label="Categoria">
            <CategorySelect defaultValue="assinaturas" exclude={["salario"]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total de parcelas" hint="Só para parcelamento">
              <input name="total" type="number" min={2} max={120} placeholder="Ex.: 10" className="input num" />
            </Field>
            <Field label="Parcela deste mês" hint="Ex.: 3 se for a 3ª">
              <input name="current" type="number" min={1} max={120} defaultValue={1} className="input num" />
            </Field>
          </div>
        </FormDialog>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <CardTitle>Assinaturas recorrentes</CardTitle>
          {recurring.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {recurring.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <Initial text={s.description} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.description}</div>
                    <div className="text-[13px] text-muted">
                      {categoryLabel(s.category)} · todo dia {s.billing_day}
                    </div>
                  </div>
                  <span className="num shrink-0 font-semibold">{money(Number(s.amount))}</span>
                  <CancelButton id={s.id} name={s.description} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma assinatura. Mande pro Patrón: “assino a Netflix, 55 todo dia 10”.</Empty>
          )}
        </section>

        <section className="card p-5">
          <CardTitle>Parcelamentos</CardTitle>
          {installments.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {installments.map(({ s, st }) => (
                <li key={s.id} className="flex flex-col gap-2.5 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{s.description}</div>
                      <div className="text-[13px] text-muted">
                        {money(Number(s.amount))}/mês · parcela {st!.current} de {st!.total} · dia {s.billing_day}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num font-semibold">{moneyShort(st!.remainingAmount)}</div>
                      <div className="text-[11px] text-muted">restantes</div>
                    </div>
                    <CancelButton id={s.id} name={s.description} />
                  </div>
                  <div role="img" aria-label={`${st!.paid} de ${st!.total} parcelas pagas`} className="flex gap-1">
                    {Array.from({ length: st!.total }, (_, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${i < st!.paid ? "bg-accent" : "bg-track"}`} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum parcelamento. Mande pro Patrón: “comprei um celular em 10x de 300, primeira parcela dia 5”.</Empty>
          )}
        </section>
      </div>

      {installments.length > 0 && lastEnd && (
        <PatronStrip>
          <strong className="text-accent-soft">Patrón:</strong> seus parcelamentos somam <strong>{money(instMonthly)}/mês</strong> até {monthYear(lastEnd)}. Quando
          quitar, sobra esse valor livre no orçamento.
        </PatronStrip>
      )}
    </>
  );
}
