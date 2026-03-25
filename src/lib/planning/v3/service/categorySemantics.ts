import { type AccountTransaction, type CategoryId, type TxnOverride } from "../domain/types";

const CATEGORY_IDS: CategoryId[] = [
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
];

const CATEGORY_ID_SET = new Set<CategoryId>(CATEGORY_IDS);
function asString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeCategoryId(
  value: unknown,
  options: { allowLegacyIncomeCategory?: boolean } = {},
): CategoryId | null {
  const text = asString(value);
  if (!text) return null;
  if (CATEGORY_ID_SET.has(text as CategoryId)) return text as CategoryId;
  if (options.allowLegacyIncomeCategory && (text === "saving" || text === "invest")) return "etc";
  return null;
}

export function resolveTxnCategoryId(
  value: Pick<AccountTransaction, "kind" | "transfer" | "category" | "categoryId" | "amountKrw">
    | Pick<TxnOverride, "kind" | "category" | "categoryId">,
  options: { allowLegacyIncomeCategory?: boolean } = {},
): CategoryId | null {
  if ("transfer" in value && value.transfer) return "transfer";

  const kind = asString(value.kind);
  if (kind === "transfer") return "transfer";

  const categoryId = normalizeCategoryId(value.categoryId, options);
  if (categoryId) return categoryId;

  const category = normalizeCategoryId(value.category, options);
  if (category) return category;

  if (kind === "income") return "income";
  if ("amountKrw" in value && Number(value.amountKrw) > 0) return "income";
  return null;
}
