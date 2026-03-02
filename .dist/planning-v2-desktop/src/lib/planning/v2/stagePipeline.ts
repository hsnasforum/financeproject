import {
  type PlanningRunOverallStatus,
  type PlanningRunStageId,
  type PlanningRunStageReason,
  type PlanningRunStageResult,
} from "../store/types";

export const PLANNING_STAGE_ORDER: PlanningRunStageId[] = [
  "simulate",
  "scenarios",
  "monteCarlo",
  "actions",
  "debt",
];

export type StageRunner<T = unknown> = {
  enabled?: boolean;
  preSkipped?: {
    reason: PlanningRunStageReason;
    message?: string;
  };
  run: () => Promise<T> | T;
  outputRefKey?: string;
};

export type StagePipelineInput = {
  simulate: StageRunner;
  scenarios: StageRunner;
  monteCarlo: StageRunner;
  actions: StageRunner;
  debt: StageRunner;
  nowMs?: () => number;
};

export type StagePipelineOutput = {
  overallStatus: PlanningRunOverallStatus;
  stages: PlanningRunStageResult[];
  outputs: Partial<Record<PlanningRunStageId, unknown>>;
};

type StageStatus = PlanningRunStageResult["status"];

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function durationMs(startedAt?: string, endedAt?: string): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
  return Math.max(0, Math.trunc(endMs - startMs));
}

function computeOverallStatus(stages: PlanningRunStageResult[]): PlanningRunOverallStatus {
  const simulate = stages.find((stage) => stage.id === "simulate");
  if (simulate?.status === "FAILED") return "FAILED";

  const hasPipelineIssue = stages.some((stage) => {
    if (stage.status === "FAILED") return true;
    if (stage.status !== "SKIPPED") return false;
    return stage.reason === "PREREQ_FAILED" || stage.reason === "BUDGET_EXCEEDED" || stage.reason === "STAGE_ERROR";
  });
  if (hasPipelineIssue) return "PARTIAL_SUCCESS";
  return "SUCCESS";
}

function stageById(stages: PlanningRunStageResult[], id: PlanningRunStageId): PlanningRunStageResult {
  const found = stages.find((stage) => stage.id === id);
  if (!found) {
    throw new Error(`stage not found: ${id}`);
  }
  return found;
}

function markStage(
  stages: PlanningRunStageResult[],
  id: PlanningRunStageId,
  status: StageStatus,
  nowMs: number,
  patch?: Partial<PlanningRunStageResult>,
) {
  const current = stageById(stages, id);
  const startedAt = status === "RUNNING"
    ? isoFromMs(nowMs)
    : current.startedAt ?? isoFromMs(nowMs);
  const endedAt = status === "RUNNING" || status === "PENDING"
    ? undefined
    : isoFromMs(nowMs);

  const next: PlanningRunStageResult = {
    ...current,
    status,
    startedAt,
    ...(endedAt ? { endedAt } : {}),
    ...(patch?.reason ? { reason: patch.reason } : {}),
    ...(patch?.errorSummary ? { errorSummary: patch.errorSummary } : {}),
    ...(patch?.outputRef ? { outputRef: patch.outputRef } : {}),
  };
  const duration = durationMs(next.startedAt, next.endedAt);
  if (typeof duration === "number") {
    next.durationMs = duration;
  } else {
    delete next.durationMs;
  }

  const index = stages.findIndex((stage) => stage.id === id);
  stages[index] = next;
}

function skipRemainingAfter(stages: PlanningRunStageResult[], failedId: PlanningRunStageId, now: () => number) {
  const failedIndex = PLANNING_STAGE_ORDER.indexOf(failedId);
  for (const id of PLANNING_STAGE_ORDER.slice(failedIndex + 1)) {
    const row = stageById(stages, id);
    if (row.status !== "PENDING") continue;
    markStage(stages, id, "SKIPPED", now(), {
      reason: "PREREQ_FAILED",
      errorSummary: "simulate 단계 실패로 실행하지 않음",
    });
  }
}

function initialStages(now: () => number): PlanningRunStageResult[] {
  const createdAt = isoFromMs(now());
  return PLANNING_STAGE_ORDER.map((id) => ({
    id,
    status: "PENDING",
    startedAt: createdAt,
  }));
}

async function runOptionalStage(
  id: Exclude<PlanningRunStageId, "simulate">,
  runner: StageRunner,
  stages: PlanningRunStageResult[],
  outputs: Partial<Record<PlanningRunStageId, unknown>>,
  now: () => number,
): Promise<void> {
  if (runner.enabled === false) {
    markStage(stages, id, "SKIPPED", now(), {
      reason: "OPTION_DISABLED",
      errorSummary: "옵션 비활성",
    });
    return;
  }
  if (runner.preSkipped) {
    markStage(stages, id, "SKIPPED", now(), {
      reason: runner.preSkipped.reason,
      errorSummary: runner.preSkipped.message || runner.preSkipped.reason,
    });
    return;
  }

  markStage(stages, id, "RUNNING", now());
  try {
    const value = await runner.run();
    outputs[id] = value;
    markStage(stages, id, "SUCCESS", now(), {
      outputRef: {
        key: runner.outputRefKey || `outputs.${id}`,
        hasData: value !== undefined && value !== null,
      },
    });
  } catch (error) {
    markStage(stages, id, "FAILED", now(), {
      reason: "STAGE_ERROR",
      errorSummary: error instanceof Error ? error.message : `${id} 단계 실행 실패`,
    });
  }
}

export async function runStagePipeline(input: StagePipelineInput): Promise<StagePipelineOutput> {
  const now = input.nowMs ?? (() => Date.now());
  const stages = initialStages(now);
  const outputs: Partial<Record<PlanningRunStageId, unknown>> = {};

  markStage(stages, "simulate", "RUNNING", now());
  try {
    const simulate = await input.simulate.run();
    outputs.simulate = simulate;
    markStage(stages, "simulate", "SUCCESS", now(), {
      outputRef: {
        key: input.simulate.outputRefKey || "outputs.simulate",
        hasData: simulate !== undefined && simulate !== null,
      },
    });
  } catch (error) {
    markStage(stages, "simulate", "FAILED", now(), {
      reason: "STAGE_ERROR",
      errorSummary: error instanceof Error ? error.message : "simulate 단계 실행 실패",
    });
    skipRemainingAfter(stages, "simulate", now);
    return {
      overallStatus: "FAILED",
      stages,
      outputs,
    };
  }

  await runOptionalStage("scenarios", input.scenarios, stages, outputs, now);
  await runOptionalStage("monteCarlo", input.monteCarlo, stages, outputs, now);
  await runOptionalStage("actions", input.actions, stages, outputs, now);
  await runOptionalStage("debt", input.debt, stages, outputs, now);

  return {
    overallStatus: computeOverallStatus(stages),
    stages,
    outputs,
  };
}
