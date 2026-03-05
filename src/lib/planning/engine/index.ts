import { buildStageDecision } from "./stageDecision";
import { determineFinancialStatus } from "./financialStatus";
import type { EngineContext, EngineInput, EngineResult } from "./types";
import { validateEngineInput } from "./validateInput";

export type {
  EngineEnvelope,
  EngineContext,
  EngineInput,
  EngineResult,
  FinancialStatus,
  Stage,
  StageDecision,
} from "./types";
export {
  getPlanningFallbackUsageSnapshot,
  recordPlanningFallbackUsage,
  resetPlanningFallbackUsageSnapshot,
  type PlanningFallbackUsageSnapshot,
} from "./fallbackUsage";

export const ENGINE_SCHEMA_VERSION = 1 as const;

export interface EngineRunner<TCore> {
  runCore: (input: EngineInput, context: EngineContext) => TCore;
}

export function createEngineEnvelope(context: Pick<EngineContext, "status" | "decision">) {
  return {
    stage: context.status.stage,
    financialStatus: context.status,
    stageDecision: context.decision,
  };
}

export function runPlanningEngine<TCore = null>(
  rawInput: EngineInput,
  runner?: EngineRunner<TCore>,
): EngineResult<TCore | null> {
  const input = validateEngineInput(rawInput);
  const status = determineFinancialStatus(input);
  const decision = buildStageDecision(status);

  const context: EngineContext = {
    status,
    decision,
  };

  const core = runner ? runner.runCore(input, context) : null;

  return {
    input,
    status,
    decision,
    core,
    generatedAt: new Date().toISOString(),
  };
}
