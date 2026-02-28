import { describe, expect, it } from "vitest";
import { buildCacheKey } from "../../src/lib/planning/cache/key";

describe("planning cache key", () => {
  it("generates same key for semantically identical objects with different key order", () => {
    const a = buildCacheKey({
      kind: "simulate",
      profile: {
        monthlyIncomeNet: 4_000_000,
        debts: [{ id: "d1", balance: 100, minimumPayment: 10, name: "Debt" }],
      },
      horizonMonths: 120,
      baseAssumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      overrides: { cashReturnPct: 2.5 },
      options: { seed: 12345, paths: 1000, includeProducts: false },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T10:00:00.000Z", missing: false },
    });

    const b = buildCacheKey({
      kind: "simulate",
      profile: {
        debts: [{ minimumPayment: 10, name: "Debt", id: "d1", balance: 100 }],
        monthlyIncomeNet: 4_000_000,
      },
      horizonMonths: 120,
      baseAssumptions: {
        debtRates: {},
        withdrawalRatePct: 4,
        cashReturnPct: 2,
        investReturnPct: 5,
        inflationPct: 2,
      },
      overrides: { cashReturnPct: 2.5 },
      options: { includeProducts: false, paths: 1000, seed: 12345 },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T20:00:00.000Z", missing: false },
    });

    expect(a.key).toBe(b.key);
    expect(a.assumptionsHash).toBe(b.assumptionsHash);
    expect(a.optionsHash).toBe(b.optionsHash);
  });

  it("ignores fetchedAt-only snapshot changes but reacts to overrides and options", () => {
    const base = buildCacheKey({
      kind: "monteCarlo",
      profile: { a: 1 },
      horizonMonths: 360,
      baseAssumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T10:00:00.000Z", missing: false },
      options: { seed: 1, paths: 500 },
    });

    const fetchedAtOnly = buildCacheKey({
      kind: "monteCarlo",
      profile: { a: 1 },
      horizonMonths: 360,
      baseAssumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T11:00:00.000Z", missing: false },
      options: { seed: 1, paths: 500 },
    });

    const changedSeed = buildCacheKey({
      kind: "monteCarlo",
      profile: { a: 1 },
      horizonMonths: 360,
      baseAssumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T10:00:00.000Z", missing: false },
      options: { seed: 2, paths: 500 },
    });

    const changedOverride = buildCacheKey({
      kind: "monteCarlo",
      profile: { a: 1 },
      horizonMonths: 360,
      baseAssumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      overrides: { investReturnPct: 6 },
      snapshotMeta: { asOf: "2026-02-28", fetchedAt: "2026-02-28T10:00:00.000Z", missing: false },
      options: { seed: 1, paths: 500 },
    });

    expect(base.key).toBe(fetchedAtOnly.key);
    expect(base.key).not.toBe(changedSeed.key);
    expect(base.key).not.toBe(changedOverride.key);
  });
});
