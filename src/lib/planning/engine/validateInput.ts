import type { EngineInput } from "./types";

const NON_NEGATIVE_FIELDS = [
  "monthlyIncome",
  "monthlyExpense",
  "age",
  "liquidAssets",
  "debtBalance",
  "emergencyFundMonths",
] as const;

export function validateEngineInput(input: EngineInput): EngineInput {
  if (input.monthlyIncome == null) {
    throw new Error("monthlyIncome is required");
  }

  if (input.monthlyExpense == null) {
    throw new Error("monthlyExpense is required");
  }

  for (const field of NON_NEGATIVE_FIELDS) {
    const value = input[field];
    if (value == null) continue;

    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }

    if (value < 0) {
      throw new Error(`${field} must be greater than or equal to 0`);
    }
  }

  return {
    ...input,
    emergencyFundMonths: input.emergencyFundMonths ?? 6,
    liquidAssets: input.liquidAssets ?? 0,
    debtBalance: input.debtBalance ?? 0,
  };
}
