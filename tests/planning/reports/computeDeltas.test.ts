import { describe, expect, it } from "vitest";
import { computeDeltaNumber, computeReportDeltas } from "../../../src/lib/planning/reports/computeDeltas";

describe("computeDeltaNumber", () => {
  it("returns up/down/flat directions correctly", () => {
    expect(computeDeltaNumber(120, 100)).toEqual({ delta: 20, direction: "up" });
    expect(computeDeltaNumber(90, 100)).toEqual({ delta: -10, direction: "down" });
    expect(computeDeltaNumber(100, 100)).toEqual({ delta: 0, direction: "flat" });
  });

  it("returns null when either side is missing", () => {
    expect(computeDeltaNumber(undefined, 100)).toBeNull();
    expect(computeDeltaNumber(100, undefined)).toBeNull();
  });
});

describe("computeReportDeltas", () => {
  it("builds deterministic delta rows for configured metrics", () => {
    const deltas = computeReportDeltas(
      {
        summaryCards: {
          monthlySurplusKrw: 420_000,
          dsrPct: 28,
          emergencyFundMonths: 4.2,
          endNetWorthKrw: 95_000_000,
          worstCashKrw: 3_000_000,
          totalWarnings: 2,
        },
      },
      {
        summaryCards: {
          monthlySurplusKrw: 300_000,
          dsrPct: 31,
          emergencyFundMonths: 3.8,
          endNetWorthKrw: 90_000_000,
          worstCashKrw: 2_500_000,
          totalWarnings: 4,
        },
      },
    );

    expect(deltas.map((item) => item.key)).toEqual([
      "monthlySurplus",
      "dsrPct",
      "emergencyMonths",
      "endNetWorthKrw",
      "worstCashKrw",
      "warningsCount",
    ]);
    expect(deltas.find((item) => item.key === "monthlySurplus")?.direction).toBe("up");
    expect(deltas.find((item) => item.key === "dsrPct")?.direction).toBe("down");
    expect(deltas.find((item) => item.key === "warningsCount")?.delta).toBe(-2);
  });

  it("omits rows when either current or baseline values are unavailable", () => {
    const deltas = computeReportDeltas(
      { summaryCards: { monthlySurplusKrw: 200_000, totalWarnings: 3 } },
      { summaryCards: { totalWarnings: 3 } },
    );
    expect(deltas.map((item) => item.key)).toEqual(["warningsCount"]);
    expect(deltas[0]?.direction).toBe("flat");
  });
});
