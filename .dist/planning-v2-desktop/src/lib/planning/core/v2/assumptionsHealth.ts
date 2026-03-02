import { type AssumptionsV2, type RiskTolerance } from "./scenarios";
import {
  assumptionsHealthMessage,
  type AssumptionsHealthWarningCode,
} from "./warningsCatalog.ko";

export type WarningSeverityV2 = "info" | "warn" | "critical";

export type WarningV2 = {
  code: string;
  severity: WarningSeverityV2;
  message: string;
  data?: Record<string, unknown>;
};

export type AssumptionsHealthInput = {
  assumptions: AssumptionsV2;
  snapshotMeta?: {
    asOf?: string;
    fetchedAt?: string;
    missing?: boolean;
    warningsCount?: number;
  };
  nowIso?: string;
};

export type AssumptionsHealth = {
  warnings: WarningV2[];
  flags: {
    snapshotMissing: boolean;
    snapshotStaleDays?: number;
    optimisticReturn: boolean;
    riskMismatch: boolean;
  };
};

export type AssumptionsHealthSummary = {
  warningsCount: number;
  criticalCount: number;
  warningCodes: string[];
  snapshotStaleDays?: number;
  flags: AssumptionsHealth["flags"];
};

type CombinedAssumptionsHealth = {
  warnings: WarningV2[];
  summary: AssumptionsHealthSummary;
};

const SNAPSHOT_STALE_DAYS = 45;
const SNAPSHOT_VERY_STALE_DAYS = 120;

function toIso(input: string | undefined): string {
  return typeof input === "string" ? input.trim() : "";
}

function uniqueWarnings(warnings: WarningV2[]): WarningV2[] {
  const seen = new Set<string>();
  const out: WarningV2[] = [];
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(warning);
  }
  return out;
}

function daysSince(baseIso: string, nowIso?: string): number | undefined {
  const baseTs = Date.parse(baseIso);
  if (!Number.isFinite(baseTs)) return undefined;

  const nowTs = Date.parse(nowIso ?? new Date().toISOString());
  if (!Number.isFinite(nowTs)) return undefined;

  const diffMs = nowTs - baseTs;
  if (!Number.isFinite(diffMs)) return undefined;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function buildWarning(
  code: AssumptionsHealthWarningCode,
  severity: WarningSeverityV2,
  data?: Record<string, unknown>,
): WarningV2 {
  return {
    code,
    severity,
    message: assumptionsHealthMessage(code, data),
    ...(data ? { data } : {}),
  };
}

export function assessAssumptionsHealth(input: AssumptionsHealthInput): AssumptionsHealth {
  const warnings: WarningV2[] = [];
  const snapshotMeta = input.snapshotMeta;

  const snapshotMissing = snapshotMeta?.missing === true
    || toIso(snapshotMeta?.asOf).length === 0
    || toIso(snapshotMeta?.fetchedAt).length === 0;

  let snapshotStaleDays: number | undefined;
  if (snapshotMissing) {
    warnings.push(buildWarning(
      "SNAPSHOT_MISSING",
      "warn",
    ));
  } else {
    snapshotStaleDays = daysSince(toIso(snapshotMeta?.fetchedAt), input.nowIso);
    if (typeof snapshotStaleDays === "number" && snapshotStaleDays > SNAPSHOT_VERY_STALE_DAYS) {
      warnings.push(buildWarning(
        "SNAPSHOT_VERY_STALE",
        "critical",
        { days: snapshotStaleDays },
      ));
    } else if (typeof snapshotStaleDays === "number" && snapshotStaleDays > SNAPSHOT_STALE_DAYS) {
      warnings.push(buildWarning(
        "SNAPSHOT_STALE",
        "warn",
        { days: snapshotStaleDays },
      ));
    }
  }

  const investReturnPct = input.assumptions.investReturnPct;
  const optimisticReturn = investReturnPct >= 10;
  if (investReturnPct >= 15) {
    warnings.push(buildWarning(
      "OPTIMISTIC_RETURN_HIGH",
      "critical",
      { investReturnPct },
    ));
  } else if (investReturnPct >= 10) {
    warnings.push(buildWarning(
      "OPTIMISTIC_RETURN",
      "warn",
      { investReturnPct },
    ));
  }

  return {
    warnings: uniqueWarnings(warnings),
    flags: {
      snapshotMissing,
      ...(typeof snapshotStaleDays === "number" ? { snapshotStaleDays } : {}),
      optimisticReturn,
      riskMismatch: false,
    },
  };
}

export function assessRiskAssumptionConsistency(risk: RiskTolerance, assumptions: AssumptionsV2): WarningV2[] {
  const investReturnPct = assumptions.investReturnPct;

  if (risk === "low" && investReturnPct >= 10) {
    return [buildWarning(
      "RISK_ASSUMPTION_MISMATCH",
      "critical",
      { riskTolerance: risk, investReturnPct },
    )];
  }

  if (risk === "low" && investReturnPct > 7) {
    return [buildWarning(
      "RISK_ASSUMPTION_MISMATCH",
      "warn",
      { riskTolerance: risk, investReturnPct },
    )];
  }

  if (risk === "high" && investReturnPct < 4) {
    return [buildWarning(
      "RISK_ASSUMPTION_MISMATCH_LOW",
      "info",
      { riskTolerance: risk, investReturnPct },
    )];
  }

  return [];
}

export function combineAssumptionsHealth(
  base: AssumptionsHealth,
  riskWarnings: WarningV2[],
): CombinedAssumptionsHealth {
  const mergedWarnings = uniqueWarnings([...base.warnings, ...riskWarnings]);
  const warningCodes = mergedWarnings.map((warning) => warning.code);
  const criticalCount = mergedWarnings.filter((warning) => warning.severity === "critical").length;

  const riskMismatch = riskWarnings.some((warning) => warning.code.startsWith("RISK_ASSUMPTION_MISMATCH"));

  return {
    warnings: mergedWarnings,
    summary: {
      warningsCount: mergedWarnings.length,
      criticalCount,
      warningCodes,
      ...(typeof base.flags.snapshotStaleDays === "number" ? { snapshotStaleDays: base.flags.snapshotStaleDays } : {}),
      flags: {
        ...base.flags,
        riskMismatch,
      },
    },
  };
}
