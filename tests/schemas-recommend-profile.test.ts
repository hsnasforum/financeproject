import { describe, expect, it } from "vitest";
import {
  defaults,
  fromSearchParams,
  parseRecommendProfile,
} from "../src/lib/schemas/recommendProfile";

describe("recommend profile schema", () => {
  it("parses valid profile input", () => {
    const parsed = parseRecommendProfile({
      purpose: "emergency",
      kind: "deposit",
      preferredTerm: 6,
      liquidityPref: "high",
      rateMode: "max",
      topN: 7,
      candidatePool: "unified",
      candidateSources: ["finlife", "datago_kdb"],
      depositProtection: "prefer",
      weights: {
        rate: 0.6,
        term: 0.25,
        liquidity: 0.15,
      },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.value.purpose).toBe("emergency");
    expect(parsed.value.topN).toBe(7);
    expect(parsed.value.candidateSources).toEqual(["finlife", "datago_kdb"]);
  });

  it("collects issues for invalid values", () => {
    const parsed = parseRecommendProfile({
      kind: "loan",
      topN: 999,
      preferredTerm: 5,
      weights: {
        rate: 2,
      },
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some((entry) => entry.path === "kind")).toBe(true);
    expect(parsed.issues.some((entry) => entry.path === "topN")).toBe(true);
    expect(parsed.issues.some((entry) => entry.path === "preferredTerm")).toBe(true);
    expect(parsed.issues.some((entry) => entry.path === "weights.rate")).toBe(true);
  });

  it("parses query overrides with pool alias and candidate sources", () => {
    const params = new URLSearchParams("purpose=seed-money&pool=unified&candidateSources=finlife,datago_kdb&topN=5");
    const parsed = fromSearchParams(params);

    expect(parsed.ok).toBe(true);
    expect(parsed.value.purpose).toBe("seed-money");
    expect(parsed.value.candidatePool).toBe("unified");
    expect(parsed.value.candidateSources).toEqual(["finlife", "datago_kdb"]);

    const merged = parseRecommendProfile({
      ...defaults(),
      ...parsed.value,
    });
    expect(merged.ok).toBe(true);
    expect(merged.value.topN).toBe(5);
  });
});
