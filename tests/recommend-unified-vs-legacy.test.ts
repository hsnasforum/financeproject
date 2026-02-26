import { describe, expect, it } from "vitest";
import { recommendCandidates, type RecommendCandidate } from "../src/lib/recommend/score";
import { unifiedProductsToRecommendCandidates } from "../src/lib/recommend/unifiedAdapter";
import { type UserRecommendProfile } from "../src/lib/recommend/types";
import { type UnifiedProductView } from "../src/lib/sources/unified";

const PROFILE: UserRecommendProfile = {
  purpose: "seed-money",
  kind: "deposit",
  preferredTerm: 12,
  liquidityPref: "mid",
  rateMode: "max",
  topN: 5,
  candidateSources: ["finlife"],
  candidatePool: "legacy",
};

function legacyCandidates(): RecommendCandidate[] {
  return [
    {
      sourceId: "finlife",
      product: {
        fin_prdt_cd: "FIN-A",
        fin_prdt_nm: "A예금",
        kor_co_nm: "가은행",
        raw: {},
        options: [
          { save_trm: "12", intr_rate: 3.0, intr_rate2: 3.5, raw: {} },
          { save_trm: "24", intr_rate: 3.1, intr_rate2: 3.4, raw: {} },
        ],
      },
      badges: ["FINLIFE"],
    },
    {
      sourceId: "finlife",
      product: {
        fin_prdt_cd: "FIN-B",
        fin_prdt_nm: "B예금",
        kor_co_nm: "나은행",
        raw: {},
        options: [
          { save_trm: "12", intr_rate: 2.8, intr_rate2: 3.2, raw: {} },
          { save_trm: "24", intr_rate: 3.2, intr_rate2: 3.6, raw: {} },
        ],
      },
      badges: ["FINLIFE"],
    },
  ];
}

function unifiedItems(): UnifiedProductView[] {
  return [
    {
      stableId: "FIN-A",
      sourceId: "finlife",
      kind: "deposit",
      externalKey: "FIN-A",
      providerName: "가은행",
      productName: "A예금",
      options: [
        { sourceId: "finlife", termMonths: 12, saveTrm: "12", intrRate: 3.0, intrRate2: 3.5 },
        { sourceId: "finlife", termMonths: 24, saveTrm: "24", intrRate: 3.1, intrRate2: 3.4 },
      ],
    },
    {
      stableId: "FIN-B",
      sourceId: "finlife",
      kind: "deposit",
      externalKey: "FIN-B",
      providerName: "나은행",
      productName: "B예금",
      options: [
        { sourceId: "finlife", termMonths: 12, saveTrm: "12", intrRate: 2.8, intrRate2: 3.2 },
        { sourceId: "finlife", termMonths: 24, saveTrm: "24", intrRate: 3.2, intrRate2: 3.6 },
      ],
    },
  ];
}

describe("recommend unified vs legacy", () => {
  it("keeps top recommendation deterministic for finlife-only pool", () => {
    const legacy = recommendCandidates({
      kind: "deposit",
      profile: PROFILE,
      candidates: legacyCandidates(),
    });
    const unified = recommendCandidates({
      kind: "deposit",
      profile: { ...PROFILE, candidatePool: "unified" },
      candidates: unifiedProductsToRecommendCandidates({
        items: unifiedItems(),
        profile: { preferredTerm: PROFILE.preferredTerm, rateMode: PROFILE.rateMode },
      }),
    });

    expect(legacy.items[0]?.finPrdtCd).toBe(unified.items[0]?.finPrdtCd);
    expect(legacy.items[0]?.selectedOption.saveTrm).toBe(unified.items[0]?.selectedOption.saveTrm);
    expect(Math.abs((legacy.items[0]?.finalScore ?? 0) - (unified.items[0]?.finalScore ?? 0))).toBeLessThanOrEqual(0.25);
  });
});
