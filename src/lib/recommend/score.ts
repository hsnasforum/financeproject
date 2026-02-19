import { type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";

export type RecommendProfile = {
  purpose: string;
  preferredTerms: string[];
  liquidityNeed: "low" | "medium" | "high";
  ratePreference: "balanced" | "aggressive";
  topN: number;
};

export type ScoreExplain = {
  maxPoints: 100;
  finalPoints: number;
  finalNormalized: number;
  contributions: {
    ratePoints: number;
    termPoints: number;
    liquidityPoints: number;
  };
  weights: {
    rate: number;
    term: number;
    liquidity: number;
  };
  norms: {
    rate: number;
    term: number;
    liquidity: number;
  };
  pickedOption: {
    save_trm?: string;
    intr_rate?: number | null;
    intr_rate2?: number | null;
  };
  assumptions: {
    relativeScore: true;
    note: string;
    rateRange?: { min: number; max: number };
  };
};

export type ScoredProduct = {
  product: NormalizedProduct;
  explain: ScoreExplain;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function optionRate(option: NormalizedOption): number {
  const value = option.intr_rate2 ?? option.intr_rate ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function pickRepresentativeOption(product: NormalizedProduct): NormalizedOption | null {
  if (!product.options.length) return null;
  return product.options
    .slice()
    .sort((a, b) => optionRate(b) - optionRate(a))[0];
}

function parseTerm(term?: string): number | null {
  if (!term) return null;
  const value = Number(term);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function termNorm(preferredTerms: string[], termMonths: number | null): number {
  if (!preferredTerms.length) return 1;
  if (!termMonths) return 0.2;

  const targets = preferredTerms
    .map((term) => Number(term))
    .filter((term) => Number.isFinite(term) && term > 0);

  if (!targets.length) return 1;

  const minDiff = Math.min(...targets.map((target) => Math.abs(target - termMonths)));

  if (minDiff === 0) return 1;
  if (minDiff <= 6) return 0.8;
  if (minDiff <= 12) return 0.6;
  if (minDiff <= 24) return 0.3;
  return 0.2;
}

function liquidityNorm(level: RecommendProfile["liquidityNeed"], termMonths: number | null): number {
  const term = termMonths ?? 999;

  if (level === "high") {
    if (term <= 6) return 1;
    if (term <= 12) return 0.85;
    if (term <= 24) return 0.55;
    return 0.3;
  }

  if (level === "medium") {
    if (term <= 12) return 1;
    if (term <= 24) return 0.8;
    if (term <= 36) return 0.6;
    return 0.5;
  }

  if (term === 24) return 1;
  if (term >= 12) return 0.9;
  if (term >= 6) return 0.8;
  return 0.75;
}

export function scoreProducts(products: NormalizedProduct[], profile: RecommendProfile): ScoredProduct[] {
  const weights =
    profile.ratePreference === "aggressive"
      ? { rate: 0.65, term: 0.25, liquidity: 0.1 }
      : { rate: 0.5, term: 0.35, liquidity: 0.15 };

  const representative = products.map((product) => ({
    product,
    option: pickRepresentativeOption(product),
  }));

  const rates = representative.map(({ option }) => (option ? optionRate(option) : 0));
  const rateMin = rates.length ? Math.min(...rates) : 0;
  const rateMax = rates.length ? Math.max(...rates) : 0;

  return representative
    .map(({ product, option }) => {
      const rateValue = option ? optionRate(option) : 0;
      const rateNorm =
        rateMax === rateMin ? 1 : clamp((rateValue - rateMin) / Math.max(rateMax - rateMin, Number.EPSILON));

      const termMonths = parseTerm(option?.save_trm);
      const normalizedTerm = termNorm(profile.preferredTerms, termMonths);
      const normalizedLiquidity = liquidityNorm(profile.liquidityNeed, termMonths);

      const ratePoints = round1(rateNorm * weights.rate * 100);
      const termPoints = round1(normalizedTerm * weights.term * 100);
      const liquidityPoints = round1(normalizedLiquidity * weights.liquidity * 100);
      const finalPoints = round1(ratePoints + termPoints + liquidityPoints);

      return {
        product,
        explain: {
          maxPoints: 100,
          finalPoints,
          finalNormalized: round4(finalPoints / 100),
          contributions: {
            ratePoints,
            termPoints,
            liquidityPoints,
          },
          weights,
          norms: {
            rate: round4(rateNorm),
            term: round4(normalizedTerm),
            liquidity: round4(normalizedLiquidity),
          },
          pickedOption: {
            save_trm: option?.save_trm,
            intr_rate: option?.intr_rate,
            intr_rate2: option?.intr_rate2,
          },
          assumptions: {
            relativeScore: true,
            note: "점수는 후보군 내 상대 비교 기준이며 확정 수익을 의미하지 않습니다.",
            rateRange: { min: round4(rateMin), max: round4(rateMax) },
          },
        },
      };
    })
    .sort((a, b) => b.explain.finalPoints - a.explain.finalPoints)
    .slice(0, profile.topN);
}
