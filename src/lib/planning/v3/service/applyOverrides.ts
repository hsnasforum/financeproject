import { type AccountTransaction, type TxnOverride } from "../domain/types";
import { normalizeCategoryId, resolveTxnCategoryId } from "./categorySemantics";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveLegacyCategory(value: unknown): "saving" | "invest" | null {
  const category = asString(value).toLowerCase();
  if (category === "saving" || category === "invest") return category;
  return null;
}

export function applyTxnOverrides(
  transactions: AccountTransaction[],
  overridesByTxnId: Record<string, TxnOverride>,
): AccountTransaction[] {
  return transactions.map((tx) => {
    const txnId = asString(tx.txnId).toLowerCase();
    if (!txnId) return tx;

    const override = overridesByTxnId[txnId];
    if (!override) return tx;

    const nextKind = override.kind ?? tx.kind;
    const nextCategoryId = resolveTxnCategoryId({
      kind: nextKind,
      categoryId: normalizeCategoryId(override.categoryId) ?? normalizeCategoryId(tx.categoryId) ?? undefined,
      category: override.category ?? tx.category,
    });
    const nextLegacyCategory = resolveLegacyCategory(override.category) ?? resolveLegacyCategory(tx.category);
    const nextCategory = nextCategoryId ?? nextLegacyCategory ?? tx.category;

    return {
      ...tx,
      ...(nextKind ? { kind: nextKind } : {}),
      ...(nextCategory ? { category: nextCategory } : {}),
      ...(nextCategoryId ? { categoryId: nextCategoryId } : {}),
      ...((nextKind && nextKind !== "transfer") ? { transfer: undefined } : {}),
    };
  });
}
