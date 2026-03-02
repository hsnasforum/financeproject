export const ROUNDING_POLICY = {
  krw: "nearest_won",
  percentDigits: 4,
  monthsDigits: 1,
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function roundKrw(value: number): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.round(value);
}

export function roundToDigits(value: number, digits: number): number {
  if (!isFiniteNumber(value)) return 0;
  const safeDigits = Math.max(0, Math.min(12, Math.trunc(digits)));
  const factor = 10 ** safeDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundPercent(value: number, digits = ROUNDING_POLICY.percentDigits): number {
  return roundToDigits(value, digits);
}

export function roundMonths(value: number, digits = ROUNDING_POLICY.monthsDigits): number {
  return roundToDigits(value, digits);
}
