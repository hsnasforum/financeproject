import { type CategoryId, type CategoryRule, type CategorizedTransactionRow } from "../domain/types";
import { type StoredTransaction } from "../domain/transactions";
import { type TxnOverride } from "../domain/types";

type CategorizeTransactionsInput = {
  transactions: StoredTransaction[];
  rules: CategoryRule[];
  overridesByTxnId: Record<string, TxnOverride>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown): string {
  return asString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sortRules(rules: CategoryRule[]): CategoryRule[] {
  return [...rules]
    .filter((rule) => rule.enabled)
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.id.localeCompare(right.id);
    });
}

function toCategoryId(value: unknown): CategoryId | null {
  const text = asString(value).toLowerCase();
  const allowed: CategoryId[] = [
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
  if ((allowed as string[]).includes(text)) return text as CategoryId;
  if (text === "saving" || text === "invest") return "etc";
  return null;
}

function pickRuleCategory(description: string, rules: CategoryRule[]): CategoryId | null {
  for (const rule of rules) {
    if (!rule.enabled || rule.match.type !== "contains") continue;
    const needle = normalizeText(rule.match.value);
    if (!needle) continue;
    if (description.includes(needle)) {
      return rule.categoryId;
    }
  }
  return null;
}

function pickDefaultCategory(tx: StoredTransaction): CategoryId {
  if (tx.transfer || tx.kind === "transfer") return "transfer";
  if (tx.amountKrw > 0) return "income";
  return "unknown";
}

export function categorizeTransactions(input: CategorizeTransactionsInput): CategorizedTransactionRow[] {
  const rules = sortRules(input.rules);
  return input.transactions.map((tx) => {
    if (tx.transfer || tx.kind === "transfer") {
      return {
        ...tx,
        categoryId: "transfer",
        category: "transfer",
        categorySource: "transfer",
      };
    }

    const txnId = asString(tx.txnId).toLowerCase();
    const override = txnId ? input.overridesByTxnId[txnId] : undefined;
    const overrideCategory = toCategoryId(override?.categoryId ?? override?.category);
    const description = normalizeText(tx.description);

    if (overrideCategory) {
      return {
        ...tx,
        categoryId: overrideCategory,
        category: overrideCategory,
        categorySource: "override",
      };
    }

    const ruleCategory = pickRuleCategory(description, rules);
    if (ruleCategory) {
      return {
        ...tx,
        categoryId: ruleCategory,
        category: ruleCategory,
        categorySource: "rule",
      };
    }

    const fallback = pickDefaultCategory(tx);
    return {
      ...tx,
      categoryId: fallback,
      category: fallback,
      categorySource: "default",
    };
  });
}
