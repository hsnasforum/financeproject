import { describe, expect, it } from "vitest";
import { recommendFinlifeProducts } from "../src/lib/recommend/score";
import { type NormalizedProduct } from "../src/lib/finlife/types";
import { type UserRecommendProfile } from "../src/lib/recommend/types";

function makeProduct(input: {
  code: string;
  name: string;
  term: string;
  intrRate: number | null;
  intrRate2: number | null;
  createdAt?: string;
  updatedAt?: string;
}): NormalizedProduct {
  return {
    fin_prdt_cd: input.code,
    fin_prdt_nm: input.name,
    kor_co_nm: "테스트은행",
    raw: {
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
    options: [
      {
        save_trm: input.term,
        intr_rate: input.intrRate,
        intr_rate2: input.intrRate2,
        raw: {},
      },
    ],
  };
}

function run(products: NormalizedProduct[], profile: Partial<UserRecommendProfile> = {}) {
  const base: UserRecommendProfile = {
    purpose: "seed-money",
    kind: "deposit",
    preferredTerm: 12,
    liquidityPref: "mid",
    rateMode: "max",
    topN: 10,
  };
  return recommendFinlifeProducts({
    kind: "deposit",
    products,
    profile: { ...base, ...profile },
  }).items;
}

describe("recommend score engine", () => {
  it("ranks closer term higher when rates are same", () => {
    const products = [
      makeProduct({ code: "A", name: "A", term: "12", intrRate: 2.5, intrRate2: 2.8 }),
      makeProduct({ code: "B", name: "B", term: "36", intrRate: 2.5, intrRate2: 2.8 }),
    ];

    const ranked = run(products, { preferredTerm: 12, liquidityPref: "mid", rateMode: "max" });
    expect(ranked[0]?.finPrdtCd).toBe("A");
    expect(ranked[0]?.breakdown.find((part) => part.key === "term")?.contribution).toBeGreaterThan(
      ranked[1]?.breakdown.find((part) => part.key === "term")?.contribution ?? 0,
    );
  });

  it("changes ranking by rate mode (max vs base)", () => {
    const products = [
      makeProduct({ code: "MAX", name: "Max 우위", term: "12", intrRate: 2.4, intrRate2: 4.0 }),
      makeProduct({ code: "BASE", name: "Base 우위", term: "12", intrRate: 3.2, intrRate2: 3.2 }),
    ];

    const rankedByMax = run(products, { rateMode: "max" });
    const rankedByBase = run(products, { rateMode: "base" });

    expect(rankedByMax[0]?.finPrdtCd).toBe("MAX");
    expect(rankedByBase[0]?.finPrdtCd).toBe("BASE");
  });

  it("applies stronger long-term penalty when liquidity preference is high", () => {
    const products = [
      makeProduct({ code: "SHORT", name: "단기", term: "6", intrRate: 2.8, intrRate2: 3.0 }),
      makeProduct({ code: "LONG", name: "장기", term: "36", intrRate: 2.8, intrRate2: 3.0 }),
    ];

    const ranked = run(products, { liquidityPref: "high", preferredTerm: 12 });
    expect(ranked[0]?.finPrdtCd).toBe("SHORT");

    const shortPenalty = ranked.find((item) => item.finPrdtCd === "SHORT")?.breakdown.find((part) => part.key === "liquidity")?.contribution ?? 0;
    const longPenalty = ranked.find((item) => item.finPrdtCd === "LONG")?.breakdown.find((part) => part.key === "liquidity")?.contribution ?? 0;
    expect(shortPenalty).toBeGreaterThan(longPenalty);
  });

  it("is deterministic regardless of created/updated metadata", () => {
    const baseProducts = [
      makeProduct({ code: "A", name: "A", term: "12", intrRate: 2.8, intrRate2: 3.1 }),
      makeProduct({ code: "B", name: "B", term: "24", intrRate: 2.7, intrRate2: 3.0 }),
    ];
    const stampedProducts = [
      makeProduct({ code: "A", name: "A", term: "12", intrRate: 2.8, intrRate2: 3.1, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeProduct({ code: "B", name: "B", term: "24", intrRate: 2.7, intrRate2: 3.0, createdAt: "2024-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];

    const plainRanked = run(baseProducts).map((item) => item.finPrdtCd);
    const stampedRanked = run(stampedProducts).map((item) => item.finPrdtCd);

    expect(stampedRanked).toEqual(plainRanked);
  });
});
