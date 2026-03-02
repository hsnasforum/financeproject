import { type ProfileV2 } from "../../../lib/planning/v2/types";

export const PLANNING_DEFAULTS = {
  version: 1,
  emergencyMonths: 6,
  goalPriority: 3,
  debtRemainingMonths: 60,
  debtRepaymentType: "amortizing" as const,
  missingFieldsPolicy: "fill-with-defaults",
  assumptions: {
    inflationPct: 2.0,
    expectedReturnPct: 5.0,
  },
} as const;

export type PlanningDefaultsCode = string;

export function createDefaultsAppliedMetadata(
  codes: PlanningDefaultsCode[],
  appliedAt?: string,
): NonNullable<ProfileV2["defaultsApplied"]> {
  const items = Array.from(new Set(codes.map((code) => code.trim()).filter((code) => code.length > 0)));
  return {
    version: 1,
    items,
    assumptions: {
      emergencyMonths: PLANNING_DEFAULTS.emergencyMonths,
      goalPriority: PLANNING_DEFAULTS.goalPriority,
      missingFieldsPolicy: PLANNING_DEFAULTS.missingFieldsPolicy,
    },
    ...(appliedAt ? { appliedAt } : {}),
  };
}
