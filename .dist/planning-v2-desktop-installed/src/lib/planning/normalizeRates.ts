export class RateNormalizationError extends Error {
  field: string;
  value: number;

  constructor(field: string, value: number, message: string) {
    super(message);
    this.name = "RateNormalizationError";
    this.field = field;
    this.value = value;
  }
}

function assertFinite(value: number, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RateNormalizationError(field, value, `${field} must be a finite number`);
  }
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Normalize user-facing APR input to percent scale.
 * - legacy decimal (0 < x <= 1): x * 100
 * - percent (1 < x <= 100): x
 * - zero: 0
 * - otherwise: throws
 */
export function normalizeAprPct(value: number, field = "aprPct"): number {
  assertFinite(value, field);
  if (value === 0) return 0;
  if (value > 0 && value <= 1) return roundTo(value * 100, 6);
  if (value > 1 && value <= 100) return value;
  throw new RateNormalizationError(
    field,
    value,
    `${field} must be 0, legacy decimal (0<x<=1), or percent (1<x<=100)`,
  );
}

export function normalizeNewAprPct(value: number, field = "newAprPct"): number {
  return normalizeAprPct(value, field);
}
