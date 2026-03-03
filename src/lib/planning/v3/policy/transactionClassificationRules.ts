export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionCategory = "fixed" | "variable" | "saving" | "invest" | "unknown";

export type TransactionCategoryRule = {
  id: string;
  priority: number;
  applyTo: "income" | "expense" | "any";
  category: Exclude<TransactionCategory, "unknown">;
  keywords: readonly string[];
};

export const TRANSACTION_CATEGORY_RULES: readonly TransactionCategoryRule[] = [
  {
    id: "expense-fixed-housing-bills",
    priority: 10,
    applyTo: "expense",
    category: "fixed",
    keywords: [
      "월세",
      "임대",
      "렌트",
      "관리비",
      "보험",
      "통신",
      "구독",
      "rent",
      "insurance",
      "telecom",
      "subscription",
      "loan",
      "interest",
    ],
  },
  {
    id: "expense-variable-daily",
    priority: 20,
    applyTo: "expense",
    category: "variable",
    keywords: [
      "편의점",
      "마트",
      "배달",
      "카페",
      "식비",
      "교통",
      "주유",
      "의료",
      "grocery",
      "food",
      "cafe",
      "transport",
      "fuel",
      "medical",
    ],
  },
  {
    id: "income-saving",
    priority: 30,
    applyTo: "income",
    category: "saving",
    keywords: [
      "적금",
      "예금",
      "savings",
      "saving",
      "deposit",
    ],
  },
  {
    id: "income-invest",
    priority: 40,
    applyTo: "income",
    category: "invest",
    keywords: [
      "배당",
      "투자",
      "주식",
      "펀드",
      "etf",
      "dividend",
      "investment",
    ],
  },
] as const;
