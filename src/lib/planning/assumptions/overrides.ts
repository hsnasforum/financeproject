import { type AssumptionsV2 } from "../v2/scenarios";
import { roundToDigits } from "../calc";
import { z } from "zod";

export const ASSUMPTIONS_OVERRIDE_KEYS = [
  "inflationPct",
  "investReturnPct",
  "cashReturnPct",
  "withdrawalRatePct",
] as const;

export type AssumptionsOverrideKey = typeof ASSUMPTIONS_OVERRIDE_KEYS[number];

export const AssumptionsOverrideKeySchema = z.enum(ASSUMPTIONS_OVERRIDE_KEYS);
export const AssumptionsOverrideValueSchema = z.union([
  z.number().finite(),
  z.string(),
  z.boolean(),
]);
export const AssumptionsOverrideEntrySchema = z.object({
  key: AssumptionsOverrideKeySchema,
  value: AssumptionsOverrideValueSchema,
  reason: z.string().optional().default(""),
  updatedAt: z.string().optional(),
});
export const AssumptionsOverrideListSchema = z.array(AssumptionsOverrideEntrySchema);

export type AssumptionsOverrideEntry = {
  key: AssumptionsOverrideKey;
  value: number;
  reason: string;
  updatedAt: string;
};

type ToOverridesFromRecordOptions = {
  reasonPrefix?: string;
  updatedAt?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeIso(value: unknown, fallbackIso: string): string {
  const raw = asString(value);
  if (!raw) return fallbackIso;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return fallbackIso;
  return new Date(parsed).toISOString();
}

function isOverrideKey(value: string): value is AssumptionsOverrideKey {
  return ASSUMPTIONS_OVERRIDE_KEYS.includes(value as AssumptionsOverrideKey);
}

function normalizePctValue(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  if (value === 0) return 0;
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return roundToDigits(pct, 6);
}

function normalizeEntry(
  value: unknown,
  fallbackIso: string,
): AssumptionsOverrideEntry | null {
  const parsed = AssumptionsOverrideEntrySchema.safeParse(value);
  if (!parsed.success) return null;
  const key = asString(parsed.data.key);
  if (!isOverrideKey(key)) return null;
  const numericValue = normalizePctValue(parsed.data.value);
  if (!isFiniteNumber(numericValue)) return null;
  return {
    key,
    value: numericValue,
    reason: asString(parsed.data.reason),
    updatedAt: normalizeIso(parsed.data.updatedAt, fallbackIso),
  };
}

function compareOverrideRecency(a: AssumptionsOverrideEntry, b: AssumptionsOverrideEntry): number {
  const aTs = Date.parse(a.updatedAt);
  const bTs = Date.parse(b.updatedAt);
  if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
    return aTs - bTs;
  }
  return a.updatedAt.localeCompare(b.updatedAt);
}

export function normalizeAssumptionsOverrides(
  input: unknown,
  nowIso = new Date().toISOString(),
): AssumptionsOverrideEntry[] {
  const rows = Array.isArray(input) ? input : [];
  const latestByKey = new Map<AssumptionsOverrideKey, AssumptionsOverrideEntry>();

  for (const item of rows) {
    const normalized = normalizeEntry(item, nowIso);
    if (!normalized) continue;
    const prev = latestByKey.get(normalized.key);
    if (!prev || compareOverrideRecency(prev, normalized) <= 0) {
      latestByKey.set(normalized.key, normalized);
    }
  }

  return ASSUMPTIONS_OVERRIDE_KEYS
    .map((key) => latestByKey.get(key))
    .filter((item): item is AssumptionsOverrideEntry => Boolean(item));
}

export function mergeAssumptions(
  snapshotAssumptions: AssumptionsV2,
  overrides: AssumptionsOverrideEntry[],
): AssumptionsV2 {
  const normalizedOverrides = normalizeAssumptionsOverrides(overrides, new Date().toISOString());
  const out: AssumptionsV2 = {
    ...snapshotAssumptions,
  };

  for (const entry of normalizedOverrides) {
    out[entry.key] = entry.value;
  }

  return out;
}

export function mergeAssumptionsWithProvenance(
  snapshotAssumptions: AssumptionsV2,
  overrides: AssumptionsOverrideEntry[],
): {
  effectiveAssumptions: AssumptionsV2;
  appliedOverrides: AssumptionsOverrideEntry[];
} {
  const appliedOverrides = normalizeAssumptionsOverrides(overrides, new Date().toISOString());
  return {
    effectiveAssumptions: mergeAssumptions(snapshotAssumptions, appliedOverrides),
    appliedOverrides,
  };
}

export function toAssumptionsOverridesFromRecord(
  input: Record<string, unknown>,
  options?: ToOverridesFromRecordOptions,
): AssumptionsOverrideEntry[] {
  const updatedAt = normalizeIso(options?.updatedAt, new Date().toISOString());
  const reasonPrefix = asString(options?.reasonPrefix) || "run assumptions override";

  const inflationValue = normalizePctValue(
    isFiniteNumber(input.inflationPct)
      ? input.inflationPct
      : input.inflation,
  );
  const investReturnValue = normalizePctValue(
    isFiniteNumber(input.investReturnPct)
      ? input.investReturnPct
      : (isFiniteNumber(input.expectedReturnPct)
        ? input.expectedReturnPct
        : input.expectedReturn),
  );
  const cashReturnValue = normalizePctValue(input.cashReturnPct);
  const withdrawalValue = normalizePctValue(input.withdrawalRatePct);

  return normalizeAssumptionsOverrides([
    ...(isFiniteNumber(inflationValue)
      ? [{
        key: "inflationPct",
        value: inflationValue,
        reason: `${reasonPrefix}: inflationPct`,
        updatedAt,
      }]
      : []),
    ...(isFiniteNumber(investReturnValue)
      ? [{
        key: "investReturnPct",
        value: investReturnValue,
        reason: `${reasonPrefix}: investReturnPct`,
        updatedAt,
      }]
      : []),
    ...(isFiniteNumber(cashReturnValue)
      ? [{
        key: "cashReturnPct",
        value: cashReturnValue,
        reason: `${reasonPrefix}: cashReturnPct`,
        updatedAt,
      }]
      : []),
    ...(isFiniteNumber(withdrawalValue)
      ? [{
        key: "withdrawalRatePct",
        value: withdrawalValue,
        reason: `${reasonPrefix}: withdrawalRatePct`,
        updatedAt,
      }]
      : []),
  ], updatedAt);
}
