export type LiabilityV2 = {
  id: string;
  name: string;
  type: "amortizing" | "interestOnly";
  principalKrw: number;
  aprPct: number;
  remainingMonths: number;
  minimumPaymentKrw?: number;
};

export type RefiOffer = {
  liabilityId: string;
  newAprPct: number;
  feeKrw?: number;
  title?: string;
};

export type DebtStrategyInput = {
  liabilities: LiabilityV2[];
  monthlyIncomeKrw: number;
  nowMonthIndex?: number;
  horizonMonths?: number;
  offers?: RefiOffer[];
  options?: {
    extraPaymentKrw?: number;
    compareTermsMonths?: number[];
  };
};

export type DebtSummary = {
  liabilityId: string;
  name: string;
  type: "amortizing" | "interestOnly";
  principalKrw: number;
  aprPct: number;
  remainingMonths: number;
  monthlyPaymentKrw: number;
  monthlyInterestKrw: number;
  totalInterestRemainingKrw: number;
  payoffMonthIndex: number;
};

export type RefiAnalysis = {
  liabilityId: string;
  offerTitle?: string;
  newAprPct: number;
  feeKrw: number;
  currentMonthlyPaymentKrw: number;
  newMonthlyPaymentKrw: number;
  monthlyPaymentDeltaKrw: number;
  interestSavingsKrw: number;
  breakEvenMonths?: number;
  notes: string[];
};

export type DebtStrategyResult = {
  meta: {
    debtServiceRatio: number;
    totalMonthlyPaymentKrw: number;
  };
  summaries: DebtSummary[];
  refinance?: RefiAnalysis[];
  whatIf: {
    termExtensions: Array<{ liabilityId: string; newTermMonths: number; newMonthlyPaymentKrw: number; notes: string[] }>;
    termReductions: Array<{ liabilityId: string; newTermMonths: number; newMonthlyPaymentKrw: number; notes: string[] }>;
    extraPayments: Array<{ liabilityId: string; extraPaymentKrw: number; payoffMonthsReduced: number; interestSavingsKrw: number }>;
  };
  warnings: Array<{ code: string; message: string; data?: unknown }>;
  cautions: string[];
};
