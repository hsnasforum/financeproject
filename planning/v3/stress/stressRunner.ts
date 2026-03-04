import { runStress } from "../financeNews/stressRunner";
import { type StressResult } from "../financeNews/contracts";

export type RunGradeStressInput = Parameters<typeof runStress>[0];

// Pure wrapper to keep v3 stress entrypoint stable.
export function runGradeStress(input: RunGradeStressInput): StressResult {
  return runStress(input);
}

