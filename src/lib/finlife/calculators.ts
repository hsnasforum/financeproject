type CommonInput = {
  months: number;
  annualRatePct: number;
  taxRatePct: number;
  interestType: "simple" | "compound";
};

export type DepositCalcInput = CommonInput & {
  principalWon: number;
};

export type SavingCalcInput = CommonInput & {
  monthlyPaymentWon: number;
};

export type CalcResult = {
  principalWon: number;
  grossInterestWon: number;
  taxWon: number;
  netInterestWon: number;
  maturityWon: number;
};

function sanitizeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calcDeposit(input: DepositCalcInput): CalcResult {
  const principalWon = sanitizeNumber(input.principalWon);
  const months = sanitizeNumber(input.months);
  const annualRatePct = sanitizeNumber(input.annualRatePct);
  const taxRatePct = sanitizeNumber(input.taxRatePct);

  const grossInterestWon =
    input.interestType === "compound"
      ? principalWon * (Math.pow(1 + annualRatePct / 100 / 12, months) - 1)
      : principalWon * (annualRatePct / 100) * (months / 12);

  const taxWon = grossInterestWon * (taxRatePct / 100);
  const netInterestWon = grossInterestWon - taxWon;

  return {
    principalWon: Math.round(principalWon),
    grossInterestWon: Math.round(grossInterestWon),
    taxWon: Math.round(taxWon),
    netInterestWon: Math.round(netInterestWon),
    maturityWon: Math.round(principalWon + netInterestWon),
  };
}

export function calcSaving(input: SavingCalcInput): CalcResult {
  const monthlyPaymentWon = sanitizeNumber(input.monthlyPaymentWon);
  const months = Math.max(1, Math.round(sanitizeNumber(input.months)));
  const annualRatePct = sanitizeNumber(input.annualRatePct);
  const taxRatePct = sanitizeNumber(input.taxRatePct);

  const monthlyRate = annualRatePct / 100 / 12;
  let balance = 0;
  let principalWon = 0;

  for (let i = 0; i < months; i += 1) {
    if (input.interestType === "compound") {
      balance = balance * (1 + monthlyRate);
    }
    balance += monthlyPaymentWon;
    principalWon += monthlyPaymentWon;
  }

  if (input.interestType === "simple") {
    const weightedMonths = (months + 1) / 2;
    const grossInterestWon = monthlyPaymentWon * months * (annualRatePct / 100) * (weightedMonths / 12);
    const taxWon = grossInterestWon * (taxRatePct / 100);
    const netInterestWon = grossInterestWon - taxWon;
    return {
      principalWon: Math.round(principalWon),
      grossInterestWon: Math.round(grossInterestWon),
      taxWon: Math.round(taxWon),
      netInterestWon: Math.round(netInterestWon),
      maturityWon: Math.round(principalWon + netInterestWon),
    };
  }

  const grossInterestWon = balance - principalWon;
  const taxWon = grossInterestWon * (taxRatePct / 100);
  const netInterestWon = grossInterestWon - taxWon;

  return {
    principalWon: Math.round(principalWon),
    grossInterestWon: Math.round(grossInterestWon),
    taxWon: Math.round(taxWon),
    netInterestWon: Math.round(netInterestWon),
    maturityWon: Math.round(principalWon + netInterestWon),
  };
}
