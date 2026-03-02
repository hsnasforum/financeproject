import { describe, expect, it } from "vitest";
import { buildUserInsight } from "../../../../src/lib/planning/v2/insights/interpret";
import { WARNING_GLOSSARY_KO } from "../../../../src/lib/planning/v2/insights/warningGlossary.ko";

describe("buildUserInsight", () => {
  it("returns risk when worst cash is below or equal to zero", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: -10_000,
        worstCashMonthIndex: 4,
        dsrPct: 30,
        goalsAchievedText: "1/1",
      },
      aggregatedWarnings: [],
      goals: [],
    });

    expect(insight.severity).toBe("risk");
    expect(insight.headline).toContain("현금이 바닥");
  });

  it("returns warn when dsr is in warning range", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: 1_000_000,
        worstCashMonthIndex: 2,
        dsrPct: 45,
        goalsAchievedText: "1/1",
      },
      aggregatedWarnings: [],
      goals: [],
    });

    expect(insight.severity).toBe("warn");
  });

  it("includes high-risk dsr interpretation when dsr is 0.65 ratio input", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: 1_000_000,
        dsrPct: 0.65,
      },
      aggregatedWarnings: [],
      goals: [],
    });

    expect(insight.severity).toBe("risk");
    expect(insight.bullets.join(" ")).toContain("계획이 쉽게 흔들릴 수 있습니다");
  });

  it("includes bottom-cash sentence when worst cash is below zero", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: -1,
        dsrPct: 30,
      },
      aggregatedWarnings: [],
      goals: [],
    });

    expect(insight.bullets.join(" ")).toContain("현금이 바닥나는 달이 있습니다");
  });

  it("includes fixed monte-carlo interpretation for depletion probability 0.32", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: 1_500_000,
        dsrPct: 30,
      },
      aggregatedWarnings: [],
      goals: [],
      monteCarlo: {
        retirementDepletionBeforeEnd: 0.32,
      },
    });

    expect(insight.bullets.join(" ")).toContain("3~4번 중 1번");
  });

  it("translates repeated warning and keeps count/meaning/suggestion", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: 1_000_000,
        dsrPct: 20,
      },
      aggregatedWarnings: [
        {
          code: "CONTRIBUTION_SKIPPED",
          severity: "warn",
          count: 30,
          firstMonth: 0,
          lastMonth: 29,
          sampleMessage: "skipped",
        },
      ],
      goals: [],
    });

    const row = insight.translatedWarnings.find((warning) => warning.code === "CONTRIBUTION_SKIPPED");
    expect(row).toBeTruthy();
    expect(row?.count).toBe(30);
    expect(row?.meaning.length ?? 0).toBeGreaterThan(0);
    expect(row?.suggestion.length ?? 0).toBeGreaterThan(0);
    expect(row?.months?.first).toBe(0);
    expect(row?.months?.last).toBe(29);
  });

  it("reflects very stale snapshot as warn severity", () => {
    const insight = buildUserInsight({
      summary: {
        worstCashKrw: 2_000_000,
        dsrPct: 25,
      },
      aggregatedWarnings: [],
      goals: [],
      snapshotMeta: {
        staleDays: 200,
      },
    });

    expect(insight.severity).toBe("warn");
    expect(insight.bullets.join(" ")).toContain("스냅샷");
  });
});

describe("warning glossary coverage", () => {
  it("contains required codes", () => {
    const requiredCodes = [
      "NEGATIVE_CASHFLOW",
      "HIGH_DEBT_SERVICE",
      "EMERGENCY_FUND_SHORT",
      "GOAL_MISSED",
      "RETIREMENT_SHORT",
      "CONTRIBUTION_SKIPPED",
      "SNAPSHOT_MISSING",
      "SNAPSHOT_STALE",
      "SNAPSHOT_VERY_STALE",
      "OPTIMISTIC_RETURN_HIGH",
    ];

    for (const code of requiredCodes) {
      expect(WARNING_GLOSSARY_KO[code]).toBeTruthy();
    }
  });
});
