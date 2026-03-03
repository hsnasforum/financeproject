import { type AccountTransaction, type MonthlyCashflow, type TxnOverride } from "../domain/types";
import { aggregateMonthlyCashflow as aggregateMonthlyCashflowV2 } from "./aggregateMonthlyCashflow";

// Backward-compatible wrapper used by legacy v3 scripts/tests.
export function aggregateMonthlyCashflow(
  transactions: AccountTransaction[],
  options?: {
    includeTransfers?: boolean;
    overridesByTxnId?: Record<string, TxnOverride>;
  },
): MonthlyCashflow[] {
  return aggregateMonthlyCashflowV2(transactions, options);
}
