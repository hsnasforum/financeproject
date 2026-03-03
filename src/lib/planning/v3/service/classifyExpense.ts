const FIXED_KEYWORDS = [
  "월세",
  "관리비",
  "보험",
  "통신",
  "정기",
  "렌트",
  "대출",
  "이자",
  "구독",
  "rent",
  "insurance",
  "telecom",
  "subscription",
  "loan",
  "interest",
] as const;

const VARIABLE_HINTS = [
  "식비",
  "마트",
  "교통",
  "카페",
  "쇼핑",
  "외식",
  "food",
  "grocery",
  "transport",
  "cafe",
  "shopping",
] as const;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyExpense(descNormalized: string): "fixed" | "variable" | "unknown" {
  const text = normalizeText(descNormalized);
  if (!text) return "unknown";

  if (FIXED_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "fixed";
  }

  if (VARIABLE_HINTS.some((keyword) => text.includes(keyword))) {
    return "variable";
  }

  return "unknown";
}
