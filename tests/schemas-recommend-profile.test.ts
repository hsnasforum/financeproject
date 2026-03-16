import { describe, expect, it } from "vitest";
import {
  defaults,
  fromSearchParams,
  parseRecommendProfile,
} from "../src/lib/schemas/recommendProfile";

describe("recommend profile schema", () => {
  it("uses unified candidates as defaults", () => {
    expect(defaults()).toMatchObject({
      candidatePool: "unified",
      candidateSources: ["finlife", "datago_kdb"],
    });
  });

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
      planningContext: {
        monthlyIncomeKrw: 4_200_000,
        monthlyExpenseKrw: 2_700_000,
        liquidAssetsKrw: 8_000_000,
        debtBalanceKrw: 12_000_000,
      },
      planning: {
        runId: "run_20260316_001",
        summary: {
          stage: "DEBT",
          overallStatus: "SUCCESS",
        },
      },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.value.purpose).toBe("emergency");
    expect(parsed.value.topN).toBe(7);
    expect(parsed.value.candidateSources).toEqual(["finlife", "datago_kdb"]);
    expect(parsed.value.planning?.runId).toBe("run_20260316_001");
    expect(parsed.value.planning?.summary.stage).toBe("DEBT");
    expect(parsed.value.planningContext?.monthlyIncomeKrw).toBe(4_200_000);
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

  it("collects issues for invalid planning handoff", () => {
    const parsed = parseRecommendProfile({
      ...defaults(),
      planning: {
        runId: "",
        summary: {
          stage: "UNKNOWN",
        },
      },
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some((entry) => entry.path === "planning.runId")).toBe(true);
    expect(parsed.issues.some((entry) => entry.path === "planning.summary.stage")).toBe(true);
  });

  it("parses query overrides with pool alias and candidate sources", () => {
    const params = new URLSearchParams(
      "purpose=seed-money&pool=unified&candidateSources=finlife,datago_kdb&topN=5&monthlyIncome=4100000&liquidAssetsKrw=9000000&planning.runId=run_20260316_001&planning.summary.stage=DEBT&planning.summary.overallStatus=SUCCESS",
    );
    const parsed = fromSearchParams(params);

    expect(parsed.ok).toBe(true);
    expect(parsed.value.purpose).toBe("seed-money");
    expect(parsed.value.candidatePool).toBe("unified");
    expect(parsed.value.candidateSources).toEqual(["finlife", "datago_kdb"]);
    expect(parsed.value.planning).toMatchObject({
      runId: "run_20260316_001",
      summary: {
        stage: "DEBT",
        overallStatus: "SUCCESS",
      },
    });
    expect(parsed.value.planningContext?.monthlyIncomeKrw).toBe(4_100_000);
    expect(parsed.value.planningContext?.liquidAssetsKrw).toBe(9_000_000);

    const merged = parseRecommendProfile({
      ...defaults(),
      ...parsed.value,
    });
    expect(merged.ok).toBe(true);
    expect(merged.value.topN).toBe(5);
  });
});
