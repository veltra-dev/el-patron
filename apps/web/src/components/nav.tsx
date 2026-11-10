"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Resumo" },
  { href: "/transacoes", label: "Transações" },
  { href: "/contas", label: "Contas" },
  { href: "/notas", label: "Notas" },
  { href: "/lembretes", label: "Lembretes" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-0.5 sm:gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium sm:px-3.5 sm:text-sm transition-colors ${
                  active
                    ? "bg-[var(--btn)] text-[var(--btn-ink)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
