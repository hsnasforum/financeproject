export function parseExchangeRate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeExchangeCurrencyUnit(raw: string): { code: string; scale: number } | null {
  const text = raw.trim().toUpperCase();
  const plain = text.match(/^([A-Z]{3})$/);
  if (plain) return { code: plain[1], scale: 1 };

  const scaled = text.match(/^([A-Z]{3})\s*\(\s*(\d+)\s*\)$/);
  if (!scaled) return null;
  const scale = Number(scaled[2]);
  if (!Number.isSafeInteger(scale) || scale <= 0) return null;
  return { code: scaled[1], scale };
}

export function normalizeExchangeQuoteDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const matched = text.match(/^(\d{4})(\d{2})(\d{2})$/)
    ?? text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}
