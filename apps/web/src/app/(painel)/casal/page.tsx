import { categoryLabel, coupleBalance } from "@elpatron/shared";
import { ConfirmButton, SubmitButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { MonthSwitcher } from "@/components/month-switcher";
import { CardTitle, Empty, PageHeader, PatronCard } from "@/components/ui";
import { getUser, partnerInvites, settlements, sharedTransactions } from "@/lib/db";
import { currentMonth, dayShort, isValidMonth, maskPhone, money, moneyShort, monthLabel, monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { answerInvite, cancelInvite, chargePartner, invitePartner, settleUp, unlinkPartner } from "../actions";

export const metadata = { title: "Modo casal · ElPatrón" };

const first = (name: string) => name.split(" ")[0]!;

function Avatar({ name, tone }: { name: string; tone: "me" | "partner" }) {
  return (
    <span
      className={`grid size-10 place-items-center rounded-full border-2 border-bg text-sm font-bold ${tone === "me" ? "bg-accent text-accent-ink" : "bg-partner text-white"}`}
      aria-hidden="true"
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

export default async function CasalPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const partner = user.partner_id ? await getUser(user.partner_id) : null;

  if (!partner) {
    const invites = await partnerInvites(user.id);
    return (
      <>
        <PageHeader title="Modo casal" subtitle="Carteira compartilhada" />
        {invites.received.map((inv) => (
          <PatronCard
            key={inv.from_user}
            title="Convite recebido"
            actions={
              <form action={answerInvite} className="flex gap-2.5">
                <input type="hidden" name="from" value={inv.from_user} />
                <button name="answer" value="aceitar" className="btn btn-accent">
                  Aceitar
                </button>
                <button name="answer" value="recusar" className="btn btn-outline">
                  Recusar
                </button>
              </form>
            }
          >
            <strong>{inv.users?.name ?? "Alguém"}</strong> quer dividir as contas com você. Os gastos que vocês marcarem como compartilhados entram no acerto do mês.
          </PatronCard>
        ))}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="icon-box size-11 bg-accent-bg">
                <Icon name="casal" />
              </span>
              <div>
                <h2 className="font-semibold">Dividir as contas da casa</h2>
                <p className="text-[13px] text-muted">50/50 nos gastos que vocês marcarem como compartilhados.</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-soft">
              <li>• Cada um lança os gastos normalmente (WhatsApp ou painel).</li>
              <li>• Gasto da casa? Diga “divide com a Lais” ou toque em dividir na lista de transações.</li>
              <li>• O Patrón calcula quem deve quanto e cobra pelo WhatsApp.</li>
            </ul>
            {invites.sent.length ? (
              invites.sent.map((inv) => (
                <div key={inv.to_user} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-3.5">
                  <span className="text-sm">
                    Convite enviado para <strong>{inv.users?.name}</strong> ({maskPhone(inv.users?.phone ?? "")}). Aguardando aceitar.
                  </span>
                  <form action={cancelInvite}>
                    <input type="hidden" name="to" value={inv.to_user} />
                    <SubmitButton className="pill">Cancelar convite</SubmitButton>
                  </form>
                </div>
              ))
            ) : (
              <FormDialog
                title="Convidar parceiro(a)"
                description="A pessoa precisa ser cliente do ElPatrón. Ela recebe o convite no WhatsApp e aceita pelo painel."
                action={invitePartner}
                trigger={
                  <>
                    <Icon name="plus" size={18} /> Convidar parceiro(a)
                  </>
                }
                submitLabel="Enviar convite"
              >
                <Field label="WhatsApp da pessoa">
                  <input name="phone" type="tel" inputMode="tel" required placeholder="(16) 99999-9999" className="input" />
                </Field>
              </FormDialog>
            )}
          </section>
        </div>
      </>
    );
  }

  const current = currentMonth(user.timezone);
  const { mes } = await searchParams;
  const month = isValidMonth(mes) && mes <= current ? mes : current;
  const { from, to } = monthRange(month);
  const [txs, setts] = await Promise.all([sharedTransactions([user.id, partner.id], from, to), settlements(user.id, partner.id, month)]);
  const despesas = txs.filter((t) => t.kind === "despesa");
  const gross = coupleBalance(user.id, partner.id, despesas);
  const net = coupleBalance(user.id, partner.id, despesas, setts);
  const pn = first(partner.name);

  return (
    <>
      <PageHeader title="Modo casal" subtitle={`Carteira compartilhada · ${first(user.name)} & ${pn}`}>
        <MonthSwitcher month={month} current={current} basePath="/casal" short />
        <div className="flex -space-x-2">
          <Avatar name={user.name} tone="me" />
          <Avatar name={partner.name} tone="partner" />
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5">
          <span className="eyebrow">Acerto de {monthLabel(month, "short").toLowerCase()}</span>
          <p className={`display text-[26px] font-bold ${net > 0 ? "text-accent-soft" : net < 0 ? "text-bad-soft" : "text-good"}`}>
            {net > 0 ? `${pn} te deve ${moneyShort(net)}` : net < 0 ? `Você deve ${moneyShort(-net)} a ${pn}` : "Tudo acertado 🤝"}
          </p>
          <p className="text-[13px] text-muted">
            Divisão 50/50 das despesas compartilhadas{setts.length ? ` · já acertado ${money(Math.abs(gross - net))}` : ""}.
          </p>
          {net !== 0 && (
            <div className="flex flex-wrap gap-2.5">
              {net > 0 && (
                <FormDialog
                  title={`Cobrar ${pn}`}
                  description={`O Patrón manda uma mensagem no WhatsApp de ${pn} com o valor de ${money(net)}.`}
                  action={chargePartner}
                  trigger={
                    <>
                      <Icon name="arrowRight" size={18} /> Cobrar via WhatsApp
                    </>
                  }
                  submitLabel="Mandar cobrança"
                >
                  <input type="hidden" name="amount" value={net.toFixed(2)} />
                  <input type="hidden" name="month" value={month} />
                </FormDialog>
              )}
              <form action={settleUp}>
                <input type="hidden" name="amount" value={Math.abs(net).toFixed(2)} />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="direction" value={net > 0 ? "partner_paid" : "i_paid"} />
                <ConfirmButton
                  label="Marcar como acertado"
                  message={net > 0 ? `${pn} já te pagou ${money(net)}?` : `Você já pagou ${money(-net)} a ${pn}?`}
                  className="btn btn-outline"
                >
                  Marcar como acertado
                </ConfirmButton>
              </form>
            </div>
          )}
        </section>
        <PatronCard title="Patrón acerta com vocês">
          Os dois lançam os gastos normalmente. Para dividir, diga <strong>“divide com {first(partner.name)}”</strong> no WhatsApp ou toque no ícone de casal na lista de
          transações. Pergunte “quanto a {pn} me deve?” a qualquer momento.
        </PatronCard>
      </div>

      <section className="card p-5">
        <CardTitle>Despesas compartilhadas</CardTitle>
        {despesas.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {despesas.map((t) => {
              const mine = t.user_id === user.id;
              const part = (Number(t.amount) * t.partner_share_pct) / 100;
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className={`icon-box ${mine ? "" : "!bg-partner/20 !text-[#b3aaf5]"}`} aria-hidden="true">
                    <Icon name="wallet" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{t.description || categoryLabel(t.category)}</div>
                    <div className="text-[13px] text-muted">
                      Pago por {mine ? "você" : pn} · {100 - t.partner_share_pct}/{t.partner_share_pct} · {dayShort(t.occurred_on)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{moneyShort(Number(t.amount))}</div>
                    <div className={`num text-[13px] ${mine ? "text-accent-soft" : "text-good"}`}>
                      {mine ? `${pn}: ${moneyShort(part)}` : `Você: ${moneyShort(part)}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Nenhuma despesa compartilhada em {monthLabel(month).toLowerCase()}.</Empty>
        )}
      </section>

      <form action={unlinkPartner} className="self-start">
        <ConfirmButton label="Desativar modo casal" message={`Desativar o modo casal com ${pn}? Os lançamentos continuam, só param de ser divididos.`} className="link-accent !text-muted">
          Desativar modo casal
        </ConfirmButton>
      </form>
    </>
  );
}
