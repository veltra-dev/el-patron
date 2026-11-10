const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const money = (v: number) => brl.format(v);

export function moneyCompact(v: number) {
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

/** "2026-11" do mês atual no fuso informado. */
export function currentMonth(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(date);
}

/** Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM". */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 15));
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(d);
  return label.replace(".", "").replace(/^./, (c) => c.toUpperCase());
}

export function isValidMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** "10/11" a partir de "2026-11-10". */
export const dayMonth = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;

export function dateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function maskPhone(phone: string) {
  const d = phone.replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : phone;
}
