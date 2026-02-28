import { clamp, normalBoxMuller } from "./random";
import { type AssumptionsV2, type RiskTolerance } from "./scenarios";

export type StochasticParams = {
  investReturnMeanPct: number;
  investVolPct: number;
  inflationMeanPct: number;
  inflationVolPct: number;
};

const SQRT_12 = Math.sqrt(12);

function normalizeAnnualPctToRate(pct: number): number {
  const normalizedPct = Math.abs(pct) <= 1 ? pct * 100 : pct;
  return normalizedPct / 100;
}

function annualToMonthlyMeanRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function annualVolPctToMonthlyVolRate(volPct: number): number {
  return (volPct / 100) / SQRT_12;
}

export function buildStochasticParams(base: AssumptionsV2, risk: RiskTolerance): StochasticParams {
  const investVolPctByRisk: Record<RiskTolerance, number> = {
    low: 8,
    mid: 12,
    high: 16,
  };

  return {
    investReturnMeanPct: base.investReturnPct,
    investVolPct: clamp(investVolPctByRisk[risk], 0, 40),
    inflationMeanPct: base.inflationPct,
    inflationVolPct: clamp(1.0, 0, 10),
  };
}

export function sampleMonthlyInvestReturnRate(params: StochasticParams, rng: () => number): number {
  const mean = annualToMonthlyMeanRate(normalizeAnnualPctToRate(params.investReturnMeanPct));
  const vol = annualVolPctToMonthlyVolRate(params.investVolPct);
  const z = normalBoxMuller(rng);
  return clamp(mean + vol * z, -0.95, 2.0);
}

export function sampleMonthlyInflationRate(params: StochasticParams, rng: () => number): number {
  const mean = annualToMonthlyMeanRate(normalizeAnnualPctToRate(params.inflationMeanPct));
  const vol = annualVolPctToMonthlyVolRate(params.inflationVolPct);
  const z = normalBoxMuller(rng);
  return clamp(mean + vol * z, -0.5, 1.0);
}
