import { describe, expect, it } from "vitest";
import { extractDraftSummaryBands } from "../draftSummaryExtractor";

describe("v3 financeNews draftSummaryExtractor", () => {
  it("extracts categorical bands from numeric summary only", () => {
    const result = extractDraftSummaryBands({
      medianIncomeKrw: 7_200_000,
      medianExpenseKrw: 4_100_000,
      avgNetKrw: 1_900_000,
    });

    expect(result).toEqual({
      incomeBand: "high",
      expenseBand: "high",
      netBand: "high",
      expensePressureBand: "low",
    });
  });

  it("handles constrained cashflow as lower net and higher pressure", () => {
    const result = extractDraftSummaryBands({
      medianIncomeKrw: 2_800_000,
      medianExpenseKrw: 3_200_000,
      avgNetKrw: -150_000,
    });

    expect(result).toEqual({
      incomeBand: "low",
      expenseBand: "med",
      netBand: "low",
      expensePressureBand: "high",
    });
  });

  it("returns unknown bands when summary values are missing", () => {
    const result = extractDraftSummaryBands({});
    expect(result).toEqual({
      incomeBand: "unknown",
      expenseBand: "unknown",
      netBand: "unknown",
      expensePressureBand: "unknown",
    });
  });

  it("ignores raw-like fields and stays deterministic", () => {
    const payload = {
      medianIncomeKrw: 4_000_000,
      medianExpenseKrw: 3_000_000,
      avgNetKrw: 500_000,
      transactions: [{ date: "2026-01-01", memo: "should_be_ignored" }],
      csvText: "raw,csv,should,be,ignored",
    };
    const first = extractDraftSummaryBands(payload);
    const second = extractDraftSummaryBands(payload);

    expect(first).toEqual(second);
    expect(Object.values(first).every((value) => ["low", "med", "high", "unknown"].includes(value))).toBe(true);
  });
});
