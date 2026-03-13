import { type EngineEnvelope } from "../../engine";
import { type ActionItemV2 } from "../../v2/actions/types";
import { buildResultDtoV1, type ResultDtoV1 } from "../../v2/resultDto";
import { type AllocationPolicyId } from "./policy/types";
import { type TimelineRowV2, type SimulationResultV2 } from "./types";
import { buildEnginePayloadFromProfile } from "./toEngineInput";
import { type ProfileV2 } from "./types";
import { type DebtStrategyResult } from "./debt/types";
import { runScenarios } from "./runScenarios";
import { runMonteCarlo } from "./monteCarlo";

type SnapshotMeta = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing?: boolean;
  warningsCount?: number;
  sourcesCount?: number;
};

type HealthSummary = {
  warningCodes?: string[];
  criticalCount?: number;
  snapshotStaleDays?: number;
};

export type PlanningRunArtifacts = {
  outputs: {
    engineSchemaVersion: number;
    engine: EngineEnvelope;
    simulate: {
      engine: EngineEnvelope;
      summary: ReturnType<typeof summarizePlan>;
      warnings: string[];
      goalsStatus: SimulationResultV2["goalStatus"];
      keyTimelinePoints: Array<{ monthIndex: number; row: TimelineRowV2 }>;
    };
    scenarios?: {
      table: Array<Record<string, unknown>>;
      shortWhyByScenario: Record<string, string[]>;
    };
    monteCarlo?: {
      probabilities: ReturnType<typeof runMonteCarlo>["probabilities"];
      percentiles: ReturnType<typeof runMonteCarlo>["percentiles"];
      notes: ReturnType<typeof runMonteCarlo>["notes"];
    };
    actions?: {
      actions: ActionItemV2[];
    };
    debtStrategy?: {
      summary: {
        debtServiceRatio: number;
        totalMonthlyPaymentKrw: number;
        warningsCount: number;
      };
      warnings: Array<{ code: string; message: string }>;
      summaries: DebtStrategyResult["summaries"];
      refinance?: DebtStrategyResult["refinance"];
      whatIf: DebtStrategyResult["whatIf"];
    };
  };
  resultDto: ResultDtoV1;
};

function pickKeyTimelinePoints(rows: TimelineRowV2[]): Array<{ monthIndex: number; row: TimelineRowV2 }> {
  if (rows.length === 0) return [];
  const candidates = [0, 12, 24, rows.length - 1];
  const seen = new Set<number>();
  const out: Array<{ monthIndex: number; row: TimelineRowV2 }> = [];
  for (const index of candidates) {
    if (index < 0 || index >= rows.length || seen.has(index)) continue;
    seen.add(index);
    out.push({ monthIndex: index, row: rows[index] });
  }
  return out;
}

function summarizePlan(plan: SimulationResultV2) {
  const first = plan.timeline[0];
  const last = plan.timeline[plan.timeline.length - 1];
  const worst = plan.timeline.reduce((min, row) => (row.liquidAssets < min.liquidAssets ? row : min), plan.timeline[0] ?? {
    month: 1,
    liquidAssets: 0,
  });

  return {
    startNetWorthKrw: first?.netWorth ?? 0,
    endNetWorthKrw: last?.netWorth ?? 0,
    netWorthDeltaKrw: (last?.netWorth ?? 0) - (first?.netWorth ?? 0),
    worstCashMonthIndex: Math.max(0, (worst?.month ?? 1) - 1),
    worstCashKrw: worst?.liquidAssets ?? 0,
    goalsAchievedCount: plan.goalStatus.filter((goal) => goal.achieved).length,
    goalsMissedCount: plan.goalStatus.filter((goal) => !goal.achieved).length,
    warningsCount: plan.warnings.length,
  };
}

function summarizeScenarioResult(result: SimulationResultV2) {
  const summary = summarizePlan(result);
  return {
    endNetWorthKrw: summary.endNetWorthKrw,
    worstCashMonthIndex: summary.worstCashMonthIndex,
    worstCashKrw: summary.worstCashKrw,
    goalsAchievedCount: summary.goalsAchievedCount,
    warningsCount: summary.warningsCount,
  };
}

export function buildPlanningRunArtifacts(input: {
  profile: ProfileV2;
  policyId: AllocationPolicyId;
  snapshotMeta: SnapshotMeta;
  healthSummary: HealthSummary;
  simulatePlan: SimulationResultV2;
  scenariosOutput: ReturnType<typeof runScenarios> | null;
  monteCarloOutput: ReturnType<typeof runMonteCarlo> | null;
  actionsOutput: ActionItemV2[] | null;
  debtStrategyOutput: DebtStrategyResult | null;
}): PlanningRunArtifacts {
  const { data: runEnginePayload } = buildEnginePayloadFromProfile(input.profile, () => ({}));
  const runEngine = runEnginePayload.engine;

  const outputs: PlanningRunArtifacts["outputs"] = {
    engineSchemaVersion: runEnginePayload.engineSchemaVersion,
    engine: runEngine,
    simulate: {
      engine: runEngine,
      summary: summarizePlan(input.simulatePlan),
      warnings: input.simulatePlan.warnings.map((warning) => warning.reasonCode),
      goalsStatus: input.simulatePlan.goalStatus,
      keyTimelinePoints: pickKeyTimelinePoints(input.simulatePlan.timeline),
    },
    ...(input.scenariosOutput ? {
      scenarios: {
        table: [
          {
            id: "base",
            title: "Base",
            ...summarizeScenarioResult(input.scenariosOutput.base),
          },
          ...input.scenariosOutput.scenarios.map((entry) => ({
            id: entry.spec.id,
            title: entry.spec.title,
            ...summarizeScenarioResult(entry.result),
            diffVsBase: entry.diffVsBase.keyMetrics,
          })),
        ],
        shortWhyByScenario: Object.fromEntries(
          input.scenariosOutput.scenarios.map((entry) => [entry.spec.id, entry.diffVsBase.shortWhy]),
        ),
      },
    } : {}),
    ...(input.monteCarloOutput ? {
      monteCarlo: {
        probabilities: input.monteCarloOutput.probabilities,
        percentiles: input.monteCarloOutput.percentiles,
        notes: input.monteCarloOutput.notes,
      },
    } : {}),
    ...(Array.isArray(input.actionsOutput) ? {
      actions: {
        actions: input.actionsOutput,
      },
    } : {}),
    ...(input.debtStrategyOutput ? {
      debtStrategy: {
        summary: {
          debtServiceRatio: input.debtStrategyOutput.meta.debtServiceRatio,
          totalMonthlyPaymentKrw: input.debtStrategyOutput.meta.totalMonthlyPaymentKrw,
          warningsCount: input.debtStrategyOutput.warnings.length,
        },
        warnings: input.debtStrategyOutput.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        })),
        summaries: input.debtStrategyOutput.summaries,
        ...(input.debtStrategyOutput.refinance ? { refinance: input.debtStrategyOutput.refinance } : {}),
        whatIf: input.debtStrategyOutput.whatIf,
      },
    } : {}),
  };

  const resultDto = buildResultDtoV1({
    generatedAt: new Date().toISOString(),
    policyId: input.policyId,
    meta: {
      snapshot: input.snapshotMeta,
      health: input.healthSummary,
    },
    simulate: outputs.simulate,
    scenarios: outputs.scenarios,
    monteCarlo: outputs.monteCarlo,
    actions: outputs.actions,
    debt: outputs.debtStrategy,
  });

  return {
    outputs,
    resultDto,
  };
}
