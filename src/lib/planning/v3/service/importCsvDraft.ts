import {
  parseCsvTransactions,
  type ParseCsvTransactionsOptions,
  type ParseCsvTransactionsResult,
} from "../providers/csv/csvProvider";
import { aggregateMonthlyCashflow } from "./aggregate";
import { buildProfileDraftPatchFromCashflow } from "./draftPatch";
import { type MonthlyCashflow, type ProfileDraftPatch } from "../domain/types";

export type ImportCsvToDraftResult = {
  parsed: ParseCsvTransactionsResult;
  cashflows: MonthlyCashflow[];
  draft: ProfileDraftPatch;
};

export function importCsvToDraft(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ImportCsvToDraftResult {
  const parsed = parseCsvTransactions(csvText, options);
  const cashflows = aggregateMonthlyCashflow(parsed.transactions);
  const draft = buildProfileDraftPatchFromCashflow(cashflows);
  return { parsed, cashflows, draft };
}
