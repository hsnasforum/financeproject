import { EMERGENCY_FUND_TARGET_MONTHS } from "../calc/emergencyFundPolicy";

export type PlanningInterpretationPolicy = {
  dsr: {
    cautionPct: number;
    riskPct: number;
  };
  emergencyFundMonths: {
    caution: number;
    risk: number;
  };
  monthlySurplusKrw: {
    cautionMax: number;
    riskMax: number;
  };
  monteCarlo: {
    cautionDepletionPct: number;
    riskDepletionPct: number;
  };
  snapshot: {
    staleCautionDays: number;
    staleRiskDays: number;
  };
  warnings: {
    cautionCount: number;
  };
};

// v2 freeze defaults: update only with explicit release note and regression proof.
export const DEFAULT_PLANNING_POLICY: PlanningInterpretationPolicy = {
  dsr: {
    cautionPct: 30,
    riskPct: 50,
  },
  emergencyFundMonths: {
    // Below the product emergency fund standard is a caution; the stage engine uses the same standard.
    caution: EMERGENCY_FUND_TARGET_MONTHS,
    risk: 1,
  },
  monthlySurplusKrw: {
    cautionMax: 0,
    riskMax: 0,
  },
  monteCarlo: {
    cautionDepletionPct: 10,
    riskDepletionPct: 30,
  },
  snapshot: {
    staleCautionDays: 45,
    staleRiskDays: 120,
  },
  warnings: {
    cautionCount: 8,
  },
};
