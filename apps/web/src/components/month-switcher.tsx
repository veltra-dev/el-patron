import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/format";

/**
 * `current` é o último mês navegável; `homeMonth` (padrão: `current`) é o mês
 * que a página mostra sem ?mes=.
 */
export function MonthSwitcher({
  month,
  current,
  basePath,
  homeMonth = current,
}: {
  month: string;
  current: string;
  basePath: string;
  homeMonth?: string;
}) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canNext = next <= current;
  const href = (m: string) => (m === homeMonth ? basePath : `${basePath}?mes=${m}`);
  const arrow = "grid size-9 place-items-center rounded-full border border-[var(--border)] text-[var(--text-secondary)]";

  return (
    <div className="flex items-center gap-2">
      <Link href={href(prev)} className={`${arrow} hover:bg-[var(--surface-2)]`} aria-label="Mês anterior">
        ‹
      </Link>
      <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
      {canNext ? (
        <Link href={href(next)} className={`${arrow} hover:bg-[var(--surface-2)]`} aria-label="Próximo mês">
          ›
        </Link>
      ) : (
        <span className={`${arrow} opacity-35`} aria-hidden="true">
          ›
        </span>
      )}
    </div>
  );
}
