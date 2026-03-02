const CORPORATE_TOKENS = [
  "주식회사",
  "유한회사",
  "(주)",
  "㈜",
  "주)",
  "(유)",
  "유)",
  "inc",
  "co",
  "ltd",
];

function removeCorporateTokens(input: string): string {
  let out = input;
  for (const token of CORPORATE_TOKENS) {
    out = out.replaceAll(token, " ");
  }
  return out;
}

export function normalizeProviderName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  const noCorp = removeCorporateTokens(trimmed);
  const normalized = noCorp
    .replace(/[()\[\]{}<>]/g, " ")
    .replace(/[·.,/\\'"`~!@#$%^&*+=_|?:;\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");

  return normalized;
}

export function isLikelyFuzzyProviderMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return a.includes(b) || b.includes(a);
}
