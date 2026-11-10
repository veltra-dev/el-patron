import { money, moneyCompact } from "@/lib/format";

// Gráficos em HTML/CSS puro, renderizados no servidor.
// Regras (skill dataviz): marcas finas, ponta de dado arredondada em 4px
// ancorada na base, 2px de folga entre barras vizinhas, grade recessiva,
// texto sempre nas cores de texto (nunca na cor da série), tooltip no hover
// e tabela equivalente para leitura sem cor.

const tooltip =
  "pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-lg group-hover:block group-focus-within:block";

/* ---------------- Despesas por categoria (uma série, barras horizontais) ---------------- */

export function CategoryBars({ rows }: { rows: { label: string; value: number; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const pct = total ? (r.value / total) * 100 : 0;
        return (
          <li key={r.label} tabIndex={0} className="group relative rounded-lg px-2 py-1.5 outline-none hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)]">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="num shrink-0 font-medium">
                {money(r.value)} <span className="font-normal text-[var(--text-muted)]">· {pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2 rounded-r-[4px] bg-[var(--track)]">
              <div className="h-full rounded-r-[4px] bg-[var(--series-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <div className={`${tooltip} right-2 top-full mt-1`}>
              <strong>{r.label}</strong> · {money(r.value)} · {pct.toFixed(1)}% do mês · {r.count} lançamento{r.count === 1 ? "" : "s"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Despesas x receitas por mês (duas séries, colunas agrupadas) ---------------- */

type MonthPoint = { month: string; label: string; despesa: number; receita: number };

function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return step * pow;
}

export function MonthlyColumns({ data, highlight }: { data: MonthPoint[]; highlight: string }) {
  const top = niceMax(Math.max(...data.flatMap((d) => [d.despesa, d.receita])));
  const ticks = [top, top / 2, 0];
  const H = 160;

  return (
    <div>
      <div className="mb-5 flex gap-4 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--series-2)]" /> Despesas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--series-1)]" /> Receitas
        </span>
      </div>

      <div className="flex gap-2">
        {/* eixo Y */}
        <div className="num relative w-14 shrink-0 text-right text-[11px] text-[var(--text-muted)]" style={{ height: H }}>
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {moneyCompact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: H }}>
            {ticks.map((t, i) => (
              <div key={t} className="absolute inset-x-0 border-t border-[var(--grid)]" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {data.map((d, i) => (
                <div
                  key={d.month}
                  tabIndex={0}
                  className={`group relative flex flex-1 items-end justify-center gap-[2px] rounded-t-md outline-none hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] ${
                    d.month === highlight ? "bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)]" : ""
                  }`}
                >
                  <div className="w-[34%] max-w-5 rounded-t-[4px] bg-[var(--series-2)]" style={{ height: `${(d.despesa / top) * 100}%` }} />
                  <div className="w-[34%] max-w-5 rounded-t-[4px] bg-[var(--series-1)]" style={{ height: `${(d.receita / top) * 100}%` }} />
                  <div
                    className={`${tooltip} top-1 ${
                      i === 0 ? "left-0" : i === data.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <div className="mb-0.5 font-semibold">{d.label}</div>
                    <div className="num">Despesas: {money(d.despesa)}</div>
                    <div className="num">Receitas: {money(d.receita)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex">
            {data.map((d) => (
              <span key={d.month} className={`flex-1 text-center text-[11px] ${d.month === highlight ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-[var(--text-muted)]">Ver como tabela</summary>
        <table className="num mt-2 w-full text-left text-xs">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="py-1 font-medium">Mês</th>
              <th className="py-1 text-right font-medium">Despesas</th>
              <th className="py-1 text-right font-medium">Receitas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-[var(--border)]">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{money(d.despesa)}</td>
                <td className="py-1 text-right">{money(d.receita)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------------- Cartão de número ---------------- */

export function StatTile({ label, value, tone, hint }: { label: string; value: number; tone?: "good" | "bad"; hint?: string }) {
  const color = tone === "good" ? "text-[var(--good-text)]" : tone === "bad" ? "text-[var(--critical-text)]" : "";
  const sign = tone === "bad" ? "▼ " : tone === "good" ? "▲ " : "";
  return (
    <div className="card h-full p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className={`num mt-1 text-xl font-semibold sm:text-2xl ${color}`}>
        {sign && <span className="text-sm" aria-hidden="true">{sign}</span>}
        {money(value)}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}
