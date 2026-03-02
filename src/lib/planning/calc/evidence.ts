export type CalcEvidenceValue = string | number | boolean | null;

export type CalcEvidence = {
  metric: string;
  formula: string;
  inputs: Record<string, CalcEvidenceValue>;
  assumptions: string[];
};

export function buildMonthlySurplusEvidence(input: {
  monthlyIncomeKrw: number;
  monthlyExpensesKrw: number;
  monthlyDebtPaymentKrw: number;
}): CalcEvidence {
  return {
    metric: "monthlySurplusKrw",
    formula: "monthlySurplusKrw = monthlyIncomeKrw - monthlyExpensesKrw - monthlyDebtPaymentKrw",
    inputs: {
      monthlyIncomeKrw: input.monthlyIncomeKrw,
      monthlyExpensesKrw: input.monthlyExpensesKrw,
      monthlyDebtPaymentKrw: input.monthlyDebtPaymentKrw,
    },
    assumptions: [
      "시작 시점(month=start) 기준 월값을 사용합니다.",
      "단위는 KRW이며 반올림은 표시 단계에서만 적용합니다.",
    ],
  };
}

export function buildDsrPctEvidence(input: {
  monthlyDebtPaymentKrw: number;
  monthlyIncomeKrw: number;
}): CalcEvidence {
  return {
    metric: "dsrPct",
    formula: "dsrPct = (monthlyDebtPaymentKrw / monthlyIncomeKrw) * 100",
    inputs: {
      monthlyDebtPaymentKrw: input.monthlyDebtPaymentKrw,
      monthlyIncomeKrw: input.monthlyIncomeKrw,
    },
    assumptions: [
      "월 소득이 0 이하인 경우 DSR 해석이 왜곡될 수 있습니다.",
      "표시는 퍼센트(%) 단위입니다.",
    ],
  };
}

export function buildEmergencyMonthsEvidence(input: {
  emergencyFundKrw: number;
  monthlyExpensesKrw: number;
}): CalcEvidence {
  return {
    metric: "emergencyFundMonths",
    formula: "emergencyFundMonths = emergencyFundKrw / monthlyExpensesKrw",
    inputs: {
      emergencyFundKrw: input.emergencyFundKrw,
      monthlyExpensesKrw: input.monthlyExpensesKrw,
    },
    assumptions: [
      "월 지출은 시작 시점(month=start) expensesKrw를 사용합니다.",
      "결과 단위는 개월(months)입니다.",
    ],
  };
}

export function buildInterestEstimateEvidence(input: {
  kind: "deposit" | "saving";
  model: "simple_interest" | "compound_interest";
  annualRatePct: number;
  termMonths: number;
  taxRatePct: number;
  principalKrw?: number;
  monthlyPaymentKrw?: number;
}): CalcEvidence {
  const formula = input.kind === "deposit"
    ? (
      input.model === "compound_interest"
        ? "grossInterestKrw = principalKrw * ((1 + annualRatePct/100/12)^termMonths - 1)"
        : "grossInterestKrw = principalKrw * (annualRatePct/100) * (termMonths/12)"
    )
    : (
      input.model === "compound_interest"
        ? "grossInterestKrw = iterative monthly compounding with monthlyPaymentKrw deposits"
        : "grossInterestKrw = monthlyPaymentKrw * termMonths * (annualRatePct/100) * ((termMonths+1)/2/12)"
    );

  return {
    metric: input.kind === "deposit" ? "depositNetInterestKrw" : "savingNetInterestKrw",
    formula: `${formula}; taxKrw = grossInterestKrw * (taxRatePct/100); netInterestKrw = grossInterestKrw - taxKrw`,
    inputs: {
      annualRatePct: input.annualRatePct,
      termMonths: input.termMonths,
      taxRatePct: input.taxRatePct,
      ...(typeof input.principalKrw === "number" ? { principalKrw: input.principalKrw } : {}),
      ...(typeof input.monthlyPaymentKrw === "number" ? { monthlyPaymentKrw: input.monthlyPaymentKrw } : {}),
    },
    assumptions: [
      "세율은 입력값 가정이며 세법 예외(비과세/우대) 반영 전 기본 추정입니다.",
      "상품 비교값은 추천이 아닌 계산 비교용 추정치입니다.",
    ],
  };
}
