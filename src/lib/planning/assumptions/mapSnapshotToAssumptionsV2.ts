import { type AssumptionsSnapshot } from "./types";
import { roundToDigits } from "../calc";
import { type AssumptionsV2 } from "../v2/scenarios";
import { type SimulationAssumptionsV2 } from "../v2/types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePct(value: number): number {
  return roundToDigits(value, 2);
}

export function mapSnapshotToAssumptionsV2(
  snapshot: AssumptionsSnapshot | null,
): Partial<SimulationAssumptionsV2> {
  if (!snapshot) return {};

  const mapped: Partial<SimulationAssumptionsV2> = {};
  if (isFiniteNumber(snapshot.korea.cpiYoYPct)) {
    mapped.inflation = normalizePct(snapshot.korea.cpiYoYPct);
  }

  return mapped;
}

export type SnapshotScenarioExtrasMapping = {
  extra: Partial<Pick<AssumptionsV2, "cashReturnPct">>;
  warnings: Array<{
    code: string;
    severity: "info" | "warn" | "critical";
    message: string;
    data?: Record<string, unknown>;
  }>;
};

export function mapSnapshotToScenarioExtrasV2(
  snapshot: AssumptionsSnapshot | null,
): SnapshotScenarioExtrasMapping {
  if (!snapshot) {
    return {
      extra: {},
      warnings: [],
    };
  }

  if (isFiniteNumber(snapshot.korea.newDepositAvgPct)) {
    return {
      extra: { cashReturnPct: normalizePct(snapshot.korea.newDepositAvgPct) },
      warnings: [],
    };
  }

  if (isFiniteNumber(snapshot.korea.cd91Pct)) {
    const proxyCashReturnPct = Math.max(0, normalizePct(snapshot.korea.cd91Pct - 0.5));
    return {
      extra: { cashReturnPct: proxyCashReturnPct },
      warnings: [{
        code: "CASH_RETURN_PROXY_FROM_CD",
        severity: "info",
        message: "예금 평균금리가 없어 CD(91일)-0.5%p를 현금수익률 프록시로 사용했습니다.",
        data: {
          cd91Pct: normalizePct(snapshot.korea.cd91Pct),
          proxyCashReturnPct,
        },
      }],
    };
  }

  return {
    extra: {},
    warnings: [],
  };
}
