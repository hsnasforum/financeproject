import { type PlanningRunRecord } from "../../store/types";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function warningSet(run: PlanningRunRecord): Set<string> {
  return new Set(
    asArray(run.outputs.simulate?.warnings)
      .map((item) => String(item)),
  );
}

function healthWarningSet(run: PlanningRunRecord): Set<string> {
  return new Set(
    (run.meta.health?.warningsCodes ?? []).map((item) => String(item)),
  );
}

function goalsAchievedCount(run: PlanningRunRecord): number {
  return asArray(run.outputs.simulate?.goalsStatus)
    .map((item) => asRecord(item))
    .filter((goal) => goal.achieved === true)
    .length;
}

export type RunDiffSummary = {
  keyMetrics: {
    endNetWorthDeltaKrw: number;
    worstCashDeltaKrw: number;
    goalsAchievedDelta: number;
  };
  warningsDelta: {
    added: string[];
    removed: string[];
  };
  healthWarningsDelta: {
    added: string[];
    removed: string[];
  };
};

export function diffRuns(base: PlanningRunRecord, other: PlanningRunRecord): RunDiffSummary {
  const baseSummary = asRecord(base.outputs.simulate?.summary);
  const otherSummary = asRecord(other.outputs.simulate?.summary);

  const baseWarnings = warningSet(base);
  const otherWarnings = warningSet(other);
  const addedWarnings = [...otherWarnings].filter((code) => !baseWarnings.has(code));
  const removedWarnings = [...baseWarnings].filter((code) => !otherWarnings.has(code));

  const baseHealthWarnings = healthWarningSet(base);
  const otherHealthWarnings = healthWarningSet(other);
  const addedHealthWarnings = [...otherHealthWarnings].filter((code) => !baseHealthWarnings.has(code));
  const removedHealthWarnings = [...baseHealthWarnings].filter((code) => !otherHealthWarnings.has(code));

  const endNetWorthBase = typeof baseSummary.endNetWorthKrw === "number" ? baseSummary.endNetWorthKrw : 0;
  const endNetWorthOther = typeof otherSummary.endNetWorthKrw === "number" ? otherSummary.endNetWorthKrw : 0;
  const worstCashBase = typeof baseSummary.worstCashKrw === "number" ? baseSummary.worstCashKrw : 0;
  const worstCashOther = typeof otherSummary.worstCashKrw === "number" ? otherSummary.worstCashKrw : 0;

  return {
    keyMetrics: {
      endNetWorthDeltaKrw: endNetWorthOther - endNetWorthBase,
      worstCashDeltaKrw: worstCashOther - worstCashBase,
      goalsAchievedDelta: goalsAchievedCount(other) - goalsAchievedCount(base),
    },
    warningsDelta: {
      added: addedWarnings,
      removed: removedWarnings,
    },
    healthWarningsDelta: {
      added: addedHealthWarnings,
      removed: removedHealthWarnings,
    },
  };
}
