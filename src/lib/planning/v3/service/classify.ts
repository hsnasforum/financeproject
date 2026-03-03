import { type Account, type AccountTransaction } from "../domain/types";
import {
  TRANSACTION_CATEGORY_RULES,
  type TransactionCategoryRule,
} from "../policy/transactionClassificationRules";
import { detectTransfers } from "./transferDetect";

type TransactionKind = "income" | "expense" | "transfer";
type TransactionCategory = "fixed" | "variable" | "saving" | "invest" | "unknown";

export type ClassifyTransactionsInput = {
  transactions: AccountTransaction[];
  accounts?: Account[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown): string {
  return asString(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function inferKind(amountKrw: number): Exclude<TransactionKind, "transfer"> {
  return amountKrw > 0 ? "income" : "expense";
}

function sortedRules(): TransactionCategoryRule[] {
  return [...TRANSACTION_CATEGORY_RULES].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.id.localeCompare(right.id);
  });
}

function pickCategoryRule(
  kind: Exclude<TransactionKind, "transfer">,
  descNormalized: string,
): { rule: TransactionCategoryRule; keyword: string } | null {
  const rules = sortedRules();
  for (const rule of rules) {
    if (rule.applyTo !== "any" && rule.applyTo !== kind) continue;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      if (descNormalized.includes(normalizedKeyword)) {
        return { rule, keyword: normalizedKeyword };
      }
    }
  }
  return null;
}

export function classifyCategoryFromDescription(input: {
  kind: Exclude<TransactionKind, "transfer">;
  description?: string;
}): { category: TransactionCategory; matchedRuleId?: string; reason: string } {
  const normalized = normalizeText(input.description);
  if (!normalized) {
    return {
      category: "unknown",
      reason: "rule:category-unknown",
    };
  }

  const matched = pickCategoryRule(input.kind, normalized);
  if (!matched) {
    return {
      category: "unknown",
      reason: "rule:category-unknown",
    };
  }

  return {
    category: matched.rule.category,
    matchedRuleId: matched.rule.id,
    reason: `rule:${matched.rule.id};keyword:${matched.keyword}`,
  };
}

export function classifyTransactions(input: ClassifyTransactionsInput): AccountTransaction[] {
  const transferDetected = detectTransfers({
    transactions: input.transactions,
    ...(input.accounts ? { accounts: input.accounts } : {}),
  }).transactions;

  return transferDetected.map((row) => {
    if (row.kind === "transfer") {
      return {
        ...row,
        kind: "transfer",
        category: "unknown",
      };
    }

    const kind = inferKind(row.amountKrw);
    const categorized = classifyCategoryFromDescription({
      kind,
      description: row.description,
    });

    return {
      ...row,
      kind,
      category: categorized.category,
      classificationReason: categorized.reason,
      ...(categorized.matchedRuleId ? { matchedRuleId: categorized.matchedRuleId } : {}),
    };
  });
}
