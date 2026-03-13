import { describe, expect, it } from "vitest";
import {
  getEngineEnvelope,
  normalizePlanningResponse,
} from "../src/lib/planning/api/contracts";
import {
  getPlanningFallbackUsageSnapshot,
  resetPlanningFallbackUsageSnapshot,
} from "../src/lib/planning/engine";

function sampleEngine() {
  return {
    stage: "DEBT" as const,
    financialStatus: {
      stage: "DEBT" as const,
      trace: {
        savingCapacity: 1_200_000,
        savingRate: 0.3,
        liquidAssets: 3_000_000,
        debtBalance: 8_000_000,
        emergencyFundTarget: 10_000_000,
        emergencyFundGap: 7_000_000,
        triggeredRules: ["debt_balance_positive"],
      },
    },
    stageDecision: {
      priority: "PAY_DEBT" as const,
      investmentAllowed: false,
      warnings: ["부채 정리가 우선입니다."],
    },
  };
}

describe("planning api engine contracts", () => {
  it("requires engine envelope instead of legacy top-level fields", () => {
    resetPlanningFallbackUsageSnapshot();
    const before = getPlanningFallbackUsageSnapshot();

    const engine = sampleEngine();
    expect(() => getEngineEnvelope({
      stage: engine.stage,
      financialStatus: engine.financialStatus,
      stageDecision: engine.stageDecision,
    } as Parameters<typeof getEngineEnvelope>[0])).toThrow("Missing engine envelope");
    const after = getPlanningFallbackUsageSnapshot();

    expect(after.legacyEnvelopeFallbackCount).toBe(before.legacyEnvelopeFallbackCount);
  });

  it("prefers engine envelope when present", () => {
    const engine = sampleEngine();
    const resolved = getEngineEnvelope({
      engine,
      stage: "INVEST" as const,
      financialStatus: {
        stage: "INVEST" as const,
        trace: engine.financialStatus.trace,
      },
      stageDecision: {
        priority: "INVEST" as const,
        investmentAllowed: true,
        warnings: [],
      },
    } as Parameters<typeof getEngineEnvelope>[0]);

    expect(resolved).toBe(engine);
  });

  it("throws when engine envelope is missing", () => {
    resetPlanningFallbackUsageSnapshot();
    const engine = sampleEngine();
    expect(() => getEngineEnvelope({
      stage: engine.stage,
      financialStatus: engine.financialStatus,
      stageDecision: engine.stageDecision,
    } as Parameters<typeof getEngineEnvelope>[0])).toThrow("Missing engine envelope");
    expect(getPlanningFallbackUsageSnapshot().legacyEnvelopeFallbackCount).toBe(0);
  });

  it("throws when neither engine nor legacy fields exist", () => {
    expect(() => getEngineEnvelope({})).toThrow("Missing engine envelope");
  });

  it("normalizes response with engine and schema version defaults", () => {
    const engine = sampleEngine();
    const normalized = normalizePlanningResponse({
      planSummary: { endNetWorthKrw: 100_000_000 },
      engine,
    });

    expect(normalized.engine.stage).toBe("DEBT");
    expect(normalized.engineSchemaVersion).toBe(1);
    expect(normalized.data.engine.stage).toBe("DEBT");
    expect(normalized.data.engineSchemaVersion).toBe(1);
  });
});
