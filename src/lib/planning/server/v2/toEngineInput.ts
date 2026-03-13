import {
  attachEngineResponse,
  runPlanningEngine,
  type EngineResult,
  type EngineRunner,
} from "../../engine";
import { toPlanningError, type PlanningErrorCode } from "./errors";
import { type RiskTolerance } from "./scenarios";
import { createPlanningService } from "./service";
import { type ProfileV2 } from "./types";

type PlanningServiceLike = Pick<ReturnType<typeof createPlanningService>, "resolveAssumptionsContext">;

export type PlanningAssumptionsContext = Awaited<ReturnType<PlanningServiceLike["resolveAssumptionsContext"]>>;

export type PlanningAssumptionsContextResult =
  | {
    ok: true;
    context: PlanningAssumptionsContext;
  }
  | {
    ok: false;
    error: {
      code: PlanningErrorCode;
      message: string;
      status: number;
    };
  };

export function toEngineInputFromProfile(profile: ProfileV2) {
  const debtBalance = profile.debts.reduce((total, debt) => {
    return total + (Number.isFinite(debt.balance) ? debt.balance : 0);
  }, 0);

  return {
    monthlyIncome: profile.monthlyIncomeNet,
    monthlyExpense: profile.monthlyEssentialExpenses + profile.monthlyDiscretionaryExpenses,
    age: profile.currentAge,
    liquidAssets: profile.liquidAssets,
    debtBalance,
  };
}

export function runPlanningEngineFromProfile<TCore = null>(
  profile: ProfileV2,
  runner?: EngineRunner<TCore>,
) {
  return runPlanningEngine(toEngineInputFromProfile(profile), runner);
}

export function buildEnginePayloadFromProfile<TData extends Record<string, unknown>, TCore = null>(
  profile: ProfileV2,
  buildData: (engineResult: EngineResult<TCore | null>) => TData,
  runner?: EngineRunner<TCore>,
) {
  const engineResult = runPlanningEngineFromProfile(profile, runner);
  return {
    engineResult,
    data: attachEngineResponse(engineResult, buildData(engineResult)),
  };
}

export async function resolveAssumptionsContextForProfile(input: {
  planningService: PlanningServiceLike;
  profile: ProfileV2;
  riskTolerance: RiskTolerance;
  assumptionsOverridesRaw: Record<string, unknown>;
  requestedSnapshotId?: string;
}): Promise<PlanningAssumptionsContextResult> {
  try {
    const context = await input.planningService.resolveAssumptionsContext({
      profile: input.profile,
      riskTolerance: input.riskTolerance,
      assumptionsOverridesRaw: input.assumptionsOverridesRaw,
      requestedSnapshotId: input.requestedSnapshotId,
    });
    return { ok: true, context };
  } catch (error) {
    const normalized = toPlanningError(error);
    return {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        status: normalized.code === "SNAPSHOT_NOT_FOUND" ? 400 : 500,
      },
    };
  }
}
