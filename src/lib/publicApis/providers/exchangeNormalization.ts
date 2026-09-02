export function parseExchangeRate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeExchangeCurrencyUnit(raw: string): { code: string; scale: number } {
  const text = raw.trim().toUpperCase();
  const matched = text.match(/^([A-Z]{3})\s*\((\d+)\)$/);
  if (!matched) return { code: text, scale: 1 };
  const scale = Number(matched[2]);
  return {
    code: matched[1],
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}
