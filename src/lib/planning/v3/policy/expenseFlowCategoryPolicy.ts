import { type CategoryId } from "../domain/types";

export type ExpenseFlowCategoryPolicy = {
  fixedExpenseCategoryIds: readonly CategoryId[];
};

export const EXPENSE_FLOW_CATEGORY_POLICY: ExpenseFlowCategoryPolicy = {
  fixedExpenseCategoryIds: [
    "fixed",
    "housing",
    "insurance",
    "tax",
    "debt",
  ],
};

const DEFAULT_FIXED_EXPENSE_CATEGORY_ID_SET = new Set<CategoryId>(
  EXPENSE_FLOW_CATEGORY_POLICY.fixedExpenseCategoryIds,
);

function resolveFixedExpenseCategoryIdSet(
  policy: ExpenseFlowCategoryPolicy,
): ReadonlySet<CategoryId> {
  if (policy === EXPENSE_FLOW_CATEGORY_POLICY) {
    return DEFAULT_FIXED_EXPENSE_CATEGORY_ID_SET;
  }
  return new Set<CategoryId>(policy.fixedExpenseCategoryIds);
}

export function isFixedExpenseCategoryId(
  categoryId: CategoryId | null | undefined,
  policy: ExpenseFlowCategoryPolicy = EXPENSE_FLOW_CATEGORY_POLICY,
): boolean {
  if (!categoryId) return false;
  return resolveFixedExpenseCategoryIdSet(policy).has(categoryId);
}

export function resolveExpenseFlowCategory(
  categoryId: CategoryId | null | undefined,
  policy: ExpenseFlowCategoryPolicy = EXPENSE_FLOW_CATEGORY_POLICY,
): "fixed" | "variable" | null {
  if (!categoryId || categoryId === "income" || categoryId === "transfer") return null;
  return isFixedExpenseCategoryId(categoryId, policy) ? "fixed" : "variable";
}
