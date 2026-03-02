import { type EcosKeyStatRow } from "./ecosClient.ts";

export type EcosRatesParsed = {
  policyRatePct?: number;
  callOvernightPct?: number;
  cd91Pct?: number;
  koribor3mPct?: number;
  msb364Pct?: number;
  asOf?: string;
  warnings: string[];
};

type CycleParsed = {
  isoDate: string;
  sortKey: number;
  monthNormalized: boolean;
};

const KEYSTAT_TARGETS = {
  "한국은행 기준금리": "policyRatePct",
  "콜금리(익일물)": "callOvernightPct",
  "CD수익률(91일)": "cd91Pct",
  "KORIBOR(3개월)": "koribor3mPct",
  "통안증권수익률(364일)": "msb364Pct",
} as const;

type TargetLabel = keyof typeof KEYSTAT_TARGETS;
type TargetField = (typeof KEYSTAT_TARGETS)[TargetLabel];

function parseDataValue(input: string): number | null {
  const normalized = input.replace(/,/g, "").trim();
  if (!normalized) return null;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseCycle(cycle: string): CycleParsed | null {
  const trimmed = cycle.trim();
  if (/^\d{8}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      isoDate,
      sortKey: Number(trimmed),
      monthNormalized: false,
    };
  }

  if (/^\d{6}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    return {
      isoDate,
      sortKey: Number(`${trimmed}01`),
      monthNormalized: true,
    };
  }

  return null;
}

export function parseEcosKeyStats(rows: EcosKeyStatRow[]): EcosRatesParsed {
  const warnings = new Set<string>();
  const out: Omit<EcosRatesParsed, "warnings"> = {};
  const latestCycleByField: Partial<Record<TargetField, number>> = {};
  let latestCycleOverall: CycleParsed | null = null;

  for (const row of rows) {
    const keyName = row.KEYSTAT_NAME.trim() as TargetLabel;
    const field = KEYSTAT_TARGETS[keyName];
    if (!field) continue;

    const parsedCycle = parseCycle(row.CYCLE);
    if (!parsedCycle) {
      warnings.add(`ECOS_INVALID_CYCLE:${row.CYCLE.trim() || "EMPTY"}`);
    } else {
      if (!latestCycleOverall || parsedCycle.sortKey > latestCycleOverall.sortKey) {
        latestCycleOverall = parsedCycle;
      }
      if (parsedCycle.monthNormalized) {
        warnings.add("MONTH_CYCLE_NORMALIZED");
      }
    }

    const parsedValue = parseDataValue(row.DATA_VALUE);
    if (parsedValue === null) {
      warnings.add(`ECOS_INVALID_NUMBER:${keyName}`);
      continue;
    }

    const currentFieldCycle = latestCycleByField[field] ?? -1;
    const candidateCycle = parsedCycle?.sortKey ?? 0;
    if (candidateCycle >= currentFieldCycle) {
      latestCycleByField[field] = candidateCycle;
      out[field] = parsedValue;
    }
  }

  if (latestCycleOverall) {
    out.asOf = latestCycleOverall.isoDate;
  }

  if (typeof out.policyRatePct !== "number") warnings.add("ECOS_MISSING_POLICY_RATE");
  if (typeof out.callOvernightPct !== "number") warnings.add("ECOS_MISSING_CALL_OVERNIGHT");
  if (typeof out.cd91Pct !== "number") warnings.add("ECOS_MISSING_CD91");
  if (typeof out.koribor3mPct !== "number") warnings.add("ECOS_MISSING_KORIBOR3M");
  if (typeof out.msb364Pct !== "number") warnings.add("ECOS_MISSING_MSB364");

  return {
    ...out,
    warnings: Array.from(warnings),
  };
}
