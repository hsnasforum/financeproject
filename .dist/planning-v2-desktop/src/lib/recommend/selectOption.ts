import { type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";
import { type SelectedOption, type UserRecommendProfile } from "./types";

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseTermMonths(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function pickRate(option: NormalizedOption, mode: UserRecommendProfile["rateMode"]): {
  appliedRate: number;
  baseRate: number | null;
  maxRate: number | null;
  source: SelectedOption["rateSource"];
  reasons: string[];
} {
  const baseRate = asFiniteNumber(option.intr_rate);
  const maxRate = asFiniteNumber(option.intr_rate2);

  const reasons: string[] = [];
  if (mode === "max") {
    if (maxRate !== null) {
      return { appliedRate: maxRate, baseRate, maxRate, source: "intr_rate2", reasons: ["최고금리 우선 정책 적용"] };
    }
    if (baseRate !== null) {
      reasons.push("최고금리 정보 부재로 기본금리 대체");
      return { appliedRate: baseRate, baseRate, maxRate, source: "intr_rate", reasons };
    }
  }

  if (baseRate !== null) {
    const baseReason = mode === "simple" ? "단순조건 선호로 기본금리 우선" : "기본금리 우선 정책 적용";
    return { appliedRate: baseRate, baseRate, maxRate, source: "intr_rate", reasons: [baseReason] };
  }
  if (maxRate !== null) {
    reasons.push("기본금리 정보 부재로 최고금리 대체");
    return { appliedRate: maxRate, baseRate, maxRate, source: "intr_rate2", reasons };
  }

  return {
    appliedRate: 0,
    baseRate,
    maxRate,
    source: "none",
    reasons: ["금리 정보 부족"],
  };
}

export function selectBestOption(product: NormalizedProduct, profile: UserRecommendProfile): SelectedOption {
  if (!Array.isArray(product.options) || product.options.length === 0) {
    return {
      saveTrm: null,
      termMonths: null,
      appliedRate: 0,
      baseRate: null,
      maxRate: null,
      rateSource: "none",
      reasons: ["옵션 정보 없음", "금리 정보 부족"],
    };
  }

  const prefTerm = profile.preferredTerm;
  const ranked = product.options
    .map((option) => {
      const termMonths = parseTermMonths(option.save_trm);
      const termDiff = termMonths === null ? Number.POSITIVE_INFINITY : Math.abs(termMonths - prefTerm);
      const ratePicked = pickRate(option, profile.rateMode);
      return {
        option,
        termMonths,
        termDiff,
        ...ratePicked,
      };
    })
    .sort((a, b) => {
      if (a.termDiff !== b.termDiff) return a.termDiff - b.termDiff;
      if (a.appliedRate !== b.appliedRate) return b.appliedRate - a.appliedRate;
      return 0;
    });

  const best = ranked[0];
  if (!best) {
    return {
      saveTrm: null,
      termMonths: null,
      appliedRate: 0,
      baseRate: null,
      maxRate: null,
      rateSource: "none",
      reasons: ["옵션 선택 실패", "금리 정보 부족"],
    };
  }

  const reasons = [...best.reasons];
  if (Number.isFinite(best.termDiff)) {
    reasons.push(`선호기간(${prefTerm}개월)과 차이 ${best.termDiff}개월`);
  } else {
    reasons.push("기간 정보 부족");
  }

  return {
    saveTrm: best.option.save_trm ?? null,
    termMonths: best.termMonths,
    appliedRate: best.appliedRate,
    baseRate: best.baseRate,
    maxRate: best.maxRate,
    rateSource: best.source,
    reasons,
  };
}

export function toNormalizedOption(option: {
  saveTrm?: string | null;
  intrRate?: number | null;
  intrRate2?: number | null;
  raw?: Record<string, unknown> | null;
}): NormalizedOption {
  return {
    save_trm: option.saveTrm ?? undefined,
    intr_rate: option.intrRate ?? null,
    intr_rate2: option.intrRate2 ?? null,
    raw: (option.raw as Record<string, unknown> | null) ?? {},
  };
}
