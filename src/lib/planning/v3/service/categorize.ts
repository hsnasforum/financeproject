import {
  type AccountTransaction,
  type CategorizedTransaction,
  type TransactionCategory,
} from "../domain/types";
import { classifyTransactions } from "./classify";

function toLegacyCategory(tx: AccountTransaction): TransactionCategory {
  if (tx.kind === "transfer") return "transfer";
  if (tx.category === "fixed") return "fixed";
  if (tx.category === "variable") return "variable";
  if (tx.kind === "income") return "income";
  return "unknown";
}

export function categorizeTransaction(tx: AccountTransaction): CategorizedTransaction {
  const classified = classifyTransactions({ transactions: [tx] })[0] ?? tx;
  return {
    ...classified,
    category: toLegacyCategory(classified),
    categoryReason: classified.classificationReason,
    ...(classified.matchedRuleId ? { matchedRuleId: classified.matchedRuleId } : {}),
  };
}

export function categorizeTransactions(transactions: AccountTransaction[]): CategorizedTransaction[] {
  const classified = classifyTransactions({ transactions });
  return classified.map((tx) => ({
    ...tx,
    category: toLegacyCategory(tx),
    categoryReason: tx.classificationReason,
    ...(tx.matchedRuleId ? { matchedRuleId: tx.matchedRuleId } : {}),
  }));
}
