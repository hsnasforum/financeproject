import { type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";
import { selectBestOption } from "./selectOption";
import {
  DEFAULT_WEIGHTS,
  type RecommendDebug,
  type RecommendationAssumptions,
  type RecommendDetailProduct,
  type RecommendedItem,
  type RecommendKind,
  type RecommendWeights,
  type ScoreBreakdownItem,
  type UserRecommendProfile,
} from "./types";
import { getRateForPreference } from "../finlife/uiSort";

export type RecommendProfile = {
  purpose: string;
  preferredTerms: string[];
  liquidityNeed: "low" | "medium" | "high";
  ratePreference: "balanced" | "aggressive";
  topN: number;
  rateDirection?: "higher" | "lower";
};

export type ScoreExplain = {
  maxPoints: 100;
  finalPoints: number;
  finalNormalized: number;
  why: {
    summary: string;
    bullets: string[];
    badges?: string[];
  };
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
    comparableRate?: number | null;
  };
  assumptions: {
    relativeScore: true;
    note: string;
    rateRange?: { min: number; max: number };
  };
  debug?: {
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
    rawSignals: {
      rateDirection: "higher" | "lower";
      ratePercentile: number | null;
      representativeTerm: number | null;
      comparableRate: number | null;
    };
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

function round0(value: number): number {
  return Math.round(value);
}

function formatRate(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "정보 부족";
  return `${Number(value).toFixed(2)}%`;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, cur) => acc + cur, 0) / values.length;
}

function parseRateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function optionRates(option: NormalizedOption): number[] {
  const out: number[] = [];
  const push = (value: unknown) => {
    const parsed = parseRateValue(value);
    if (parsed !== null) out.push(parsed);
  };
  push(option.intr_rate2);
  push(option.intr_rate);
  const raw = option.raw as Record<string, unknown>;
  push(raw.lend_rate_min);
  push(raw.lend_rate_max);
  push(raw.crdt_grad_avg);
  push(raw.crdt_lend_rate);
  return out;
}

function optionRate(option: NormalizedOption, direction: "higher" | "lower"): number | null {
  const rates = optionRates(option);
  if (!rates.length) return null;
  return direction === "higher" ? Math.max(...rates) : Math.min(...rates);
}

function pickRepresentativeOption(product: NormalizedProduct, direction: "higher" | "lower"): NormalizedOption | null {
  if (!product.options.length) return null;
  const sorted = product.options
    .slice()
    .sort((a, b) => {
      const ra = optionRate(a, direction);
      const rb = optionRate(b, direction);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return direction === "higher" ? rb - ra : ra - rb;
    });
  return sorted[0] ?? null;
}

