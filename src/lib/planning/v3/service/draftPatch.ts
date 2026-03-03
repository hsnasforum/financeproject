import { type DraftSplitMode, type MonthlyCashflow, type ProfileV2DraftPatch } from "../domain/types";
import {
  buildDraftPatchFromCashflow,
  type BuildDraftPatchFromCashflowOptions,
} from "./buildDraftPatchFromCashflow";

function assumptionsFromEvidence(
  splitMode: DraftSplitMode,
  fixedRatio: number | undefined,
  variableRatio: number | undefined,
): string[] {
  const splitAssumption = splitMode === "byRatio"
    ? `split mode byRatio (fixed=${Math.round((fixedRatio ?? 0) * 100)}%, variable=${Math.round((variableRatio ?? 0) * 100)}%)`
    : splitMode === "noSplit"
      ? "split mode noSplit (total spend is discretionary)"
      : "split mode byCategory (rule-based categorization)";
  return [
    "monthlyIncomeNet uses median recent inflow (assumption)",
    splitAssumption,
  ];
}

export function buildProfileV2DraftPatch(
  cashflows: MonthlyCashflow[],
  options: BuildDraftPatchFromCashflowOptions = {},
): ProfileV2DraftPatch {
  const built = buildDraftPatchFromCashflow(cashflows, options);

  return {
    monthlyIncomeNet: built.profilePatch.monthlyIncomeNet,
    monthlyEssentialExpenses: built.profilePatch.monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses: built.profilePatch.monthlyDiscretionaryExpenses,
    assumptions: assumptionsFromEvidence(
      built.draftPatch.splitMode,
      built.draftPatch.fixedRatio,
      built.draftPatch.variableRatio,
    ),
    monthsConsidered: cashflows.length,
  };
}

export function buildProfileDraftPatchFromCashflow(
  cashflows: MonthlyCashflow[],
  options: BuildDraftPatchFromCashflowOptions = {},
): ProfileV2DraftPatch {
  return buildProfileV2DraftPatch(cashflows, options);
}
