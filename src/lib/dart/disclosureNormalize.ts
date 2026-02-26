import type { DisclosureNormalizationRules, DisclosureRules } from "@/lib/dart/disclosureClassifier";

export type DisclosureNormalizeResult = {
  normalized: string;
  flags: string[];
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanupSpacing(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([()[\]{}|,:;/\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function collapsePunctuation(text: string): string {
  return text
    .replace(/[|·•ㆍ]+/g, " ")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/[,:;]+/g, " ")
    .replace(/--+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function removeAllLiteral(text: string, token: string): { next: string; removed: boolean } {
  if (!token) return { next: text, removed: false };
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "g");
  const next = text.replace(pattern, " ");
  return { next, removed: next !== text };
}

function stripEdgeToken(
  text: string,
  token: string,
  mode: "prefix" | "suffix",
): { next: string; removed: boolean } {
  if (!token) return { next: text, removed: false };
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = mode === "prefix"
    ? new RegExp(`^(?:${escaped})[\\s\\-:|·•]*`, "i")
    : new RegExp(`[\\s\\-:|·•]*(?:${escaped})$`, "i");
  const next = text.replace(pattern, "");
  return { next, removed: next !== text };
}

function normalizeRules(rules: DisclosureRules | DisclosureNormalizationRules): DisclosureNormalizationRules {
  if ("normalization" in rules) {
    return rules.normalization;
  }
  return rules;
}

export function normalizeTitle(
  rawTitle: string,
  rules: DisclosureRules | DisclosureNormalizationRules,
): DisclosureNormalizeResult {
  const ruleSet = normalizeRules(rules);
  let current = cleanupSpacing(asString(rawTitle));
  const flags: string[] = [];

  for (const noise of ruleSet.noise) {
    const removed = removeAllLiteral(current, noise);
    if (removed.removed) {
      current = cleanupSpacing(removed.next);
      flags.push(`noise:${noise}`);
    }
  }

  for (const prefix of ruleSet.prefixes) {
    let changed = true;
    while (changed) {
      const removed = stripEdgeToken(current, prefix, "prefix");
      changed = removed.removed;
      if (changed) {
        current = cleanupSpacing(removed.next);
        flags.push(`prefix:${prefix}`);
      }
    }
  }

  for (const suffix of ruleSet.suffixes) {
    let changed = true;
    while (changed) {
      const removed = stripEdgeToken(current, suffix, "suffix");
      changed = removed.removed;
      if (changed) {
        current = cleanupSpacing(removed.next);
        flags.push(`suffix:${suffix}`);
      }
    }
  }

  const normalized = collapsePunctuation(cleanupSpacing(current));
  return {
    normalized,
    flags: [...new Set(flags)].sort((a, b) => a.localeCompare(b)),
  };
}

export function tokenizeTitle(normalized: string): string[] {
  const text = asString(normalized).toLowerCase();
  if (!text) return [];

  const tokens = text
    .replace(/[^0-9a-z가-힣]+/gi, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 || /^\d+$/.test(token));

  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b));
}
