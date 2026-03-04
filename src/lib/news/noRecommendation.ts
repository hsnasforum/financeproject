const FORBIDDEN_PATTERN = /(매수|매도|정답|무조건|(?<!불)확실|해야\s*한다|해야\s*하|[가-힣]+아야\s*한다)/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function noRecommendationText(text: string): boolean {
  return !FORBIDDEN_PATTERN.test(asString(text));
}

export function sanitizeNoRecommendationText(text: string): string {
  const normalized = asString(text);
  return normalized.replace(new RegExp(FORBIDDEN_PATTERN.source, "gi"), "검토");
}

export function assertNoRecommendationText(text: string, context = "text"): void {
  if (!noRecommendationText(text)) {
    throw new Error(`FORBIDDEN_RECOMMENDATION:${context}`);
  }
}

export function assertNoRecommendationLines(lines: string[], context = "lines"): void {
  lines.forEach((line, index) => {
    assertNoRecommendationText(line, `${context}[${index}]`);
  });
}
