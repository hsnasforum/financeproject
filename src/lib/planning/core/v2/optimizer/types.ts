import { type AssumptionsV2 } from "../scenarios";
import { type ProfileV2, type SimulationResultV2 } from "../types";

export type OptimizerInput = {
  profile: ProfileV2;
  horizonMonths: number;
  baseAssumptions: AssumptionsV2;
  constraints: {
    minEmergencyMonths: number;
    maxDebtServiceRatio?: number;
    minEndCashKrw?: number;
  };
  knobs: {
    maxMonthlyContributionKrw?: number;
    allowExtraDebtPayment?: boolean;
    allowInvestContribution?: boolean;
  };
  search: {
    candidates: number;
    keepTop: number;
    seed?: number;
  };
};

export type PlanResultV2 = {
  assumptionsUsed: SimulationResultV2["assumptionsUsed"];
  summary: {
    endNetWorthKrw: number;
    worstCashKrw: number;
    worstCashMonthIndex: number;
    goalsAchieved: number;
    totalInterestKrw: number;
  };
  warnings: Array<{ reasonCode: string; message: string; month?: number }>;
  goalsStatus: SimulationResultV2["goalStatus"];
  keyTimelinePoints: Array<{
    monthIndex: number;
    liquidAssetsKrw: number;
    investmentAssetsKrw: number;
    totalDebtKrw: number;
    netWorthKrw: number;
    debtServiceRatio: number;
  }>;
};

export type CandidatePlan = {
  id: string;
  title: string;
  strategy: {
    investContributionKrw?: number;
    extraDebtPaymentKrw?: number;
    emergencyTopUpFirst: boolean;
  };
  result: PlanResultV2;
  score: {
    goalsAchieved: number;
    worstCashKrw: number;
    endNetWorthKrw: number;
    totalInterestKrw?: number;
  };
  why: string[];
  cautions: string[];
};
