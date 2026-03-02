import { normalizeAprPct, monthlyRateFromAprPct, simulateAmortizingPayoff, summarizeDebt } from "./calc";
import { type LiabilityV2, type RefiAnalysis, type RefiOffer } from "./types";
import { roundKrw } from "../../../calc";

export function analyzeRefinance(liability: LiabilityV2, offer: RefiOffer): RefiAnalysis {
  const feeKrw = Math.max(0, roundKrw(offer.feeKrw ?? 0));
  const newAprPct = normalizeAprPct(offer.newAprPct);
  const summary = summarizeDebt(liability);
  const notes: string[] = [];

  const currentMonthlyPaymentKrw = summary.monthlyPaymentKrw;
  const currentTotalInterestKrw = summary.totalInterestRemainingKrw;

  let newMonthlyPaymentKrw = 0;
  let newTotalInterestKrw = 0;

  if (liability.type === "interestOnly") {
    const monthlyRate = monthlyRateFromAprPct(newAprPct);
    newMonthlyPaymentKrw = roundKrw(liability.principalKrw * monthlyRate);
    newTotalInterestKrw = roundKrw(newMonthlyPaymentKrw * liability.remainingMonths);
  } else {
    const payoff = simulateAmortizingPayoff(liability.principalKrw, newAprPct, liability.remainingMonths, 0);
    newMonthlyPaymentKrw = payoff.monthlyPaymentKrw;
    newTotalInterestKrw = payoff.totalInterestKrw;
  }

  const monthlyPaymentDeltaKrw = newMonthlyPaymentKrw - currentMonthlyPaymentKrw;
  const monthlySavingKrw = currentMonthlyPaymentKrw - newMonthlyPaymentKrw;
  const interestSavingsKrw = currentTotalInterestKrw - newTotalInterestKrw - feeKrw;

  let breakEvenMonths: number | undefined;
  if (monthlySavingKrw > 0) {
    breakEvenMonths = feeKrw <= 0 ? 0 : Math.ceil(feeKrw / monthlySavingKrw);
  }

  if (feeKrw > 0) notes.push("수수료가 반영되었습니다.");
  if (interestSavingsKrw < 0) notes.push("총비용 기준 절감효과가 음수입니다.");
  if (breakEvenMonths === undefined && feeKrw > 0) notes.push("월 절감액 기준 손익분기 계산이 어렵습니다.");

  return {
    liabilityId: liability.id,
    ...(offer.title ? { offerTitle: offer.title } : {}),
    newAprPct,
    feeKrw,
    currentMonthlyPaymentKrw,
    newMonthlyPaymentKrw,
    monthlyPaymentDeltaKrw,
    interestSavingsKrw,
    ...(breakEvenMonths !== undefined ? { breakEvenMonths } : {}),
    notes,
  };
}
