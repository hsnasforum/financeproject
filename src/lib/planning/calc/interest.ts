import { roundKrw } from "./roundingPolicy";
import { clampTaxRatePct, DEFAULT_INTEREST_TAX_POLICY } from "./taxPolicy";
import { type CalcEvidence } from "./evidence";

export type InterestEstimate = {
  grossInterestKrw: number;
  taxKrw: number;
  netInterestKrw: number;
  maturityAmountKrw: number;
};

export type InterestEstimateAssumptions = {
  annualRatePct: number;
  termMonths: number;
  principalKrw: number;
  taxRatePct: number;
  model: "simple_interest" | "compound_interest";
  note: string;
};

export type SimpleInterestEstimateInput = {
  principalKrw: number;
  ratePct: number;
  termMonths: number;
  taxRatePct?: number;
};

export type SimpleInterestEstimateResult = {
  grossInterestKrw: number;
  taxKrw: number;
  netInterestKrw: number;
  maturityAmountKrw: number;
  assumptionsUsed: InterestEstimateAssumptions;
  evidence: CalcEvidence;
};

function toFiniteOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTermMonths(value: unknown): number {
  return clamp(Math.trunc(toFiniteOrZero(value)), 1, 1200);
}

function normalizeRatePct(value: unknown): number {
  return clamp(toFiniteOrZero(value), 0, 100);
}

export function estimateSimpleInterest(input: SimpleInterestEstimateInput): SimpleInterestEstimateResult {
  const safePrincipal = Math.max(0, roundKrw(toFiniteOrZero(input.principalKrw)));
  const safeTermMonths = normalizeTermMonths(input.termMonths);
  const safeRatePct = normalizeRatePct(input.ratePct);
  const taxRatePct = clampTaxRatePct(input.taxRatePct);

  const grossInterestRaw = safePrincipal * (safeRatePct / 100) * (safeTermMonths / 12);
  const taxRaw = grossInterestRaw * (taxRatePct / 100);
  const netInterestRaw = Math.max(0, grossInterestRaw - taxRaw);
  const maturityAmountRaw = safePrincipal + netInterestRaw;

  return {
    grossInterestKrw: roundKrw(grossInterestRaw),
    taxKrw: roundKrw(taxRaw),
    netInterestKrw: roundKrw(netInterestRaw),
    maturityAmountKrw: roundKrw(maturityAmountRaw),
    assumptionsUsed: {
      annualRatePct: safeRatePct,
      termMonths: safeTermMonths,
      principalKrw: safePrincipal,
      taxRatePct,
      model: "simple_interest",
      note: `${DEFAULT_INTEREST_TAX_POLICY.label}(${DEFAULT_INTEREST_TAX_POLICY.taxRatePct}%) 기준 추정치입니다.`,
    },
    evidence: {
      metric: "depositNetInterestKrw",
      formula: "grossInterestKrw = principalKrw * (ratePct/100) * (termMonths/12); taxKrw = grossInterestKrw * (taxRatePct/100); netInterestKrw = grossInterestKrw - taxKrw",
      inputs: {
        principalKrw: safePrincipal,
        ratePct: safeRatePct,
        termMonths: safeTermMonths,
        taxRatePct,
      },
      assumptions: [
        "단리(simple interest) 가정입니다.",
        "세율은 정책 가정값이며 세법 예외(비과세/우대과세)는 반영하지 않습니다.",
      ],
    },
  };
}

export function estimateDepositInterest(
  principalKrw: number,
  termMonths: number,
  annualRatePct: number,
  options?: {
    taxRatePct?: number;
    model?: "simple_interest" | "compound_interest";
  },
): {
  estimate: InterestEstimate;
  assumptionsUsed: InterestEstimateAssumptions;
} {
  const safePrincipal = Math.max(0, roundKrw(toFiniteOrZero(principalKrw)));
  const safeTermMonths = normalizeTermMonths(termMonths);
  const safeRatePct = normalizeRatePct(annualRatePct);
  const taxRatePct = clampTaxRatePct(options?.taxRatePct);
  const model = options?.model ?? "simple_interest";

  if (model === "simple_interest") {
    const simple = estimateSimpleInterest({
      principalKrw: safePrincipal,
      ratePct: safeRatePct,
      termMonths: safeTermMonths,
      taxRatePct,
    });
    return {
      estimate: {
        grossInterestKrw: simple.grossInterestKrw,
        taxKrw: simple.taxKrw,
        netInterestKrw: simple.netInterestKrw,
        maturityAmountKrw: simple.maturityAmountKrw,
      },
      assumptionsUsed: simple.assumptionsUsed,
    };
  }

  const grossInterest = safePrincipal * ((1 + safeRatePct / 100 / 12) ** safeTermMonths - 1);
  const tax = grossInterest * (taxRatePct / 100);
  const netInterest = Math.max(0, grossInterest - tax);
  const maturityAmount = safePrincipal + netInterest;

  return {
    estimate: {
      grossInterestKrw: roundKrw(grossInterest),
      taxKrw: roundKrw(tax),
      netInterestKrw: roundKrw(netInterest),
      maturityAmountKrw: roundKrw(maturityAmount),
    },
    assumptionsUsed: {
      annualRatePct: safeRatePct,
      termMonths: safeTermMonths,
      principalKrw: safePrincipal,
      taxRatePct,
      model,
      note: `${DEFAULT_INTEREST_TAX_POLICY.label}(${DEFAULT_INTEREST_TAX_POLICY.taxRatePct}%) 기준 추정치입니다.`,
    },
  };
}

export function estimateSavingInterest(
  monthlyPaymentKrw: number,
  termMonths: number,
  annualRatePct: number,
  options?: {
    taxRatePct?: number;
    model?: "simple_interest" | "compound_interest";
  },
): {
  estimate: InterestEstimate;
  assumptionsUsed: InterestEstimateAssumptions;
} {
  const payment = Math.max(0, roundKrw(toFiniteOrZero(monthlyPaymentKrw)));
  const months = normalizeTermMonths(termMonths);
  const ratePct = normalizeRatePct(annualRatePct);
  const taxRatePct = clampTaxRatePct(options?.taxRatePct);
  const model = options?.model ?? "simple_interest";

  const principal = payment * months;
  const monthlyRate = ratePct / 100 / 12;

  let grossInterest = 0;
  if (model === "compound_interest") {
    let balance = 0;
    for (let i = 0; i < months; i += 1) {
      balance = balance * (1 + monthlyRate);
      balance += payment;
    }
    grossInterest = balance - principal;
  } else {
    // 납입금이 기간별로 균등하게 쌓인다는 단리 근사(평균 예치기간=(n+1)/2개월)
    const weightedMonths = (months + 1) / 2;
    grossInterest = payment * months * (ratePct / 100) * (weightedMonths / 12);
  }

  const tax = grossInterest * (taxRatePct / 100);
  const netInterest = Math.max(0, grossInterest - tax);
  const maturityAmount = principal + netInterest;

  return {
    estimate: {
      grossInterestKrw: roundKrw(grossInterest),
      taxKrw: roundKrw(tax),
      netInterestKrw: roundKrw(netInterest),
      maturityAmountKrw: roundKrw(maturityAmount),
    },
    assumptionsUsed: {
      annualRatePct: ratePct,
      termMonths: months,
      principalKrw: roundKrw(principal),
      taxRatePct,
      model,
      note: `${DEFAULT_INTEREST_TAX_POLICY.label}(${DEFAULT_INTEREST_TAX_POLICY.taxRatePct}%) 기준 추정치입니다.`,
    },
  };
}
