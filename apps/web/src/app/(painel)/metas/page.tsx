import { ConfirmButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { Empty, Meter, PageHeader, PatronCard } from "@/components/ui";
import { listGoals } from "@/lib/db";
import { money, moneyShort, plural } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { createGoal, depositGoal, removeGoal } from "../actions";

export const metadata = { title: "Metas · ElPatrón" };

const monthYear = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(". de ", "/").replace(" de ", "/").replace(".", "");

/** Anel de progresso (um valor: parte de um todo). */
function Ring({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90" role="img" aria-label={`${Math.round(pct)}% do total das metas`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--track)" strokeWidth="9" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} />
    </svg>
  );
}

export default async function MetasPage() {
  const user = await requireUser();
  const goals = await listGoals(user.id);
  const saved = goals.reduce((s, g) => s + Number(g.saved_amount), 0);
  const target = goals.reduce((s, g) => s + Number(g.target_amount), 0);
  const active = goals.filter((g) => !g.completed_at).length;
  const pct = target ? (saved / target) * 100 : 0;

  return (
    <>
      <PageHeader title="Metas & cofrinhos" subtitle={plural(active, "cofrinho ativo", "cofrinhos ativos")}>
        <FormDialog
          title="Nova meta"
          action={createGoal}
          trigger={
            <>
              <Icon name="plus" size={18} /> Nova meta
            </>
          }
        >
          <Field label="Objetivo">
            <input name="name" required placeholder="Ex.: Reserva de emergência" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quanto quer juntar">
              <input name="target" inputMode="decimal" required placeholder="0,00" className="input num" />
            </Field>
            <Field label="Já tem guardado">
              <input name="saved" inputMode="decimal" placeholder="0,00" className="input num" />
            </Field>
          </div>
          <Field label="Prazo (opcional)">
            <input name="deadline" type="date" className="input" />
          </Field>
        </FormDialog>
      </PageHeader>

      <section className="card flex flex-wrap items-center gap-5 p-5">
        <div className="flex min-w-0 flex-[1_1_260px] items-center gap-5">
          <Ring pct={pct} />
          <div>
            <div className="eyebrow">Guardado no total</div>
            <div className="display num text-[28px] font-bold">{moneyShort(saved)}</div>
            <div className="text-[13px] text-muted">{goals.length ? `${Math.round(pct)}% do conjunto das metas (${moneyShort(target)})` : "nenhuma meta ainda"}</div>
          </div>
        </div>
        <div className="card-patron flex-[1_1_320px] p-4">
          <div className="text-[13px] font-semibold text-accent-soft">Guardar pelo WhatsApp</div>
          <p className="mt-1 text-[13px] leading-relaxed">
            Mande <strong>“guardei 200 na reserva”</strong> ou <strong>“tirei 50 da viagem”</strong> e o Patrón atualiza o cofrinho. Guardar não conta como gasto.
          </p>
        </div>
      </section>

      {goals.length === 0 ? (
        <div className="card">
          <Empty>
            Crie sua primeira meta aqui ou mande pro Patrón: <strong className="text-ink">“quero juntar 10 mil pra reserva até setembro de 2027”</strong>.
          </Empty>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const p = (Number(g.saved_amount) / Number(g.target_amount)) * 100;
            const done = Boolean(g.completed_at);
            return (
              <section key={g.id} className="card flex flex-col gap-3.5 p-5">
                <div className="flex items-start gap-3">
                  <span className={`icon-box ${done ? "!bg-good-bg !text-good" : ""}`}>
                    <Icon name={done ? "check" : "metas"} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{g.name}</h2>
                    <div className={`text-[13px] ${done ? "text-good" : "text-muted"}`}>
                      {done ? "Concluída 🎉" : `Meta ${moneyShort(Number(g.target_amount))}${g.deadline ? ` · ${monthYear(g.deadline)}` : ""}`}
                    </div>
                  </div>
                  <span className={`display num font-bold ${done ? "text-good" : "text-accent-soft"}`}>{Math.min(100, Math.round(p))}%</span>
                </div>
                <Meter pct={p} level={done ? "ok" : "accent"} label={`${Math.round(p)}% da meta`} />
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[13px] text-soft">
                    {done ? `${money(Number(g.saved_amount))} guardados` : `${moneyShort(Number(g.saved_amount))} de ${moneyShort(Number(g.target_amount))}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <form action={removeGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <ConfirmButton label={`Apagar meta ${g.name}`} message={`Apagar a meta "${g.name}"?`}>
                        <Icon name="trash" size={16} />
                      </ConfirmButton>
                    </form>
                    <FormDialog
                      title={g.name}
                      description={`Guardado: ${money(Number(g.saved_amount))} de ${money(Number(g.target_amount))}`}
                      action={depositGoal}
                      triggerClassName="pill"
                      trigger={done ? "Movimentar" : "Guardar"}
                      submitLabel="Confirmar"
                    >
                      <input type="hidden" name="id" value={g.id} />
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Operação">
                        {(["guardar", "retirar"] as const).map((k) => (
                          <label key={k} className="pill cursor-pointer justify-center has-[:checked]:border-accent has-[:checked]:text-accent">
                            <input type="radio" name="op" value={k} defaultChecked={k === "guardar"} className="sr-only" />
                            {k === "guardar" ? "Guardar" : "Retirar"}
                          </label>
                        ))}
                      </div>
                      <Field label="Valor">
                        <input name="amount" inputMode="decimal" required placeholder="0,00" className="input num text-lg" />
                      </Field>
                    </FormDialog>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {goals.length > 0 && active > 0 && (
        <PatronCard title="Dica do Patrón">
          Se guardar um pouco todo mês, fica mais leve. Peça no WhatsApp: <strong>“me lembra todo dia 5 de guardar 200 na reserva”</strong>.
        </PatronCard>
      )}
    </>
  );
}
