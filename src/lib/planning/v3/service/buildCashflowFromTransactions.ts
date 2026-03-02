import {
  type AccountTransaction,
  type MonthlyCashflow,
  type ProfileDraftPatch,
} from "../domain/types";
import { aggregateMonthlyCashflow } from "./aggregate";
import { buildProfileDraftPatchFromCashflow } from "./draftPatch";

// Backward-compatible names used by existing scripts/tests.
export function buildCashflowFromTransactions(transactions: AccountTransaction[]): MonthlyCashflow[] {
  return aggregateMonthlyCashflow(transactions);
}

// Backward-compatible alias.
export function buildProfileDraftFromCashflow(cashflow: MonthlyCashflow[]): ProfileDraftPatch {
  return buildProfileDraftPatchFromCashflow(cashflow);
}
