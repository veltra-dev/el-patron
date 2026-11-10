import { tzOffset } from "@elpatron/shared";

export { tzOffset };

/** Data local (YYYY-MM-DD) no fuso informado. */
export function localDate(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** "terça-feira, 10/11/2026 14:32 (UTC-03:00)" */
export function describeNow(timeZone: string, date = new Date()): string {
  const human = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${human} (UTC${tzOffset(timeZone, date)})`;
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
