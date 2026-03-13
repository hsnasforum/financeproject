import { describe, expect, it } from "vitest";
import { parseKdbRateAndTerm } from "../src/lib/recommend/external/kdb";
import { applyDepositProtectionPolicy } from "../src/lib/recommend/depositProtection";
import { type RecommendedItem } from "../src/lib/recommend/types";

describe("KDB recommend parsing", () => {
  it("parses hitIrtCndCone with explicit year term", () => {
    const parsed = parseKdbRateAndTerm({
      hitIrtCndCone: "3.35% (3년)",
      prdJinTrmCone: "1년이상~3년이하(연단위)",
    });

    expect(parsed.options.length).toBe(1);
    expect(parsed.options[0]?.ratePct).toBe(3.35);
    expect(parsed.options[0]?.termMonths).toBe(36);
  });

  it("creates assumed canonical terms when only range is available", () => {
    const parsed = parseKdbRateAndTerm({
      hitIrtCndCone: "0.90% (3억원이하)",
      prdJinTrmCone: "1년이상~3년이하(연단위)",
    });

    const months = parsed.options.map((opt) => opt.termMonths);
    expect(months).toEqual([12, 24, 36]);
    expect(parsed.options.every((opt) => opt.ratePct === 0.9)).toBe(true);
    expect(parsed.notes.join(" ")).toContain("가정");
  });
});

describe("deposit protection policy", () => {
  function item(input: Partial<RecommendedItem> & Pick<RecommendedItem, "finPrdtCd" | "sourceId">): RecommendedItem {
    return {
      sourceId: input.sourceId,
      kind: "deposit",
      finPrdtCd: input.finPrdtCd,
      providerName: "테스트은행",
      productName: input.finPrdtCd,
      finalScore: input.finalScore ?? 0.5,
      selectedOption: {
        saveTrm: "12",
        termMonths: 12,
        appliedRate: 3,
        baseRate: 3,
        maxRate: 3,
        rateSource: "intr_rate",
        reasons: [],
      },
      breakdown: [],
      reasons: [],
      ...(input.badges ? { badges: input.badges } : {}),
      ...(input.signals ? { signals: input.signals } : {}),
    };
  }

  it("adds bonus to matched items in prefer mode", () => {
    const out = applyDepositProtectionPolicy({
      mode: "prefer",
      matchedFinPrdtCdSet: new Set(["A"]),
      items: [item({ sourceId: "finlife", finPrdtCd: "A", finalScore: 0.5 }), item({ sourceId: "finlife", finPrdtCd: "B", finalScore: 0.5 })],
      bonus: 0.05,
    });

    expect(out.length).toBe(2);
    expect(out[0]?.finPrdtCd).toBe("A");
    expect(out[0]?.finalScore).toBeCloseTo(0.55, 6);
    expect(out[0]?.signals?.depositProtection).toBe("matched");
    expect(out[1]?.signals?.depositProtection).toBe("unknown");
  });

  it("filters unmatched items in require mode", () => {
    const out = applyDepositProtectionPolicy({
      mode: "require",
      matchedFinPrdtCdSet: new Set(["A"]),
      items: [item({ sourceId: "finlife", finPrdtCd: "A" }), item({ sourceId: "finlife", finPrdtCd: "B" }), item({ sourceId: "datago_kdb", finPrdtCd: "KDB:1" })],
    });

    expect(out.map((row) => row.finPrdtCd)).toEqual(["A"]);
  });
});
