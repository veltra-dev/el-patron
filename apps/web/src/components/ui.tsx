import Link from "next/link";
import { money } from "@/lib/format";
import { Icon } from "./icons";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-[1_1_220px]">
        <h1 className="display text-[30px] font-bold leading-tight lg:text-[28px]">{title}</h1>
        {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

type Tone = "good" | "bad" | "accent" | undefined;
const toneClass = (t: Tone) => (t === "good" ? "text-good" : t === "bad" ? "text-bad" : t === "accent" ? "text-accent-soft" : "");

/** Cartão de número. `highlight` = cartão âmbar cheio (saldo do mês). */
export function Stat({
  label,
  value,
  hint,
  tone,
  highlight,
  sign,
  className = "",
}: {
  label: string;
  value: number | string;
  hint?: React.ReactNode;
  tone?: Tone;
  highlight?: boolean;
  sign?: "+" | "−";
  className?: string;
}) {
  const shown = typeof value === "number" ? money(value) : value;
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[20px] border p-4 ${
        highlight ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
      } ${className}`}
    >
      <span className={`eyebrow ${highlight ? "!text-accent-ink font-bold" : ""}`}>{label}</span>
      <span className={`display num text-[26px] font-bold leading-tight ${highlight ? "" : toneClass(tone)}`}>
        {sign && `${sign} `}
        {shown}
      </span>
      {hint && <span className={`text-xs ${highlight ? "font-semibold text-[#4A3608]" : "text-muted"}`}>{hint}</span>}
    </div>
  );
}

/** Barra de progresso com o estado em texto ao lado (cor nunca sozinha). */
export function Meter({ pct, level = "ok", label }: { pct: number; level?: "ok" | "alerta" | "estourou" | "accent"; label: string }) {
  const color = level === "estourou" ? "bg-bad" : level === "alerta" || level === "accent" ? "bg-accent" : "bg-good";
  return (
    <div role="img" aria-label={label} className="h-2 overflow-hidden rounded-full bg-track">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function PatronCard({ title = "Patrón", children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`card-patron flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          <Icon name="patron" size={16} />
        </span>
        <h2 className="text-[17px] font-semibold text-accent-soft">{title}</h2>
      </div>
      <div className="text-[15px] leading-relaxed">{children}</div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </section>
  );
}

/** Faixa curta do Patrón (uma linha + ação). */
export function PatronStrip({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-patron flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
        <Icon name="patron" size={16} />
      </span>
      <p className="min-w-0 flex-[1_1_240px] text-sm leading-relaxed">{children}</p>
      {action}
    </div>
  );
}

export function CardTitle({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {href && (
        <Link href={href} className="link-accent">
          {linkLabel ?? "Abrir"}
        </Link>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-8 text-center text-sm leading-relaxed text-muted">{children}</p>;
}

/** Linha de pílulas de filtro (rolagem horizontal no mobile). */
export function Chips({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {items.map((c) => (
        <Link key={c.label} href={c.href} aria-current={c.active ? "true" : undefined} className="pill shrink-0">
          {c.label}
        </Link>
      ))}
    </div>
  );
}

export function SearchBox({ name = "q", defaultValue, placeholder = "Buscar", hidden }: { name?: string; defaultValue?: string; placeholder?: string; hidden?: Record<string, string> }) {
  return (
    <form role="search" className="flex min-h-11 flex-[1_1_220px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted focus-within:border-accent lg:max-w-64">
      <Icon name="search" size={18} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-[42px] min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </form>
  );
}

/** Inicial em caixa (avatar de conta/transação). */
export function Initial({ text, tone }: { text: string; tone?: "good" | "partner" }) {
  const cls = tone === "good" ? "!bg-good-bg !text-good" : tone === "partner" ? "!bg-partner !text-white" : "";
  return (
    <span className={`icon-box ${cls}`} aria-hidden="true">
      {(text.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
