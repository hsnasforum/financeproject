import { describe, expect, it } from "vitest";
import {
  buildRecommendResultSnapshot,
  computeRecommendResultDelta,
} from "../src/lib/recommend/resultHistory";

describe("recommend result history", () => {
  it("creates baseline delta on first run", () => {
    const current = buildRecommendResultSnapshot({
      savedAt: "2026-02-25T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      items: [
        {
          finPrdtCd: "A",
          productName: "상품A",
          providerName: "은행A",
          selectedOption: { saveTrm: "12", appliedRate: 3.2 },
        },
      ],
    });

    const delta = computeRecommendResultDelta(null, current);

    expect(delta.hasPrevious).toBe(false);
    expect(delta.currentTopRate).toBe(3.2);
    expect(delta.newItems).toHaveLength(1);
    expect(delta.rankChanges).toHaveLength(0);
    expect(delta.optionChanges).toHaveLength(0);
  });

  it("detects rank/option/rate/new/dropped changes", () => {
    const previous = buildRecommendResultSnapshot({
      savedAt: "2026-02-24T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      items: [
        {
          finPrdtCd: "A",
          productName: "상품A",
          providerName: "은행A",
          selectedOption: { saveTrm: "12", appliedRate: 3.1 },
        },
        {
          finPrdtCd: "B",
          productName: "상품B",
          providerName: "은행B",
          selectedOption: { saveTrm: "24", appliedRate: 3.0 },
        },
      ],
    });

    const current = buildRecommendResultSnapshot({
      savedAt: "2026-02-25T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      items: [
        {
          finPrdtCd: "B",
          productName: "상품B",
          providerName: "은행B",
          selectedOption: { saveTrm: "12", appliedRate: 3.4 },
        },
        {
          finPrdtCd: "C",
          productName: "상품C",
          providerName: "은행C",
          selectedOption: { saveTrm: "6", appliedRate: 3.2 },
        },
      ],
    });

    const delta = computeRecommendResultDelta(previous, current);

    expect(delta.hasPrevious).toBe(true);
    expect(delta.rateDiffPct).toBeCloseTo(0.3, 6);
    expect(delta.rankChanges).toHaveLength(1);
    expect(delta.rankChanges[0]?.finPrdtCd).toBe("B");
    expect(delta.optionChanges).toHaveLength(1);
    expect(delta.optionChanges[0]?.finPrdtCd).toBe("B");
    expect(delta.newItems.map((row) => row.finPrdtCd)).toEqual(["C"]);
    expect(delta.droppedItems.map((row) => row.finPrdtCd)).toEqual(["A"]);
  });

  it("uses sourceId + finPrdtCd as identity key", () => {
    const previous = buildRecommendResultSnapshot({
      savedAt: "2026-02-24T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      items: [
        {
          sourceId: "finlife",
          finPrdtCd: "A",
          productName: "상품A",
          providerName: "은행A",
          selectedOption: { saveTrm: "12", appliedRate: 3.1 },
        },
      ],
    });

    const current = buildRecommendResultSnapshot({
      savedAt: "2026-02-25T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      items: [
        {
          sourceId: "datago_kdb",
          finPrdtCd: "A",
          productName: "상품A-외부",
          providerName: "은행A",
          selectedOption: { saveTrm: "12", appliedRate: 3.2 },
        },
      ],
    });

    const delta = computeRecommendResultDelta(previous, current);
    expect(delta.optionChanges).toHaveLength(0);
    expect(delta.rankChanges).toHaveLength(0);
    expect(delta.newItems).toHaveLength(1);
    expect(delta.newItems[0]?.sourceId).toBe("datago_kdb");
    expect(delta.droppedItems).toHaveLength(1);
    expect(delta.droppedItems[0]?.sourceId).toBe("finlife");
  });

  it("stores snapshot meta when provided", () => {
    const snapshot = buildRecommendResultSnapshot({
      savedAt: "2026-02-25T00:00:00.000Z",
      profile: {
        purpose: "seed-money",
        kind: "deposit",
        preferredTerm: 12,
        liquidityPref: "mid",
        rateMode: "max",
        topN: 5,
      },
      meta: {
        kind: "deposit",
        topN: 5,
        rateMode: "max",
        candidateSources: ["finlife"],
        depositProtection: "any",
        weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
        assumptions: {
          rateSelectionPolicy: "테스트 정책",
          liquidityPolicy: "테스트 정책",
          normalizationPolicy: "테스트 정책",
        },
      },
      items: [],
    });

    expect(snapshot.meta?.kind).toBe("deposit");
    expect(snapshot.meta?.weights.rate).toBeCloseTo(0.55, 6);
    expect(snapshot.meta?.assumptions?.normalizationPolicy).toBe("테스트 정책");
  });
});