function parseTerm(term?: string): number | null {
  if (!term) return null;
  const value = Number(term);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function liquidityLabel(level: RecommendProfile["liquidityNeed"]): string {
  if (level === "high") return "높음";
  if (level === "medium") return "보통";
  return "낮음";
}

function calcRatePercentile(rate: number | null, rates: number[], direction: "higher" | "lower"): number | null {
  if (!Number.isFinite(rate) || rates.length <= 1) return rates.length === 1 ? 100 : null;
  const betterCount =
    direction === "higher"
      ? rates.filter((entry) => entry > (rate as number)).length
      : rates.filter((entry) => entry < (rate as number)).length;
  return clamp(1 - betterCount / Math.max(1, rates.length - 1)) * 100;
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
  const rateDirection = profile.rateDirection ?? "higher";
  const weights =
    profile.ratePreference === "aggressive"
      ? { rate: 0.65, term: 0.25, liquidity: 0.1 }
      : { rate: 0.5, term: 0.35, liquidity: 0.15 };

  const representative = products.map((product) => ({
    product,
    option: pickRepresentativeOption(product, rateDirection),
    comparableRate: getRateForPreference(product, rateDirection),
  }));

  const rateValues = representative.map(({ comparableRate }) => comparableRate).filter((rate): rate is number => Number.isFinite(rate));
  const rateMin = rateValues.length ? Math.min(...rateValues) : 0;
  const rateMax = rateValues.length ? Math.max(...rateValues) : 0;

  return representative
    .map(({ product, option, comparableRate }) => {
      const rateValue = comparableRate ?? 0;
      const rateNorm =
        rateMax === rateMin
          ? 1
          : rateDirection === "higher"
            ? clamp((rateValue - rateMin) / Math.max(rateMax - rateMin, Number.EPSILON))
            : clamp((rateMax - rateValue) / Math.max(rateMax - rateMin, Number.EPSILON));

      const termMonths = parseTerm(option?.save_trm);
      const normalizedTerm = termNorm(profile.preferredTerms, termMonths);
      const normalizedLiquidity = liquidityNorm(profile.liquidityNeed, termMonths);

      const ratePoints = round1(rateNorm * weights.rate * 100);
      const termPoints = round1(normalizedTerm * weights.term * 100);
      const liquidityPoints = round1(normalizedLiquidity * weights.liquidity * 100);
      const finalPoints = round1(ratePoints + termPoints + liquidityPoints);
      const provider = product.kor_co_nm ?? "기관 정보 미상";
      const percentile = calcRatePercentile(comparableRate ?? null, rateValues, rateDirection);
      const preferredNumeric = profile.preferredTerms.map((term) => Number(term)).filter((term) => Number.isFinite(term) && term > 0);
      const preferredLabel = preferredNumeric.length ? preferredNumeric.join(",") : "미설정";
      const sameTermRates = representative
        .filter((entry) => parseTerm(entry.option?.save_trm) === termMonths)
        .map((entry) => entry.comparableRate)
        .filter((entry): entry is number => Number.isFinite(entry));
      const referenceAvg = avg(sameTermRates) ?? avg(rateValues);
      const diffP =
        Number.isFinite(comparableRate) && Number.isFinite(referenceAvg)
          ? rateDirection === "higher"
            ? (comparableRate as number) - (referenceAvg as number)
            : (referenceAvg as number) - (comparableRate as number)
          : null;
      const preferentialSpread =
        rateDirection === "higher" && Number.isFinite(option?.intr_rate2) && Number.isFinite(option?.intr_rate)
          ? (option?.intr_rate2 as number) - (option?.intr_rate as number)
          : null;

      const bullets: string[] = [];
      if (Number.isFinite(comparableRate)) {
        if (rateDirection === "lower") {
          bullets.push(
            `후보군 기준 금리 상위 ${round0(percentile ?? 0)}%로 비교됩니다 (낮을수록 유리, 대표 ${formatRate(comparableRate)}).`,
          );
        } else {
          bullets.push(`후보군 기준 금리 상위 ${round0(percentile ?? 0)}%로 비교됩니다 (대표 ${formatRate(comparableRate)}).`);
        }
        if (Number.isFinite(diffP)) {
          const sign = (diffP as number) >= 0 ? "+" : "-";
          bullets.push(`후보군 평균 대비 ${sign}${Math.abs(diffP as number).toFixed(2)}%p 수준입니다.`);
        }
      } else {
        bullets.push("금리 정보가 제한적(공시/옵션 누락)이라 기간/구성 중심으로 비교했습니다.");
      }
      if (termMonths && preferredNumeric.includes(termMonths)) {
        bullets.push(`선호 기간(${preferredLabel}) 중 ${termMonths}개월 옵션이 있어 기간 적합도가 높습니다.`);
      } else if (termMonths) {
        bullets.push(`선호 기간과 정확히 일치하는 옵션은 없지만 가장 가까운 ${termMonths}개월 기준으로 비교했습니다.`);
      } else {
        bullets.push("기간 정보가 제한적이라 금리 중심으로 보수적으로 비교했습니다.");
      }
      if (Number.isFinite(preferentialSpread) && (preferentialSpread as number) >= 0.3) {
        bullets.push(`우대 적용 시 최대 +${(preferentialSpread as number).toFixed(2)}%p 가능성이 있습니다(조건 충족 시).`);
      }
      bullets.push(`유동성 선호(${liquidityLabel(profile.liquidityNeed)}) 기준으로 만기 구성을 함께 반영했습니다.`);

      const compactBullets = bullets.filter(Boolean).slice(0, 3);
      while (compactBullets.length < 2) {
        compactBullets.push("후보군 기준 비교이며 개인 조건/시점에 따라 실제 조건은 달라질 수 있습니다.");
      }

      const whySummary =
        rateDirection === "lower"
          ? `대표금리 ${formatRate(comparableRate)} · ${provider} · 후보군 기준 비교`
          : `대표금리 ${formatRate(comparableRate)} · ${termMonths ?? "기간 미상"}개월 옵션 · ${provider}`;

      return {
        product,
        explain: {
          maxPoints: 100 as const,
          finalPoints,
          finalNormalized: round4(finalPoints / 100),
          why: {
            summary: whySummary,
            bullets: compactBullets,
            badges: [rateDirection === "lower" ? "대출 비교" : "저축 비교"],
          },
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
            comparableRate: comparableRate ?? null,
          },
          assumptions: {
            relativeScore: true as const,
            note:
              rateDirection === "lower"
                ? "점수는 후보군 내 상대 비교 기준이며 금리/심사조건은 개인·시점에 따라 달라집니다."
                : "점수는 후보군 내 상대 비교 기준이며 확정 수익을 의미하지 않습니다.",
            rateRange: { min: round4(rateMin), max: round4(rateMax) },
          },
          debug: {
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
            rawSignals: {
              rateDirection,
              ratePercentile: percentile !== null ? round1(percentile) : null,
              representativeTerm: termMonths,
              comparableRate: comparableRate ?? null,
            },
          },
        },
      };
    })
    .sort((a, b) => b.explain.finalPoints - a.explain.finalPoints)
    .slice(0, Math.max(1, profile.topN || 5));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function liquidityPenalty(termMonths: number | null, pref: UserRecommendProfile["liquidityPref"]): number {
  const term = termMonths ?? 36;
  if (pref === "high") return clamp01(term / 36);
  if (pref === "mid") return clamp01((term - 12) / 24);
  return clamp01((term - 24) / 24);
}

function normalizeRate(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clamp01((value - min) / Math.max(max - min, Number.EPSILON));
}

function buildBreakdown(input: {
  rateScore: number;
  termFit: number;
  liqPenalty: number;
  weights: RecommendWeights;
}): ScoreBreakdownItem[] {
  const { rateScore, termFit, liqPenalty, weights } = input;
  return [
    {
      key: "rate",
      label: "금리",
      raw: round6(rateScore),
      weight: round6(weights.rate),
      contribution: round6(rateScore * weights.rate),
      reason: rateScore >= 0.7 ? "금리 상위권" : "금리 중립/하위권",
    },
    {
      key: "term",
      label: "기간 적합",
      raw: round6(termFit),
      weight: round6(weights.term),
      contribution: round6(termFit * weights.term),
      reason: termFit >= 0.75 ? "선호기간과 근접" : "선호기간과 차이 존재",
    },
    {
      key: "liquidity",
      label: "유동성 패널티",
      raw: round6(liqPenalty),
      weight: round6(weights.liquidity),
      contribution: round6(-liqPenalty * weights.liquidity),
      reason: "유동성 선호 대비 장기 페널티",
    },
  ];
}

function mergeWeights(overrides?: Partial<RecommendWeights>): RecommendWeights {
  return {
    rate: clamp01(overrides?.rate ?? DEFAULT_WEIGHTS.rate),
    term: clamp01(overrides?.term ?? DEFAULT_WEIGHTS.term),
    liquidity: clamp01(overrides?.liquidity ?? DEFAULT_WEIGHTS.liquidity),
  };
}

export function getRecommendAssumptions(rateMode: UserRecommendProfile["rateMode"]): RecommendationAssumptions {
  const policy =
    rateMode === "max"
      ? "금리 선택 정책: 최고금리(intr_rate2) 우선, 부재 시 기본금리(intr_rate) 대체"
      : "금리 선택 정책: 기본금리(intr_rate) 우선, 부재 시 최고금리(intr_rate2) 대체";
  return {
    rateSelectionPolicy: policy,
    liquidityPolicy: "유동성은 기간 기반 휴리스틱으로 반영(중도해지/우대조건 상세는 추후 확장)",
    normalizationPolicy: "금리 점수는 후보군 min/max로 0..1 정규화(max=min이면 0.5)",
  };
}

type RecommendCandidate = {
  sourceId: RecommendedItem["sourceId"];
  product: NormalizedProduct;
  badges?: string[];
  extraReasons?: string[];
};
export type { RecommendCandidate };

function buildDetailProduct(product: NormalizedProduct): RecommendDetailProduct {
  return {
    fin_prdt_cd: product.fin_prdt_cd,
    fin_co_no: product.fin_co_no,
    kor_co_nm: product.kor_co_nm,
    fin_prdt_nm: product.fin_prdt_nm,
    options: product.options.map((option) => ({
      save_trm: option.save_trm,
      intr_rate: option.intr_rate ?? null,
      intr_rate2: option.intr_rate2 ?? null,
      raw: option.raw ?? {},
    })),
    best: product.best
      ? {
          save_trm: product.best.save_trm,
          intr_rate: product.best.intr_rate ?? null,
          intr_rate2: product.best.intr_rate2 ?? null,
        }
      : undefined,
    raw: product.raw ?? {},
  };
}

export function recommendCandidates(input: {
  kind: RecommendKind;
  candidates: RecommendCandidate[];
  profile: UserRecommendProfile;
}): { items: RecommendedItem[]; debug: RecommendDebug; weights: RecommendWeights; assumptions: RecommendationAssumptions } {
  const { kind, candidates: rawCandidates, profile } = input;
  const weights = mergeWeights(profile.weights);
  const candidates = rawCandidates.map((candidate) => ({
    ...candidate,
    selected: selectBestOption(candidate.product, profile),
  }));

  const rates = candidates.map((entry) => entry.selected.appliedRate);
  const rateMin = rates.length ? Math.min(...rates) : 0;
  const rateMax = rates.length ? Math.max(...rates) : 0;

  const scored = candidates.map(({ sourceId, product, badges, extraReasons, selected }) => {
    const termMonths = selected.termMonths ?? profile.preferredTerm;
    const rateScore = normalizeRate(selected.appliedRate, rateMin, rateMax);
    const termFit = clamp01(1 - Math.abs(termMonths - profile.preferredTerm) / 36);
    const liqPenalty = liquidityPenalty(selected.termMonths, profile.liquidityPref);
    const finalScore = clamp01(weights.rate * rateScore + weights.term * termFit - weights.liquidity * liqPenalty);
    const breakdown = buildBreakdown({ rateScore, termFit, liqPenalty, weights });

    const providerName = product.kor_co_nm ?? "금융사 정보 없음";
    const productName = product.fin_prdt_nm ?? product.fin_prdt_cd;
    const reasonLines = [
      `선택 옵션: ${selected.saveTrm ?? "기간정보 없음"}개월 · 적용금리 ${selected.appliedRate.toFixed(2)}%`,
      ...(extraReasons ?? []).slice(0, 2),
      ...selected.reasons.slice(0, 2),
      breakdown[0].reason,
      breakdown[1].reason,
      breakdown[2].reason,
    ].filter(Boolean).slice(0, 4);

    return {
      sourceId,
      kind,
      finPrdtCd: product.fin_prdt_cd,
      providerName,
      productName,
      finalScore: round6(finalScore),
      selectedOption: selected,
      breakdown,
      reasons: reasonLines,
      detailProduct: buildDetailProduct(product),
      badges: [...(badges ?? []), sourceId === "finlife" ? "FINLIFE" : sourceId === "datago_kdb" ? "KDB" : sourceId],
    } satisfies RecommendedItem;
  });

  const topN = Math.max(1, Math.min(50, profile.topN));
  return {
    items: scored.sort((a, b) => b.finalScore - a.finalScore).slice(0, topN),
    debug: {
      candidateCount: rawCandidates.length,
      rateMin: round6(rateMin),
      rateMax: round6(rateMax),
    },
    weights,
    assumptions: getRecommendAssumptions(profile.rateMode),
  };
}

export function recommendFinlifeProducts(input: {
  kind: RecommendKind;
  products: NormalizedProduct[];
  profile: UserRecommendProfile;
}): { items: RecommendedItem[]; debug: RecommendDebug; weights: RecommendWeights; assumptions: RecommendationAssumptions } {
  return recommendCandidates({
    kind: input.kind,
    profile: input.profile,
    candidates: input.products.map((product) => ({ sourceId: "finlife", product, badges: ["FINLIFE"] })),
  });
}
