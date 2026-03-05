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
  it("increments legacy envelope fallback counter when top-level fields are used", () => {
    resetPlanningFallbackUsageSnapshot();
    const before = getPlanningFallbackUsageSnapshot();

    const engine = sampleEngine();
    const resolved = getEngineEnvelope({
      stage: engine.stage,
      financialStatus: engine.financialStatus,
      stageDecision: engine.stageDecision,
    });
    const after = getPlanningFallbackUsageSnapshot();

    expect(resolved.stage).toBe("DEBT");
    expect(after.legacyEnvelopeFallbackCount).toBe(before.legacyEnvelopeFallbackCount + 1);
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
    });

    expect(resolved).toBe(engine);
  });

  it("falls back to legacy top-level fields when engine is missing", () => {
    resetPlanningFallbackUsageSnapshot();
    const engine = sampleEngine();
    const resolved = getEngineEnvelope({
      stage: engine.stage,
      financialStatus: engine.financialStatus,
      stageDecision: engine.stageDecision,
    });

    expect(resolved.stage).toBe("DEBT");
    expect(resolved.stageDecision.priority).toBe("PAY_DEBT");
    expect(getPlanningFallbackUsageSnapshot().legacyEnvelopeFallbackCount).toBe(1);
  });

  it("throws when neither engine nor legacy fields exist", () => {
    expect(() => getEngineEnvelope({})).toThrow("Missing engine envelope");
  });

  it("normalizes response with engine and schema version defaults", () => {
    const normalized = normalizePlanningResponse({
      planSummary: { endNetWorthKrw: 100_000_000 },
      stage: "DEBT" as const,
      financialStatus: sampleEngine().financialStatus,
      stageDecision: sampleEngine().stageDecision,
    });

    expect(normalized.engine.stage).toBe("DEBT");
    expect(normalized.engineSchemaVersion).toBe(1);
    expect(normalized.data.engine.stage).toBe("DEBT");
    expect(normalized.data.engineSchemaVersion).toBe(1);
  });
});
