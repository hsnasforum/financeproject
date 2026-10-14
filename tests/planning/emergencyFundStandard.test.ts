import { describe, expect, it } from "vitest";
import { EMERGENCY_FUND_TARGET_MONTHS } from "@/lib/planning/calc/emergencyFundPolicy";
import { DEFAULT_PLANNING_POLICY } from "@/lib/planning/catalog/planningPolicy";
import { POLICY_PRESETS } from "@/lib/planning/core/v2/policy/presets";
import { determineFinancialStatus } from "@/lib/planning/engine/financialStatus";
import { validateEngineInput } from "@/lib/planning/engine/validateInput";

describe("emergency fund standard", () => {
  it("uses six months of living expenses as the single product standard", () => {
    expect(EMERGENCY_FUND_TARGET_MONTHS).toBe(6);
  });

  it("aligns every allocation preset with the standard", () => {
    for (const preset of Object.values(POLICY_PRESETS)) {
      expect(preset.rules.minEmergencyMonths, preset.id).toBe(EMERGENCY_FUND_TARGET_MONTHS);
    }
  });

  it("treats anything below the standard as an interpretation caution", () => {
    expect(DEFAULT_PLANNING_POLICY.emergencyFundMonths.caution).toBe(EMERGENCY_FUND_TARGET_MONTHS);
    expect(DEFAULT_PLANNING_POLICY.emergencyFundMonths.risk).toBeLessThan(EMERGENCY_FUND_TARGET_MONTHS);
  });

  it("keeps the stage engine boundary on the same standard", () => {
    const base = { monthlyIncome: 3_000_000, monthlyExpense: 1_000_000, debtBalance: 0 };

    const justBelow = determineFinancialStatus({ ...base, liquidAssets: 5_999_999 });
    expect(justBelow.stage).toBe("EMERGENCY");
    expect(justBelow.trace.emergencyFundTarget).toBe(6_000_000);
    expect(justBelow.trace.emergencyFundGap).toBe(1);

    expect(determineFinancialStatus({ ...base, liquidAssets: 6_000_000 }).stage).toBe("INVEST");
    expect(validateEngineInput({ ...base, liquidAssets: 0 }).emergencyFundMonths).toBe(EMERGENCY_FUND_TARGET_MONTHS);
  });

  it("does not create an emergency target when monthly expenses are zero", () => {
    const status = determineFinancialStatus({ monthlyIncome: 0, monthlyExpense: 0, liquidAssets: 0, debtBalance: 0 });

    expect(status.trace.emergencyFundTarget).toBe(0);
    expect(status.stage).toBe("INVEST");
  });
});
