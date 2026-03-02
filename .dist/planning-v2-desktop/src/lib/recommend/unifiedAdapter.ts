import { ensureProductBest } from "../finlife/best";
import { type NormalizedOption, type NormalizedProduct } from "../finlife/types";
import { type RecommendCandidate } from "./score";
import { type UserRecommendProfile } from "./types";
import { type UnifiedProductView } from "../sources/unified";

type UnifiedOption = NonNullable<UnifiedProductView["options"]>[number];

function parseTermMonths(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const matched = value.replace(/,/g, "").match(/\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function normalizeTerm(option: UnifiedOption): number | null {
  if (typeof option.termMonths === "number" && Number.isFinite(option.termMonths) && option.termMonths > 0) {
    return Math.trunc(option.termMonths);
  }
  return parseTermMonths(option.saveTrm);
}

function normalizeRate(value: number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function optionAppliedRate(option: UnifiedOption, rateMode: UserRecommendProfile["rateMode"]): number {
  const baseRate = normalizeRate(option.intrRate);
  const maxRate = normalizeRate(option.intrRate2);
  if (rateMode === "max") return maxRate ?? baseRate ?? 0;
  return baseRate ?? maxRate ?? 0;
}

export function pickUnifiedSelectedOption(
  options: UnifiedOption[] | undefined,
  profile: Pick<UserRecommendProfile, "preferredTerm" | "rateMode">,
): { option: NormalizedOption | null; reasons: string[] } {
  if (!Array.isArray(options) || options.length === 0) {
    return { option: null, reasons: ["통합 옵션 없음"] };
  }

  const picked = options
    .map((option) => {
      const termMonths = normalizeTerm(option);
      const termDiff = termMonths === null ? Number.POSITIVE_INFINITY : Math.abs(termMonths - profile.preferredTerm);
      const appliedRate = optionAppliedRate(option, profile.rateMode);
      const sourceRank = option.sourceId === "finlife" ? 0 : 1;
      return { option, termMonths, termDiff, appliedRate, sourceRank };
    })
    .sort((a, b) => {
      if (a.termDiff !== b.termDiff) return a.termDiff - b.termDiff;
      if (a.appliedRate !== b.appliedRate) return b.appliedRate - a.appliedRate;
      if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
      return (a.option.saveTrm ?? "").localeCompare(b.option.saveTrm ?? "");
    })[0];

  if (!picked) return { option: null, reasons: ["통합 옵션 선택 실패"] };

  const saveTrm = picked.option.saveTrm ?? (picked.termMonths !== null ? String(picked.termMonths) : undefined);
  const normalizedOption: NormalizedOption = {
    save_trm: saveTrm,
    intr_rate: normalizeRate(picked.option.intrRate),
    intr_rate2: normalizeRate(picked.option.intrRate2),
    raw: {
      source: "unified_merged",
      optionSourceId: picked.option.sourceId ?? null,
    },
  };

  const reasons = [`통합 옵션 선택: 선호기간(${profile.preferredTerm}개월) 우선 + ${profile.rateMode} 금리정책`];
  if (picked.termMonths === null) reasons.push("기간 정보 부재로 금리 중심 선택");
  return { option: normalizedOption, reasons };
}

export function unifiedProductsToRecommendCandidates(input: {
  items: UnifiedProductView[];
  profile: Pick<UserRecommendProfile, "preferredTerm" | "rateMode">;
}): Array<RecommendCandidate & { matchedDepositProtection: boolean }> {
  const out: Array<RecommendCandidate & { matchedDepositProtection: boolean }> = [];

  for (const item of input.items) {
    if (item.sourceId !== "finlife" && item.sourceId !== "datago_kdb") continue;
    const picked = pickUnifiedSelectedOption(item.options, input.profile);

    const finPrdtCd = (item.stableId || item.externalKey || "").trim();
    if (!finPrdtCd) continue;

    const product: NormalizedProduct = {
      fin_prdt_cd: finPrdtCd,
      fin_prdt_nm: item.productName || finPrdtCd,
      kor_co_nm: item.providerName || "",
      options: picked.option ? [picked.option] : [],
      raw: {
        source: "unified_merged",
        stableId: item.stableId,
        externalKey: item.externalKey,
        sourceIds: item.sourceIds ?? [item.sourceId],
      },
    };
    ensureProductBest(product);

    out.push({
      sourceId: item.sourceId,
      product,
      badges: [...new Set([...(item.badges ?? []), item.sourceId === "finlife" ? "FINLIFE" : "KDB"])],
      extraReasons: picked.reasons,
      matchedDepositProtection: item.signals?.depositProtection === "matched",
    });
  }

  return out;
}
