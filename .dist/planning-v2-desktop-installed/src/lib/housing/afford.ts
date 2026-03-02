export type HousingAffordMode = "rent" | "buy";

export type HousingBurdenInput = {
  incomeNetMonthly: number;
  nonHousingOutflowMonthly: number;
  mode: HousingAffordMode;
  rent?: {
    deposit: number;
    monthlyRent: number;
    opportunityAprPct: number;
  };
  buy?: {
    purchasePrice: number;
    equity: number;
    loanAprPct: number;
    termMonths: number;
  };
};

export type HousingBurdenResult = {
  mode: HousingAffordMode;
  monthlyHousingCost: number;
  housingRatioPct: number | null;
  residualCashFlow: number;
  warnings: string[];
  breakdown: {
    monthlyMortgagePayment: number;
    depositOpportunityCostMonthly: number;
    monthlyRent: number;
    principal: number;
  };
};

function toSafeNonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function toSafePositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function monthlyMortgagePayment(principal: number, aprPct: number, termMonths: number): number {
  const p = toSafeNonNegative(principal);
  const n = toSafePositiveInt(termMonths);
  const apr = toSafeNonNegative(aprPct);
  if (p <= 0 || n <= 0) return 0;

  const monthlyRate = apr / 100 / 12;
  if (monthlyRate <= 0) return p / n;

  const growth = (1 + monthlyRate) ** n;
  if (!Number.isFinite(growth) || growth <= 1) return p / n;

  const payment = (p * monthlyRate * growth) / (growth - 1);
  return Number.isFinite(payment) ? payment : 0;
}

export function depositToMonthly(deposit: number, opportunityAprPct: number): number {
  const safeDeposit = toSafeNonNegative(deposit);
  const safeApr = toSafeNonNegative(opportunityAprPct);
  if (safeDeposit <= 0 || safeApr <= 0) return 0;
  return (safeDeposit * (safeApr / 100)) / 12;
}

export function housingBurden(input: HousingBurdenInput): HousingBurdenResult {
  const incomeNetMonthly = toSafeNonNegative(input.incomeNetMonthly);
  const nonHousingOutflowMonthly = toSafeNonNegative(input.nonHousingOutflowMonthly);
  const mode: HousingAffordMode = input.mode === "buy" ? "buy" : "rent";

  const rentDeposit = toSafeNonNegative(input.rent?.deposit);
  const monthlyRent = toSafeNonNegative(input.rent?.monthlyRent);
  const opportunityAprPct = toSafeNonNegative(input.rent?.opportunityAprPct);

  const purchasePrice = toSafeNonNegative(input.buy?.purchasePrice);
  const equity = toSafeNonNegative(input.buy?.equity);
  const principal = Math.max(0, purchasePrice - equity);
  const loanAprPct = toSafeNonNegative(input.buy?.loanAprPct);
  const termMonths = toSafePositiveInt(input.buy?.termMonths);

  const monthlyMortgage = monthlyMortgagePayment(principal, loanAprPct, termMonths);
  const depositOpportunityCostMonthly = depositToMonthly(rentDeposit, opportunityAprPct);

  const monthlyHousingCost = mode === "buy"
    ? monthlyMortgage
    : monthlyRent + depositOpportunityCostMonthly;

  const housingRatioPct = incomeNetMonthly > 0 ? (monthlyHousingCost / incomeNetMonthly) * 100 : null;
  const residualCashFlow = incomeNetMonthly - nonHousingOutflowMonthly - monthlyHousingCost;

  const warnings: string[] = [];
  if (incomeNetMonthly <= 0) warnings.push("월 소득(세후)이 0원으로 입력되어 부담비율 계산이 제한됩니다.");
  if (mode === "buy" && principal <= 0) warnings.push("매매가 대비 자기자본이 충분해 대출 원금이 0원입니다.");
  if (mode === "buy" && principal > 0 && termMonths <= 0) warnings.push("대출 기간(개월)이 0 이하라 월 상환액이 0원으로 계산됩니다.");
  if (housingRatioPct !== null && housingRatioPct >= 40) warnings.push("주거비 비율이 40% 이상으로 높습니다.");
  else if (housingRatioPct !== null && housingRatioPct >= 30) warnings.push("주거비 비율이 30% 이상입니다.");
  if (residualCashFlow < 0) warnings.push("주거비 반영 후 잔여현금흐름이 음수입니다.");

  return {
    mode,
    monthlyHousingCost,
    housingRatioPct,
    residualCashFlow,
    warnings,
    breakdown: {
      monthlyMortgagePayment: monthlyMortgage,
      depositOpportunityCostMonthly,
      monthlyRent,
      principal,
    },
  };
}
