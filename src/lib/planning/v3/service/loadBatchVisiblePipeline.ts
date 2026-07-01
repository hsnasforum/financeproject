import { type StoredTransaction } from "../domain/transactions";
import {
  type AccountMappingOverride,
  type CategoryRule,
  type TxnOverride,
  type TxnTransferOverride,
} from "../domain/types";
import { getAccountMappingOverrides } from "../store/accountMappingOverridesStore";
import { listRules } from "../store/categoryRulesStore";
import { getBatchTxnOverrides } from "../store/txnOverridesStore";
import { getTransferOverrides } from "../store/txnTransferOverridesStore";
import {
  loadStoredFirstBatchTransactions,
  type StoredFirstBatchReadResult,
} from "../transactions/store";
import { getStoredFirstBatchSummaryProjectionRows } from "./storedFirstVisibleRows";
import { isUserFacingStoredBatchRead } from "./userFacingBatchReadPolicy";

export type BatchVisiblePipeline = {
  loaded: StoredFirstBatchReadResult;
  transactions: StoredTransaction[];
  rules: CategoryRule[];
  overridesByTxnId: Record<string, TxnOverride>;
  accountOverrides: Record<string, AccountMappingOverride>;
  transferOverrides: Record<string, TxnTransferOverride>;
};

export type LoadBatchVisiblePipelineOptions = {
  includeRules?: boolean;
};

export async function loadBatchVisiblePipeline(
  batchId: string,
  options: LoadBatchVisiblePipelineOptions = {},
): Promise<BatchVisiblePipeline | null> {
  const loaded = await loadStoredFirstBatchTransactions(batchId);
  if (!isUserFacingStoredBatchRead(loaded)) return null;

  const rulesPromise = options.includeRules === false
    ? Promise.resolve([] satisfies CategoryRule[])
    : listRules();
  const [rules, overridesByTxnId, accountOverrides, transferOverrides] = await Promise.all([
    rulesPromise,
    getBatchTxnOverrides(batchId).catch(() => ({})),
    getAccountMappingOverrides(batchId).catch(() => ({})),
    getTransferOverrides(batchId).catch(() => ({})),
  ]);

  return {
    loaded,
    // Summary and draft generation expose derived projections, not raw stored rows.
    transactions: getStoredFirstBatchSummaryProjectionRows(loaded),
    rules,
    overridesByTxnId,
    accountOverrides,
    transferOverrides,
  };
}
