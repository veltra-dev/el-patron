import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/format";
import { Icon } from "./icons";

/**
 * `current` é o último mês navegável; `homeMonth` (padrão: `current`) é o mês
 * que a página mostra sem ?mes=.
 */
export function MonthSwitcher({
  month,
  current,
  basePath,
  homeMonth = current,
  short,
}: {
  month: string;
  current: string;
  basePath: string;
  homeMonth?: string;
  short?: boolean;
}) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canNext = next <= current;
  const href = (m: string) => (m === homeMonth ? basePath : `${basePath}?mes=${m}`);
  const arrow = "grid size-10 place-items-center rounded-full text-soft";

  return (
    <div className="flex min-h-12 items-center rounded-full border border-line bg-surface px-1">
      <Link href={href(prev)} className={`${arrow} hover:bg-raised`} aria-label="Mês anterior">
        <Icon name="chevronLeft" size={18} />
      </Link>
      <span className={`text-center text-[15px] font-semibold ${short ? "min-w-20" : "min-w-36"}`}>
        {short ? monthLabel(month, "short") + " " + month.slice(0, 4) : monthLabel(month).replace(" de ", " ")}
      </span>
      {canNext ? (
        <Link href={href(next)} className={`${arrow} hover:bg-raised`} aria-label="Próximo mês">
          <Icon name="chevronRight" size={18} />
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden="true">
          <Icon name="chevronRight" size={18} />
        </span>
      )}
    </div>
  );
}
