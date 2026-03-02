export type RegexValidationResult = {
  ok: boolean;
  reason?: string;
};

const MAX_REGEX_PATTERN_LENGTH = 80;

const DANGEROUS_NESTED_REPEAT_PATTERNS: RegExp[] = [
  /\(\s*\.\*\s*\)\s*[+*{]/,
  /\(\s*\.\+\s*\)\s*[+*{]/,
  /\(\s*\\w\+\s*\)\s*[+*{]/,
  /\((?:\\.|[^()])*(?:\*|\+|\{[0-9]+(?:,[0-9]*)?\})(?:\?|)?(?:\\.|[^()])*\)\s*(?:\+|\*|\{[0-9]+(?:,[0-9]*)?\})/,
];

export function validateRegexPattern(pattern: string): RegexValidationResult {
  const trimmed = typeof pattern === "string" ? pattern.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "empty_pattern" };
  }
  if (trimmed.length > MAX_REGEX_PATTERN_LENGTH) {
    return { ok: false, reason: "pattern_too_long" };
  }
  if (DANGEROUS_NESTED_REPEAT_PATTERNS.some((rule) => rule.test(trimmed))) {
    return { ok: false, reason: "nested_repeat_risk" };
  }
  try {
    // Compile-only check; no runtime evaluation is performed here.
    RegExp(trimmed);
  } catch {
    return { ok: false, reason: "invalid_regex" };
  }
  return { ok: true };
}
