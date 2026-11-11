"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { Logo } from "./logo";

export const SECTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Resumo", icon: "resumo" },
  { href: "/transacoes", label: "Transações", icon: "transacoes" },
  { href: "/contas", label: "Contas", icon: "contas" },
  { href: "/orcamentos", label: "Orçamentos", icon: "orcamentos" },
  { href: "/metas", label: "Metas", icon: "metas" },
  { href: "/previsao", label: "Previsão", icon: "previsao" },
  { href: "/assinaturas", label: "Assinaturas", icon: "assinaturas" },
  { href: "/casal", label: "Modo casal", icon: "casal" },
  { href: "/notas", label: "Notas", icon: "notas" },
  { href: "/lembretes", label: "Lembretes", icon: "lembretes" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function OnlineDot() {
  return <span className="size-1.5 shrink-0 rounded-full bg-good" aria-hidden="true" />;
}

/** Barra lateral do desktop (lg+). */
export function Sidebar({ name, logout }: { name: string; logout: React.ReactNode }) {
  const path = usePathname();
  const onPatron = isActive(path, "/patron");
  return (
    <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface-2 px-4 py-[22px] lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <Logo />
        <div className="min-w-0">
          <div className="display text-lg font-bold">ElPatrón</div>
          <div className="truncate text-xs text-muted">{name}</div>
        </div>
      </Link>

      <nav aria-label="Seções" className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => {
          const active = isActive(path, s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm transition-colors ${
                active ? "bg-raised font-semibold text-accent" : "font-medium text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon name={s.icon} />
              {s.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href="/patron"
          aria-current={onPatron ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-2xl border p-3 ${onPatron ? "border-accent bg-accent-bg" : "border-accent-line bg-accent-bg hover:border-accent"}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink">
            <Icon name="patron" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-accent-soft">Patrón</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#8FBEA6]">
              <OnlineDot /> online no WhatsApp
            </div>
          </div>
        </Link>
        {logout}
      </div>
    </aside>
  );
}

/** Cabeçalho do mobile. Some na tela do chat, que tem o próprio. */
export function MobileHeader({ name, greeting }: { name: string; greeting: string }) {
  const path = usePathname();
  if (isActive(path, "/patron")) return null;
  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-4 lg:hidden">
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <Logo className="size-10 shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="display text-lg font-bold">ElPatrón</div>
          <div className="truncate text-xs text-muted">
            {greeting}, {name.split(" ")[0]}
          </div>
        </div>
      </Link>
      <Link href="/patron" className="flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-soft">
        <OnlineDot /> Patrón online
      </Link>
    </header>
  );
}

const BOTTOM: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Resumo", icon: "resumo" },
  { href: "/transacoes", label: "Transações", icon: "transacoes" },
  { href: "/patron", label: "Patrón", icon: "patron" },
  { href: "/contas", label: "Contas", icon: "contas" },
  { href: "/mais", label: "Mais", icon: "mais" },
];

/** Barra inferior do mobile, com o Patrón no centro. */
export function BottomNav() {
  const path = usePathname();
  if (isActive(path, "/patron")) return null;
  // seções que não estão na barra acendem o "Mais"
  const inBar = BOTTOM.some((b) => b.href !== "/mais" && isActive(path, b.href));
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-end justify-around px-1">
        {BOTTOM.map((b) => {
          const active = b.href === "/mais" ? !inBar : isActive(path, b.href);
          if (b.href === "/patron") {
            return (
              <li key={b.href} className="flex-1">
                <Link href={b.href} className="-mt-5 flex flex-col items-center gap-1 pb-2 text-[11px] font-semibold text-soft">
                  <span className="grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_0_0_6px_var(--surface-2)]">
                    <Icon name="patron" size={26} />
                  </span>
                  Patrón
                </Link>
              </li>
            );
          }
          return (
            <li key={b.href} className="flex-1">
              <Link
                href={b.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-accent" : "text-soft"}`}
              >
                <Icon name={b.icon} size={22} />
                {b.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
