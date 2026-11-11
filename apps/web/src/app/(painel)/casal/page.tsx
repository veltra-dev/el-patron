import { ConfirmButton, SubmitButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageHeader, PatronCard, Stat } from "@/components/ui";
import { getUser, partnerInvites, transactionsBetween } from "@/lib/db";
import { currentMonth, isValidMonth, maskPhone, money, moneyShort, monthLabel, monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { answerInvite, cancelInvite, invitePartner, unlinkPartner } from "../actions";

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
        <PageHeader title="Modo casal" subtitle="Conta conjunta" />
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
            <strong>{inv.users?.name ?? "Alguém"}</strong> quer juntar as finanças com você. Ao aceitar, os lançamentos, contas, orçamentos e metas dos dois viram uma conta só.
          </PatronCard>
        ))}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="icon-box size-11 bg-accent-bg">
                <Icon name="casal" />
              </span>
              <div>
                <h2 className="font-semibold">Uma conta só para a casa</h2>
                <p className="text-[13px] text-muted">O que um lança, o outro vê. Gastos e receitas somam no mesmo saldo.</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-soft">
              <li>• Cada um continua lançando pelo próprio WhatsApp ou pelo painel.</li>
              <li>• Transações, contas a pagar, assinaturas, orçamentos, metas e previsão ficam juntos.</li>
              <li>• Presente ou surpresa? Diga “não mostra pra ela” e o lançamento fica pessoal, só você vê.</li>
              <li>• Notas e lembretes continuam de cada um.</li>
              <li>• O que vocês já lançaram antes aparece junto assim que o convite for aceito.</li>
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
                description="A pessoa precisa ser cliente do ElPatrón. Ela recebe o convite no WhatsApp e aceita pelo painel, em Modo casal."
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
  const txs = await transactionsBetween(user, from, to);
  const pn = first(partner.name);
  const sum = (uid: string | null, kind: string) =>
    txs.filter((t) => (uid === null || t.user_id === uid) && t.kind === kind).reduce((s, t) => s + Number(t.amount), 0);
  const people = [
    { id: user.id, name: "Você", tone: "me" as const, avatar: user.name },
    { id: partner.id, name: pn, tone: "partner" as const, avatar: partner.name },
  ];
  const mySecret = txs.filter((t) => t.personal && t.user_id === user.id).length;
  const saldo = sum(null, "receita") - sum(null, "despesa");

  return (
    <>
      <PageHeader title="Modo casal" subtitle={`Conta conjunta · ${first(user.name)} & ${pn}`}>
        <MonthSwitcher month={month} current={current} basePath="/casal" short />
        <div className="flex -space-x-2">
          <Avatar name={user.name} tone="me" />
          <Avatar name={partner.name} tone="partner" />
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`Saldo da casa · ${monthLabel(month, "short").toLowerCase()}`} value={saldo} highlight className="col-span-2 lg:col-span-1" />
        <Stat label="Receitas da casa" value={moneyShort(sum(null, "receita"))} tone="good" />
        <Stat label="Despesas da casa" value={moneyShort(sum(null, "despesa"))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {people.map((p) => {
          const gastou = sum(p.id, "despesa");
          const total = sum(null, "despesa");
          return (
            <section key={p.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={p.avatar} tone={p.tone} />
                <h2 className="font-semibold">{p.name}</h2>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="eyebrow">Gastou</dt>
                  <dd className="display num text-[22px] font-bold">{money(gastou)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Recebeu</dt>
                  <dd className="display num text-[22px] font-bold text-good">{money(sum(p.id, "receita"))}</dd>
                </div>
              </dl>
              <p className="text-[13px] text-muted">
                {total > 0 ? `${Math.round((gastou / total) * 100)}% das despesas da casa no mês.` : "Sem despesas no mês."}
              </p>
            </section>
          );
        })}
      </div>

      <PatronCard title="Como funciona">
        Tudo o que você e {pn} lançam, pelo WhatsApp ou pelo painel, entra na mesma conta. Em Transações, cada lançamento mostra quem lançou.
        Para um gasto que {pn} não deve ver (um presente, por exemplo), diga <strong>“não mostra pra {pn}”</strong> ou toque no cadeado do lançamento.
        {mySecret > 0 && (
          <>
            {" "}
            Você tem <strong>{mySecret}</strong> {mySecret === 1 ? "lançamento pessoal" : "lançamentos pessoais"} neste mês, fora dos números de {pn}.
          </>
        )}
      </PatronCard>

      <form action={unlinkPartner} className="self-start">
        <ConfirmButton
          label="Desativar modo casal"
          message={`Desativar a conta conjunta com ${pn}? Ninguém perde nada: cada um volta a ver só o que lançou.`}
          className="link-accent !text-muted"
        >
          Desativar modo casal
        </ConfirmButton>
      </form>
    </>
  );
}
