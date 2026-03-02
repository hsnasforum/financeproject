import { estimateDepositInterest, estimateSavingInterest } from "../planning/calc";

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

function toModel(interestType: CommonInput["interestType"]): "simple_interest" | "compound_interest" {
  return interestType === "compound" ? "compound_interest" : "simple_interest";
}

export function calcDeposit(input: DepositCalcInput): CalcResult {
  const computed = estimateDepositInterest(
    input.principalWon,
    input.months,
    input.annualRatePct,
    {
      taxRatePct: input.taxRatePct,
      model: toModel(input.interestType),
    },
  );

  return {
    principalWon: computed.assumptionsUsed.principalKrw,
    grossInterestWon: computed.estimate.grossInterestKrw,
    taxWon: computed.estimate.taxKrw,
    netInterestWon: computed.estimate.netInterestKrw,
    maturityWon: computed.estimate.maturityAmountKrw,
  };
}

export function calcSaving(input: SavingCalcInput): CalcResult {
  const computed = estimateSavingInterest(
    input.monthlyPaymentWon,
    input.months,
    input.annualRatePct,
    {
      taxRatePct: input.taxRatePct,
      model: toModel(input.interestType),
    },
  );

  return {
    principalWon: computed.assumptionsUsed.principalKrw,
    grossInterestWon: computed.estimate.grossInterestKrw,
    taxWon: computed.estimate.taxKrw,
    netInterestWon: computed.estimate.netInterestKrw,
    maturityWon: computed.estimate.maturityAmountKrw,
  };
}
