import { describe, expect, it } from "vitest";
import {
  assessAssumptionsHealth,
  assessRiskAssumptionConsistency,
  combineAssumptionsHealth,
} from "../../src/lib/planning/v2/assumptionsHealth";
import { type AssumptionsV2 } from "../../src/lib/planning/v2/scenarios";

function baseAssumptions(overrides?: Partial<AssumptionsV2>): AssumptionsV2 {
  return {
    inflationPct: 2,
    investReturnPct: 5,
    cashReturnPct: 2,
    withdrawalRatePct: 4,
    debtRates: {},
    ...overrides,
  };
}

describe("assumptionsHealth", () => {
  it("returns SNAPSHOT_MISSING when snapshot meta is missing", () => {
    const result = assessAssumptionsHealth({
      assumptions: baseAssumptions(),
      snapshotMeta: { missing: true },
      nowIso: "2026-02-28T00:00:00.000Z",
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "SNAPSHOT_MISSING",
        severity: "warn",
      }),
    ]);
    expect(result.flags.snapshotMissing).toBe(true);
  });

  it("returns SNAPSHOT_VERY_STALE critical warning when fetchedAt is older than 120 days", () => {
    const result = assessAssumptionsHealth({
      assumptions: baseAssumptions(),
      snapshotMeta: {
        asOf: "2025-08-01",
        fetchedAt: "2025-08-12T00:00:00.000Z",
        missing: false,
      },
      nowIso: "2026-02-28T00:00:00.000Z",
    });

    const warning = result.warnings.find((entry) => entry.code === "SNAPSHOT_VERY_STALE");
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("critical");
    expect(Number(warning?.data?.days)).toBeGreaterThan(120);
  });

  it("returns OPTIMISTIC_RETURN_HIGH critical warning when investReturnPct is 15 or higher", () => {
    const result = assessAssumptionsHealth({
      assumptions: baseAssumptions({ investReturnPct: 15 }),
      snapshotMeta: {
        asOf: "2026-02-01",
        fetchedAt: "2026-02-01T00:00:00.000Z",
        missing: false,
      },
      nowIso: "2026-02-28T00:00:00.000Z",
    });

    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "OPTIMISTIC_RETURN_HIGH",
      severity: "critical",
    }));
  });

  it("returns critical RISK_ASSUMPTION_MISMATCH for low risk with investReturnPct >= 10", () => {
    const health = assessAssumptionsHealth({
      assumptions: baseAssumptions({ investReturnPct: 10 }),
      snapshotMeta: {
        asOf: "2026-02-20",
        fetchedAt: "2026-02-20T00:00:00.000Z",
      },
      nowIso: "2026-02-28T00:00:00.000Z",
    });
    const riskWarnings = assessRiskAssumptionConsistency("low", baseAssumptions({ investReturnPct: 10 }));
    const combined = combineAssumptionsHealth(health, riskWarnings);

    expect(riskWarnings).toContainEqual(expect.objectContaining({
      code: "RISK_ASSUMPTION_MISMATCH",
      severity: "critical",
    }));
    expect(combined.summary.criticalCount).toBeGreaterThanOrEqual(1);
    expect(combined.summary.warningCodes).toContain("RISK_ASSUMPTION_MISMATCH");
  });
});
