import { type ProfileV2 } from "../v2/types";
import {
  clampTaxRatePct,
  DEFAULT_INTEREST_TAX_POLICY,
  estimateSimpleInterest,
  roundKrw,
  type CalcEvidence,
} from "../calc";

export { DEFAULT_INTEREST_TAX_POLICY } from "../calc";

export type CandidateKind = "deposit" | "saving";

export type CandidateVM = {
  id: string;
  kind: CandidateKind;
  providerName: string;
  productName: string;
  termMonths: number | null;
  baseRatePct: number;
  bonusRatePct?: number;
  conditionsSummary: string;
  source: string;
  fetchedAt: string;
};

export type CandidateProfileContext = Pick<
  ProfileV2,
  "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses" | "liquidAssets"
>;

export type CandidateGoalContext = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetMonth?: number;
  priority?: number;
};

export type CandidateInterestEstimate = {
  grossInterestKrw: number;
  taxKrw: number;
  netInterestKrw: number;
  maturityAmountKrw: number;
};

export type CandidateEstimateAssumptions = {
  ratePct: number;
  termMonths: number;
  amountKrw: number;
  taxRatePct: number;
  model: "simple_interest";
  note: string;
};

export type CandidateComparisonRow = CandidateVM & {
  appliedTermMonths: number;
  estimate: CandidateInterestEstimate;
  assumptionsUsed: CandidateEstimateAssumptions;
  estimateEvidence: CalcEvidence;
};

export type CandidateComparisonAssumptions = {
  amountKrw?: number;
  taxRatePct?: number;
  fallbackTermMonths?: number;
};

const DEFAULT_TAX_RATE_PCT = DEFAULT_INTEREST_TAX_POLICY.taxRatePct;
const DEFAULT_TERM_MONTHS = 12;
const MIN_AMOUNT_KRW = 100_000;

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveDefaultComparisonAmountKrw(
  profile?: Partial<CandidateProfileContext>,
  goal?: Partial<CandidateGoalContext>,
): number {
  const profileLiquid = toFiniteNumber(profile?.liquidAssets);
  const goalShortfall = (() => {
    const target = toFiniteNumber(goal?.targetAmount);
    const current = toFiniteNumber(goal?.currentAmount) ?? 0;
    if (target === null) return null;
    return Math.max(0, target - current);
  })();

  const liquidCandidate = profileLiquid === null ? null : Math.max(0, profileLiquid);
  const shortfallCandidate = goalShortfall === null ? null : Math.max(0, goalShortfall);

  if (liquidCandidate !== null && shortfallCandidate !== null) {
    const picked = Math.min(liquidCandidate, shortfallCandidate > 0 ? shortfallCandidate : liquidCandidate);
    return Math.max(MIN_AMOUNT_KRW, roundKrw(picked));
  }
  if (liquidCandidate !== null) return Math.max(MIN_AMOUNT_KRW, roundKrw(liquidCandidate));
  if (shortfallCandidate !== null) return Math.max(MIN_AMOUNT_KRW, roundKrw(shortfallCandidate));
  return 10_000_000;
}

export function deriveDefaultComparisonTermMonths(goal?: Partial<CandidateGoalContext>): number {
  const targetMonth = toFiniteNumber(goal?.targetMonth);
  if (targetMonth === null || targetMonth <= 0) return DEFAULT_TERM_MONTHS;
  return clamp(Math.trunc(targetMonth), 1, 120);
}

export function computeInterestEstimate(
  amountKrw: number,
  termMonths: number,
  ratePct: number,
  taxAssumption?: { taxRatePct?: number },
): {
  estimate: CandidateInterestEstimate;
  assumptionsUsed: CandidateEstimateAssumptions;
  evidence: CalcEvidence;
} {
  const safeAmount = Math.max(0, roundKrw(toFiniteNumber(amountKrw) ?? 0));
  const safeTermMonths = clamp(Math.trunc(toFiniteNumber(termMonths) ?? DEFAULT_TERM_MONTHS), 1, 1200);
  const safeRatePct = clamp(toFiniteNumber(ratePct) ?? 0, 0, 100);
  const taxRatePct = clampTaxRatePct(toFiniteNumber(taxAssumption?.taxRatePct) ?? DEFAULT_TAX_RATE_PCT);
  const computed = estimateSimpleInterest({
    principalKrw: safeAmount,
    ratePct: safeRatePct,
    termMonths: safeTermMonths,
    taxRatePct,
  });

  return {
    estimate: {
      grossInterestKrw: computed.grossInterestKrw,
      taxKrw: computed.taxKrw,
      netInterestKrw: computed.netInterestKrw,
      maturityAmountKrw: computed.maturityAmountKrw,
    },
    assumptionsUsed: {
      ratePct: safeRatePct,
      termMonths: safeTermMonths,
      amountKrw: safeAmount,
      taxRatePct,
      model: "simple_interest",
      note: `${DEFAULT_INTEREST_TAX_POLICY.label}(${DEFAULT_INTEREST_TAX_POLICY.taxRatePct}%) + 단리 가정 기반 추정치입니다.`,
    },
    evidence: computed.evidence,
  };
}

export function computeCandidateComparison(
  profile: Partial<CandidateProfileContext> | undefined,
  goal: Partial<CandidateGoalContext> | undefined,
  candidates: CandidateVM[],
  assumptions?: CandidateComparisonAssumptions,
): CandidateComparisonRow[] {
  const defaultAmount = deriveDefaultComparisonAmountKrw(profile, goal);
  const defaultTermMonths = deriveDefaultComparisonTermMonths(goal);
  const amountKrw = Math.max(
    MIN_AMOUNT_KRW,
    roundKrw(toFiniteNumber(assumptions?.amountKrw) ?? defaultAmount),
  );
  const fallbackTermMonths = clamp(
    Math.trunc(toFiniteNumber(assumptions?.fallbackTermMonths) ?? defaultTermMonths),
    1,
    1200,
  );
  const taxRatePct = clampTaxRatePct(toFiniteNumber(assumptions?.taxRatePct) ?? DEFAULT_TAX_RATE_PCT);

  return candidates.map((candidate) => {
    const appliedTermMonths = clamp(
      Math.trunc(toFiniteNumber(candidate.termMonths) ?? fallbackTermMonths),
      1,
      1200,
    );
    const computed = computeInterestEstimate(amountKrw, appliedTermMonths, candidate.baseRatePct, { taxRatePct });
    return {
      ...candidate,
      appliedTermMonths,
      estimate: computed.estimate,
      assumptionsUsed: computed.assumptionsUsed,
      estimateEvidence: computed.evidence,
    };
  });
}
