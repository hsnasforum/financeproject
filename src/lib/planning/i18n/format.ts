import { type Locale } from "./index";
import { roundKrw } from "../calc/roundingPolicy";

export function formatKrw(locale: Locale, amountKrw: number): string {
  if (!Number.isFinite(amountKrw)) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(roundKrw(amountKrw));
}

export function formatPct(locale: Locale, pct: number): string {
  if (!Number.isFinite(pct)) return "-";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pct)}%`;
}

export function formatMonths(locale: Locale, months: number): string {
  if (!Number.isFinite(months)) return "-";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(months)}개월`;
}

export function formatDate(locale: Locale, iso: string | undefined | null): string {
  if (!iso) return "-";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(ts));
}
