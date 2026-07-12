import { type SnapshotSelection } from "@/lib/planning/ui/snapshotSelection";
import { resolveWorkspaceSnapshotSelectionFallback } from "@/lib/planning/ui/workspaceSnapshotSelection";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import {
  parsePlanningRunHorizonMonthsText,
  parsePlanningRunMaxCandidatesPerAction,
  parsePlanningRunMonteCarloPaths,
  parsePlanningRunMonteCarloSeed,
} from "@/lib/planning/v2/planningRunInputContract";
import { type ScenarioPatch } from "@/lib/planning/v2/profilePatch";
import { type PreflightIssue } from "@/lib/planning/v2/preflight";
import { type PlanningRunRecord } from "@/lib/planning/store/types";

export type ParsedRunInputs = {
  profile: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  horizon: number;
  snapshotId?: string;
  policyId: AllocationPolicyId;
  monteCarlo: { paths: number; seed: number };
  actions: { includeProducts: boolean; maxCandidatesPerAction: number };
  debt: {
    offers: unknown[];
    options: {
      extraPaymentKrw?: number;
    };
  };
};

export type BaselineRunOption = {
  id: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
};

export type RunInputScenario = NonNullable<PlanningRunRecord["input"]["scenario"]>;

export type ScenarioTemplateId =
  | "NONE"
  | "REDUCE_DISCRETIONARY_10"
  | "REDUCE_DISCRETIONARY_20"
  | "INCOME_PLUS_5";

export const SCENARIO_TEMPLATE_LABELS: Record<ScenarioTemplateId, string> = {
  NONE: "없음",
  REDUCE_DISCRETIONARY_10: "선택지출 -10%",
  REDUCE_DISCRETIONARY_20: "선택지출 -20%",
  INCOME_PLUS_5: "월수입 +5%",
};

export type CurrentProfileHashState = {
  input: string;
  hash: string;
};

export function parseJsonText<T = unknown>(label: string, text: string): { value: T | null; error: string } {
  try {
    return { value: JSON.parse(text) as T, error: "" };
  } catch {
    return { value: null, error: `${label} JSON 파싱에 실패했습니다.` };
  }
}

export function createScenarioPatchesFromTemplate(templateId: ScenarioTemplateId): ScenarioPatch[] {
  if (templateId === "NONE") {
    return [];
  }
  if (templateId === "REDUCE_DISCRETIONARY_10") {
    return [{ op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.9 }];
  }
  if (templateId === "REDUCE_DISCRETIONARY_20") {
    return [{ op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.8 }];
  }
  return [{ op: "mul", field: "monthlyIncomeNet", value: 1.05 }];
}

export function parseHorizonMonths(value: string): number | null {
  return parsePlanningRunHorizonMonthsText(value);
}

export function parseMaxCandidatesPerAction(value: string): number | null {
  return parsePlanningRunMaxCandidatesPerAction(value);
}

export function parseMonteCarloPaths(value: string): number | null {
  return parsePlanningRunMonteCarloPaths(value);
}

export function parseMonteCarloSeed(value: string): number | null {
  return parsePlanningRunMonteCarloSeed(value);
}

export function formatPreflightIssue(issue: PreflightIssue): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.message} (${issue.fixHint})`;
  }
  return issue.message;
}

export function formatRunOverallStatusKo(status: PlanningRunRecord["overallStatus"] | undefined): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

export function selectPreferredBaselineRunId(
  rows: BaselineRunOption[],
  previousId = "",
): string {
  if (previousId && rows.some((run) => run.id === previousId)) return previousId;
  return rows.find((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")?.id ?? "";
}

export function resolveRunStatusReviewRequired(input: {
  profileSyncState: string;
  savedRun: PlanningRunRecord | null;
  selectedProfileId: string;
  currentProfileHashInput: string;
  currentProfileHashState: CurrentProfileHashState;
}): boolean {
  if (input.profileSyncState !== "saved" || !input.savedRun?.id || !input.selectedProfileId) return false;
  if (input.savedRun.profileId !== input.selectedProfileId) return false;
  if (!input.savedRun.reproducibility?.profileHash) return true;
  if (!input.currentProfileHashInput) return true;
  if (input.currentProfileHashState.input !== input.currentProfileHashInput) return true;
  return !input.currentProfileHashState.hash;
}

export function resolveRunMatchesCurrentProfile(input: {
  runStatusReviewRequired: boolean;
  profileSyncState: string;
  savedRun: PlanningRunRecord | null;
  selectedProfileId: string;
  currentProfileHash: string;
}): boolean {
  if (input.runStatusReviewRequired) return false;
  if (input.profileSyncState !== "saved" || !input.savedRun?.id || !input.selectedProfileId || !input.currentProfileHash) {
    return false;
  }
  return input.savedRun.profileId === input.selectedProfileId
    && input.savedRun.reproducibility?.profileHash === input.currentProfileHash;
}

export function resolveWorkspaceRuntimeSnapshotFallback(code: unknown): SnapshotSelection | null {
  return resolveWorkspaceSnapshotSelectionFallback(code);
}

export function buildPlanningRunInput(input: {
  parsed: ParsedRunInputs;
  effectiveRunScenariosEnabled: boolean;
  effectiveRunActionsEnabled: boolean;
  effectiveRunDebtEnabled: boolean;
  effectiveRunMonteCarloEnabled: boolean;
  scenario?: RunInputScenario;
}): Record<string, unknown> {
  return {
    horizonMonths: input.parsed.horizon,
    policyId: input.parsed.policyId,
    assumptionsOverride: input.parsed.assumptions,
    runScenarios: input.effectiveRunScenariosEnabled,
    getActions: input.effectiveRunActionsEnabled,
    analyzeDebt: input.effectiveRunDebtEnabled,
    includeProducts: input.effectiveRunActionsEnabled ? input.parsed.actions.includeProducts : false,
    ...(input.parsed.snapshotId ? { snapshotId: input.parsed.snapshotId } : {}),
    ...(input.effectiveRunMonteCarloEnabled ? { monteCarlo: input.parsed.monteCarlo } : {}),
    ...(input.effectiveRunDebtEnabled ? {
      debtStrategy: {
        offers: input.parsed.debt.offers,
        options: input.parsed.debt.options,
      },
    } : {}),
    ...(input.scenario ? { scenario: input.scenario } : {}),
  };
}
