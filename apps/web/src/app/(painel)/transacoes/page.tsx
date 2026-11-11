import { categoryLabel, type Transaction } from "@elpatron/shared";
import { CategorySelect } from "@/components/category-select";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, FormDialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { MonthSwitcher } from "@/components/month-switcher";
import { Chips, Empty, PageHeader, SearchBox, Stat } from "@/components/ui";
import { getUser, transactionsBetween } from "@/lib/db";
import { currentMonth, dayShort, isValidMonth, money, monthLabel, monthRange, relativeDay, todayIn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { createTransaction, removeTransaction, toggleSharedTransaction } from "../actions";

export const metadata = { title: "Transações · ElPatrón" };

const ORIGIN: Record<Transaction["source"], string> = { whatsapp: "WhatsApp", importacao: "importação", web: "manual" };

export default async function TransacoesPage({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string; q?: string }> }) {
  const user = await requireUser();
  const current = currentMonth(user.timezone);
  const { mes, tipo, q } = await searchParams;
  const month = isValidMonth(mes) && mes <= current ? mes : current;
  const filter = tipo === "despesa" || tipo === "receita" ? tipo : undefined;
  const query = q?.trim().toLowerCase() || "";
  const today = todayIn(user.timezone);

  const { from, to } = monthRange(month);
  const [all, partner] = await Promise.all([transactionsBetween(user.id, from, to), user.partner_id ? getUser(user.partner_id) : null]);
  const entradas = all.filter((t) => t.kind === "receita").reduce((s, t) => s + Number(t.amount), 0);
  const saidas = all.filter((t) => t.kind === "despesa").reduce((s, t) => s + Number(t.amount), 0);
  const rows = all.filter(
    (t) =>
      (!filter || t.kind === filter) &&
      (!query || `${t.description ?? ""} ${categoryLabel(t.category)}`.toLowerCase().includes(query)),
  );

  const days = new Map<string, Transaction[]>();
  for (const t of rows) days.set(t.occurred_on, [...(days.get(t.occurred_on) ?? []), t]);

  const params = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { mes: month === current ? undefined : month, tipo: filter, q: q?.trim() || undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/transacoes?${s}` : "/transacoes";
  };
  const resultado = entradas - saidas;

  const newTx = (
    <FormDialog
      title="Novo lançamento"
      description="Mais rápido pelo WhatsApp: “gastei 45 na farmácia”."
      action={createTransaction}
      trigger={
        <>
          <Icon name="plus" size={18} /> <span className="hidden sm:inline">Novo lançamento</span>
          <span className="sm:hidden">Novo</span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {(["despesa", "receita"] as const).map((k) => (
          <label key={k} className="pill cursor-pointer justify-center has-[:checked]:border-accent has-[:checked]:text-accent">
            <input type="radio" name="kind" value={k} defaultChecked={k === "despesa"} className="sr-only" />
            {k === "despesa" ? "Despesa" : "Receita"}
          </label>
        ))}
      </div>
      <Field label="Valor">
        <input name="amount" inputMode="decimal" required placeholder="0,00" className="input num text-lg" />
      </Field>
      <Field label="Descrição">
        <input name="description" placeholder="Ex.: almoço, farmácia" className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <CategorySelect />
        </Field>
        <Field label="Data">
          <input name="date" type="date" defaultValue={today} required className="input" />
        </Field>
      </div>
      {partner && (
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" name="shared" className="size-5 accent-[var(--accent)]" /> Dividir 50/50 com {partner.name.split(" ")[0]}
        </label>
      )}
    </FormDialog>
  );

  const actions = (t: Transaction) => (
    <div className="flex items-center justify-end">
      {partner && t.kind === "despesa" && (
        <form action={toggleSharedTransaction}>
          <input type="hidden" name="id" value={t.id} />
          <ConfirmButton
            label={t.shared ? `Parar de dividir com ${partner.name}` : `Dividir com ${partner.name}`}
            className={`grid size-10 place-items-center rounded-full transition-colors hover:bg-raised ${t.shared ? "text-partner" : "text-muted hover:text-ink"}`}
          >
            <Icon name="casal" size={17} />
          </ConfirmButton>
        </form>
      )}
      <form action={removeTransaction}>
        <input type="hidden" name="id" value={t.id} />
        <ConfirmButton label="Apagar lançamento" message={`Apagar "${t.description || categoryLabel(t.category)}" (${money(Number(t.amount))})?`}>
          <Icon name="trash" size={17} />
        </ConfirmButton>
      </form>
    </div>
  );

  return (
    <>
      <PageHeader title="Transações" subtitle={monthLabel(month)}>
        <MonthSwitcher month={month} current={current} basePath="/transacoes" short />
        <div className="hidden lg:block">{newTx}</div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox defaultValue={q} placeholder="Buscar transação" hidden={{ ...(month !== current ? { mes: month } : {}), ...(filter ? { tipo: filter } : {}) }} />
        <div className="lg:hidden">{newTx}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Entradas" value={entradas} sign="+" tone="good" />
        <Stat label="Saídas" value={saidas} sign="−" />
        <Stat label="Resultado" value={Math.abs(resultado)} sign={resultado >= 0 ? "+" : "−"} tone={resultado >= 0 ? "accent" : "bad"} className="col-span-2 lg:col-span-1" />
      </div>

      <Chips
        items={[
          { href: params({ tipo: undefined }), label: "Todas", active: !filter },
          { href: params({ tipo: "despesa" }), label: "Despesas", active: filter === "despesa" },
          { href: params({ tipo: "receita" }), label: "Receitas", active: filter === "receita" },
        ]}
      />

      {rows.length === 0 ? (
        <div className="card">
          <Empty>{query ? `Nada encontrado para “${q}”.` : `Nada registrado em ${monthLabel(month).toLowerCase()}.`}</Empty>
        </div>
      ) : (
        <>
          {/* desktop: tabela */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-5 py-4 font-semibold">Descrição</th>
                  <th className="px-3 py-4 font-semibold">Categoria</th>
                  <th className="px-3 py-4 font-semibold">Origem</th>
                  <th className="px-3 py-4 font-semibold">Data</th>
                  <th className="px-3 py-4 text-right font-semibold">Valor</th>
                  <th className="w-24 px-3 py-4">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-semibold">
                      {t.description || categoryLabel(t.category)}
                      {t.shared && <span className="ml-2 rounded-full bg-partner/20 px-2 py-0.5 text-[11px] font-semibold text-[#b3aaf5]">dividida</span>}
                    </td>
                    <td className="px-3 py-3 text-soft">{categoryLabel(t.category)}</td>
                    <td className={`px-3 py-3 ${t.source === "whatsapp" ? "text-accent-soft" : "text-soft"}`}>{ORIGIN[t.source] ?? t.source}</td>
                    <td className="px-3 py-3 text-soft">{dayShort(t.occurred_on)}</td>
                    <td className={`num px-3 py-3 text-right font-semibold ${t.kind === "receita" ? "text-good" : ""}`}>
                      {t.kind === "receita" ? "+ " : "− "}
                      {money(Number(t.amount))}
                    </td>
                    <td className="px-2 py-1">{actions(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="flex items-center gap-2 border-t border-line px-5 py-3.5 text-[13px] text-muted">
              <Icon name="patron" size={16} className="text-accent" /> As transações marcadas <strong className="text-accent-soft">WhatsApp</strong> foram lançadas
              pelo Patrón a partir de uma mensagem sua.
            </p>
          </div>

          {/* mobile: agrupado por dia */}
          <div className="flex flex-col gap-4 md:hidden">
            {[...days.entries()].map(([day, items]) => {
              const net = items.reduce((s, t) => s + (t.kind === "receita" ? 1 : -1) * Number(t.amount), 0);
              return (
                <section key={day} className="flex flex-col gap-2">
                  <h2 className="eyebrow flex justify-between px-1">
                    <span>{relativeDay(day, today)}</span>
                    <span className="num normal-case tracking-normal">
                      {net >= 0 ? "+ " : "− "}
                      {money(Math.abs(net))}
                    </span>
                  </h2>
                  <ul className="card divide-y divide-line px-4">
                    {items.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-3">
                        <span className={`icon-box ${t.kind === "receita" ? "!bg-good-bg !text-good" : "!text-soft"}`}>
                          <Icon name={t.kind === "receita" ? "arrowDownLeft" : "arrowUpRight"} size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{t.description || categoryLabel(t.category)}</div>
                          <div className="truncate text-[13px] text-muted">
                            {categoryLabel(t.category)}
                            {t.shared && " · dividida"}
                          </div>
                        </div>
                        <span className={`num shrink-0 font-semibold ${t.kind === "receita" ? "text-good" : ""}`}>
                          {t.kind === "receita" ? "+ " : "− "}
                          {money(Number(t.amount))}
                        </span>
                        {actions(t)}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}

      <div className="rounded-[20px] border border-dashed border-line-strong p-4 text-sm leading-relaxed text-muted md:hidden">
        Mais rápido pelo WhatsApp: mande <strong className="text-ink">“gastei 45 na farmácia”</strong> e o Patrón lança pra você.
      </div>
    </>
  );
}
