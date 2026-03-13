import { roundKrw, roundToDigits } from "../calc/roundingPolicy";
import { type ResultDtoV1 } from "./resultDto";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundTo(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return value;
  return roundToDigits(value, digits);
}

function normalizePct(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (typeof raw !== "number") return undefined;
  const pct = Math.abs(raw) <= 1 ? raw * 100 : raw;
  return roundTo(pct, 4);
}

export function backfillResultDtoDebtFromRaw(resultDto: ResultDtoV1): {
  resultDto: ResultDtoV1;
  migrated: boolean;
} {
  const rawDebt = asRecord(asRecord(resultDto.raw).debt);
  if (Object.keys(rawDebt).length < 1) {
    return { resultDto, migrated: false };
  }

  const summary = asRecord(rawDebt.summary);
  const meta = asRecord(rawDebt.meta);
  const nextDebt: NonNullable<ResultDtoV1["debt"]> = {
    ...(resultDto.debt ?? {}),
  };
  let changed = false;

  if (typeof asNumber(nextDebt.dsrPct) !== "number") {
    const dsrPct = normalizePct(asNumber(summary.debtServiceRatio) ?? asNumber(meta.debtServiceRatio));
    if (typeof dsrPct === "number") {
      nextDebt.dsrPct = dsrPct;
      changed = true;
    }
  }

  if (typeof asNumber(nextDebt.totalMonthlyPaymentKrw) !== "number") {
    const totalMonthlyPaymentKrw = asNumber(summary.totalMonthlyPaymentKrw) ?? asNumber(meta.totalMonthlyPaymentKrw);
    if (typeof totalMonthlyPaymentKrw === "number") {
      nextDebt.totalMonthlyPaymentKrw = Math.max(0, roundKrw(totalMonthlyPaymentKrw));
      changed = true;
    }
  }

  const hasCanonicalWarnings = Array.isArray(nextDebt.warnings) && nextDebt.warnings.length > 0;
  if (!hasCanonicalWarnings) {
    const warnings = asArray(rawDebt.warnings)
      .map((entry) => asRecord(entry))
      .map((entry) => {
        const code = asString(entry.code);
        const message = asString(entry.message);
        if (!code && !message) return null;
        return {
          code: code || "UNKNOWN",
          message: message || "부채 경고",
          ...(entry.data !== undefined ? { data: entry.data } : {}),
        };
      })
      .filter((entry): entry is { code: string; message: string; data?: unknown } => entry !== null);
    if (warnings.length > 0) {
      nextDebt.warnings = warnings;
      changed = true;
    }
  }

  if (!changed) {
    return { resultDto, migrated: false };
  }

  return {
    resultDto: {
      ...resultDto,
      debt: nextDebt,
    },
    migrated: true,
  };
}
