import { REPORT_SECTION_IDS, RUN_SECTION_IDS, toHashHref } from "../../navigation/sectionIds";

export type ActionLinkContext = {
  runId?: string;
};

export function resolveInterpretationActionHref(actionId: string, context: ActionLinkContext = {}): string | undefined {
  const normalized = typeof actionId === "string" ? actionId.trim().toUpperCase() : "";
  if (!normalized) return undefined;

  if (normalized === "SET_ASSUMPTIONS_REVIEW") return "/ops/assumptions";
  if (normalized === "OPEN_CANDIDATE_COMPARISON") return toHashHref(REPORT_SECTION_IDS.candidates);
  if (normalized === "REDUCE_DEBT_SERVICE") return toHashHref(REPORT_SECTION_IDS.warnings);
  if (normalized === "MANAGE_ACTION_CENTER") {
    const runQuery = context.runId ? `?runId=${encodeURIComponent(context.runId)}` : "";
    return `/planning/runs${runQuery}${toHashHref(RUN_SECTION_IDS.actionCenter)}`;
  }

  if (
    normalized === "BUILD_EMERGENCY_FUND"
    || normalized === "FIX_NEGATIVE_CASHFLOW"
    || normalized === "COVER_LUMP_SUM_GOAL"
    || normalized === "IMPROVE_RETIREMENT_PLAN"
    || normalized === "INPUT_REVIEW"
  ) {
    return toHashHref(REPORT_SECTION_IDS.evidence);
  }

  return undefined;
}
