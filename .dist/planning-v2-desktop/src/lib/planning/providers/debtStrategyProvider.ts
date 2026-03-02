import { computeDebtStrategy } from "../v2/debt/strategy";
import { type DebtStrategyInput, type DebtStrategyResult } from "../v2/debt/types";

export type DebtStrategyProvider = {
  compute(input: DebtStrategyInput): DebtStrategyResult;
};

export function createDebtStrategyProvider(): DebtStrategyProvider {
  return {
    compute(input) {
      return computeDebtStrategy(input);
    },
  };
}
