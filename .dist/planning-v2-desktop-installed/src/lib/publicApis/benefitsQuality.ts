import { type BenefitCandidate } from "./contracts/types";

export type BenefitsQualityBucket = "HIGH" | "MED" | "LOW" | "EMPTY";

export type BenefitsQualitySignals = {
  hasSummary: boolean;
  hasApply: boolean;
  hasEligibility: boolean;
  hasContact: boolean;
  hasLink: boolean;
  eligibilityLen: number;
  chipsCount: number;
};

export function getBenefitQualitySignals(item: BenefitCandidate): BenefitsQualitySignals {
  const eligibilityText = item.eligibilityText ?? item.eligibilityExcerpt ?? item.eligibilityHints?.join(" ") ?? "";
  return {
    hasSummary: Boolean((item.summary ?? "").trim()),
    hasApply: Boolean((item.applyHow ?? "").trim()),
    hasEligibility: Boolean(eligibilityText.trim()),
    hasContact: Boolean((item.contact ?? "").trim()),
    hasLink: Boolean((item.link ?? "").trim()),
    eligibilityLen: eligibilityText.replace(/\s+/g, " ").trim().length,
    chipsCount: item.eligibilityChips?.length ?? 0,
  };
}

export function getBenefitQualityBucket(item: BenefitCandidate): BenefitsQualityBucket {
  const s = getBenefitQualitySignals(item);
  if (!s.hasSummary && !s.hasApply && !s.hasEligibility) return "EMPTY";
  if (s.hasSummary && s.hasApply && s.eligibilityLen >= 120 && (s.chipsCount > 0 || s.hasContact || s.hasLink)) return "HIGH";
  if (s.hasSummary && s.hasApply && s.eligibilityLen >= 40) return "MED";
  return "LOW";
}
