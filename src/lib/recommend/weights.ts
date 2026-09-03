import { DEFAULT_WEIGHTS, type RecommendWeights } from "./types";

export type RecommendWeightNormalizationReason = "none" | "sum_adjusted" | "zero_sum_defaulted";

export type RecommendWeightNormalization = {
  weights: RecommendWeights;
  originalSum: number;
  normalized: boolean;
  reason: RecommendWeightNormalizationReason;
};

function sanitizeWeight(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function normalizeRecommendWeights(input?: Partial<RecommendWeights>): RecommendWeightNormalization {
  const weights = {
    rate: sanitizeWeight(input?.rate, DEFAULT_WEIGHTS.rate),
    term: sanitizeWeight(input?.term, DEFAULT_WEIGHTS.term),
    liquidity: sanitizeWeight(input?.liquidity, DEFAULT_WEIGHTS.liquidity),
  };
  const originalSum = weights.rate + weights.term + weights.liquidity;

  if (originalSum === 1) {
    return { weights, originalSum, normalized: false, reason: "none" };
  }
  if (originalSum === 0) {
    return {
      weights: { ...DEFAULT_WEIGHTS },
      originalSum,
      normalized: true,
      reason: "zero_sum_defaulted",
    };
  }

  const rate = weights.rate / originalSum;
  const term = weights.term / originalSum;
  return {
    weights: {
      rate,
      term,
      liquidity: 1 - (rate + term),
    },
    originalSum,
    normalized: true,
    reason: "sum_adjusted",
  };
}

export function formatRecommendWeightNormalizationNotice(
  normalization: RecommendWeightNormalization | null | undefined,
): string {
  if (!normalization?.normalized) return "";
  if (normalization.reason === "zero_sum_defaulted") {
    return "가중치 합계가 0%여서 기본값(금리 55% · 기간 30% · 유동성 15%)으로 복원했습니다.";
  }
  const originalPct = Math.round(normalization.originalSum * 10_000) / 100;
  return `가중치 합계 ${originalPct}%를 기존 비율대로 100%로 정규화했습니다.`;
}
