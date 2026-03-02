import { classify, type DisclosureLevel, type DisclosureRules } from "./disclosureClassifier";
import { normalizeTitle, tokenizeTitle } from "./disclosureNormalize";

type SuggestLabelInput = {
  reportNm?: string;
  reportName?: string;
  title?: string;
};

export type LabelSuggestion = {
  predictedCategoryId: string | null;
  score: number;
  level: DisclosureLevel | null;
  signals: string[];
  uncertain: boolean;
  unknown: boolean;
  threshold: number;
  normalizedTitle: string;
  noiseFlags: string[];
  tokenCount: number;
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeUncertainThreshold(rules: DisclosureRules): number {
  return Math.max(0, Math.min(100, Math.round(toNumber(rules.thresholds.mid, 60))));
}

function isHeavyNoise(flags: string[]): { heavy: boolean; noiseFlags: string[] } {
  const normalized = [...new Set(flags.map((flag) => asString(flag)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const noiseFlags = normalized.filter((flag) => flag.startsWith("noise:"));
  const prefixFlags = normalized.filter((flag) => flag.startsWith("prefix:"));
  const suffixFlags = normalized.filter((flag) => flag.startsWith("suffix:"));
  const structuralCount = noiseFlags.length + prefixFlags.length + suffixFlags.length;
  const heavy = noiseFlags.length >= 2 || structuralCount >= 3 || (noiseFlags.length >= 1 && structuralCount >= 2);
  return {
    heavy,
    noiseFlags: normalized,
  };
}

export function suggestLabel(item: SuggestLabelInput, rules: DisclosureRules): LabelSuggestion {
  const rawTitle = asString(item.reportNm ?? item.reportName ?? item.title);
  const normalizedResult = normalizeTitle(rawTitle, rules);
  const normalizedTitle = asString(normalizedResult.normalized);
  const tokens = tokenizeTitle(normalizedTitle);
  const classification = classify({ reportName: normalizedTitle || rawTitle }, rules);
  const predictedCategoryId = asString(classification.categoryId) || null;
  const score = Math.max(0, Math.min(100, Math.round(toNumber(classification.score, 0))));
  const threshold = computeUncertainThreshold(rules);
  const level = classification.level ?? null;
  const signals = [...new Set((classification.signals ?? []).map((signal) => asString(signal)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  const unknown = predictedCategoryId === "other" || !predictedCategoryId;
  const scoreLow = score < threshold;
  const noiseImpact = isHeavyNoise(normalizedResult.flags ?? []);
  const uncertain = unknown || scoreLow || noiseImpact.heavy;

  return {
    predictedCategoryId,
    score,
    level,
    signals,
    uncertain,
    unknown,
    threshold,
    normalizedTitle,
    noiseFlags: noiseImpact.noiseFlags,
    tokenCount: tokens.length,
  };
}
