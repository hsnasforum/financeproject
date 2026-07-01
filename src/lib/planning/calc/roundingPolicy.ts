export const ROUNDING_POLICY = {
  krw: "nearest_won",
  percentDigits: 4,
  monthsDigits: 1,
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function roundToInteger(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

export function floorToInteger(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : Math.floor(parsed);
}

export function clampRoundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const rounded = roundToInteger(value);
  if (rounded === undefined) return fallback;
  return Math.max(min, Math.min(max, rounded));
}

export function clampFlooredInteger(value: unknown, min: number, max: number, fallback: number): number {
  const floored = floorToInteger(value);
  if (floored === undefined) return fallback;
  return Math.max(min, Math.min(max, floored));
}

export function roundKrw(value: number): number {
  return roundToInteger(value) ?? 0;
}

export function roundToDigits(value: number, digits: number): number {
  if (!isFiniteNumber(value)) return 0;
  const safeDigits = Math.max(0, Math.min(12, Math.trunc(digits)));
  const factor = 10 ** safeDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundPercent(value: number, digits: number = ROUNDING_POLICY.percentDigits): number {
  return roundToDigits(value, digits);
}

export function roundMonths(value: number, digits: number = ROUNDING_POLICY.monthsDigits): number {
  return roundToDigits(value, digits);
}
