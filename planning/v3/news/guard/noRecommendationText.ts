const BANNED_PATTERNS: RegExp[] = [
  /매수/gi,
  /매도/gi,
  /정답/gi,
  /무조건/gi,
  /확실/gi,
  /해야\s*한다/gi,
  /사야\s*한다/gi,
  /팔아야\s*한다/gi,
  /buy\s+now/gi,
  /sell\s+now/gi,
  /must\s+buy/gi,
  /must\s+sell/gi,
  /guaranteed/gi,
  /certainly/gi,
  /definitely/gi,
];

function hasBannedPattern(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return BANNED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function noRecommendationText(text: string): boolean {
  return !hasBannedPattern(text);
}

export function assertNoRecommendationText(input: string | string[]): void {
  const values = Array.isArray(input) ? input : [input];
  for (const value of values) {
    if (!noRecommendationText(value)) {
      throw new Error("FORBIDDEN_RECOMMENDATION_LANGUAGE");
    }
  }
}
