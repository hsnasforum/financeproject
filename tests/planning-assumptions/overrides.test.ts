import { describe, expect, it } from "vitest";
import {
  mergeAssumptions,
  mergeAssumptionsWithProvenance,
  normalizeAssumptionsOverrides,
  toAssumptionsOverridesFromRecord,
  type AssumptionsOverrideEntry,
} from "../../src/lib/planning/assumptions/overrides";

describe("assumptions overrides", () => {
  it("merges overrides deterministically regardless of input order", () => {
    const snapshotAssumptions = {
      inflationPct: 2.1,
      investReturnPct: 4.8,
      cashReturnPct: 2.2,
      withdrawalRatePct: 4,
      debtRates: {},
    };

    const unordered: AssumptionsOverrideEntry[] = [
      { key: "investReturnPct", value: 5.4, reason: "manual tuning", updatedAt: "2026-03-02T10:00:00.000Z" },
      { key: "inflationPct", value: 2.9, reason: "macro update", updatedAt: "2026-03-02T11:00:00.000Z" },
      { key: "investReturnPct", value: 4.2, reason: "older", updatedAt: "2026-03-01T11:00:00.000Z" },
    ];

    const reversed = [...unordered].reverse();

    const mergedA = mergeAssumptions(snapshotAssumptions, unordered);
    const mergedB = mergeAssumptions(snapshotAssumptions, reversed as never[]);

    expect(mergedA).toEqual(mergedB);
    expect(mergedA.inflationPct).toBe(2.9);
    expect(mergedA.investReturnPct).toBe(5.4);
  });

  it("normalizes legacy decimal override values from request record", () => {
    const overrides = toAssumptionsOverridesFromRecord({
      inflation: 0.023,
      expectedReturn: 0.051,
      cashReturnPct: 2.4,
      withdrawalRatePct: 4,
    }, {
      reasonPrefix: "run assumptionsOverride",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });

    const byKey = new Map(overrides.map((entry) => [entry.key, entry.value]));
    expect(byKey.get("inflationPct")).toBe(2.3);
    expect(byKey.get("investReturnPct")).toBe(5.1);
    expect(byKey.get("cashReturnPct")).toBe(2.4);
    expect(byKey.get("withdrawalRatePct")).toBe(4);
  });

  it("returns applied overrides list with one latest row per key", () => {
    const applied = normalizeAssumptionsOverrides([
      { key: "inflationPct", value: 2.4, reason: "old", updatedAt: "2026-03-01T00:00:00.000Z" },
      { key: "inflationPct", value: 2.6, reason: "new", updatedAt: "2026-03-02T00:00:00.000Z" },
      { key: "cashReturnPct", value: 2.1, reason: "cash", updatedAt: "2026-03-02T00:00:00.000Z" },
    ]);

    expect(applied).toEqual([
      expect.objectContaining({ key: "inflationPct", value: 2.6, reason: "new" }),
      expect.objectContaining({ key: "cashReturnPct", value: 2.1, reason: "cash" }),
    ]);

    const merged = mergeAssumptionsWithProvenance({
      inflationPct: 2,
      investReturnPct: 5,
      cashReturnPct: 2,
      withdrawalRatePct: 4,
      debtRates: {},
    }, applied);

    expect(merged.appliedOverrides).toHaveLength(2);
    expect(merged.effectiveAssumptions.inflationPct).toBe(2.6);
    expect(merged.effectiveAssumptions.cashReturnPct).toBe(2.1);
  });
});
