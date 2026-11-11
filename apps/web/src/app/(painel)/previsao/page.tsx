import Link from "next/link";
import { ForecastChart } from "@/components/forecast-chart";
import { CardTitle, Empty, PageHeader, PatronCard, Stat } from "@/components/ui";
import { cashForecast } from "@/lib/forecast";
import { dayShort, money, moneyShort, monthLabel } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Previsão · ElPatrón" };

export default async function PrevisaoPage() {
  const user = await requireUser();
  const fc = await cashForecast(user);

  // agrupa saídas com o mesmo nome; mostra as maiores e soma o resto
  const byLabel = new Map<string, number>();
  for (const o of fc.outflows) byLabel.set(o.label, (byLabel.get(o.label) ?? 0) + o.amount);
  const sorted = [...byLabel.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const restTotal = rest.reduce((s, [, v]) => s + v, 0);
  const plan = `Meu caixa ${fc.zeroOn ? `fica negativo em ${dayShort(fc.zeroOn)}` : "está apertado"}. Monta um plano do que adiar ou pagar primeiro pra fechar o mês no positivo.`;

  return (
    <>
      <PageHeader title="Previsão de caixa" subtitle={`${monthLabel(fc.month)} · até ${dayShort(fc.end)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Saldo hoje" value={moneyShort(fc.balance)} tone={fc.balance < 0 ? "bad" : undefined} hint="receitas − despesas do mês" />
        <Stat
          label={`Saldo em ${dayShort(fc.end)}`}
          value={moneyShort(Math.abs(fc.endBalance))}
          sign={fc.endBalance < 0 ? "−" : undefined}
          tone={fc.endBalance < 0 ? "bad" : "good"}
          hint={`${money(fc.totalOut)} em saídas previstas`}
        />
        <Stat
          label="Zera o caixa em"
          value={fc.zeroOn ? dayShort(fc.zeroOn) : "Não zera"}
          tone={fc.zeroOn ? "accent" : "good"}
          className="col-span-2 lg:col-span-1"
          hint={fc.zeroOn ? "sem mudar nada" : "com o que está previsto"}
        />
      </div>

      <section className="card p-5">
        <CardTitle>Saldo projetado dia a dia</CardTitle>
        <ForecastChart points={fc.points} zeroOn={fc.zeroOn} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted">Ver como tabela</summary>
          <table className="num mt-2 w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Dia</th>
                <th className="py-1 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {fc.points
                .filter((p, i, a) => i === 0 || i === a.length - 1 || p.balance !== a[i - 1]!.balance)
                .map((p) => (
                  <tr key={p.date} className="border-t border-line">
                    <td className="py-1">{dayShort(p.date)}</td>
                    <td className={`py-1 text-right ${p.balance < 0 ? "text-bad" : ""}`}>{money(p.balance)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="card p-5">
          <CardTitle href="/contas" linkLabel="Ver contas">
            O que pesa no mês
          </CardTitle>
          {top.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {top.map(([label, v]) => (
                <li key={label} className="flex items-center justify-between gap-3 py-3">
                  <span className="truncate">{label}</span>
                  <span className="num shrink-0 font-semibold">{money(v)}</span>
                </li>
              ))}
              {rest.length > 0 && (
                <li className="flex items-center justify-between gap-3 py-3 text-soft">
                  <span>+ {rest.length} contas menores</span>
                  <span className="num shrink-0 font-semibold">{money(restTotal)}</span>
                </li>
              )}
            </ul>
          ) : (
            <Empty>Nenhuma saída prevista até o fim do mês.</Empty>
          )}
        </section>

        {fc.zeroOn ? (
          <PatronCard
            title="Plano do Patrón"
            actions={
              <Link href={`/patron?msg=${encodeURIComponent(plan)}`} className="btn btn-accent">
                Pedir um plano
              </Link>
            }
          >
            O saldo cobre <strong>{Math.round(Math.min(1, fc.coverage) * 100)}%</strong> das saídas previstas. Peça ao Patrón um plano: ele olha suas contas e
            sugere o que adiar ou pagar primeiro.
          </PatronCard>
        ) : (
          <PatronCard title="Tudo sob controle">
            Pagando o que está previsto, o mês fecha com <strong>{money(fc.endBalance)}</strong>. Que tal mandar uma parte pra uma{" "}
            <Link href="/metas" className="link-accent">
              meta
            </Link>
            ?
          </PatronCard>
        )}
      </div>

      <p className="text-xs text-muted">
        Projeção a partir do saldo do mês, das contas em aberto e das assinaturas cadastradas. Receitas futuras não entram. É um cenário, não uma garantia.
      </p>
    </>
  );
}
