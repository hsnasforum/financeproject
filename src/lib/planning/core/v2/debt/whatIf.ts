import { amortizingMonthlyPayment, roundKrw, simulateAmortizingPayoff } from "../../../calc";
import { type DebtStrategyInput, type DebtSummary, type DebtStrategyResult } from "./types";

const DEFAULT_COMPARE_TERMS = [12, 24, 36, 60, 120];

function normalizeCompareTerms(terms: number[] | undefined): number[] {
  const source = Array.isArray(terms) && terms.length > 0 ? terms : DEFAULT_COMPARE_TERMS;
  const out = new Set<number>();
  for (const term of source) {
    const normalized = Math.trunc(Number(term));
    if (!Number.isFinite(normalized) || normalized < 6) continue;
    out.add(normalized);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function buildDebtWhatIf(
  input: DebtStrategyInput,
  summaries: DebtSummary[],
): DebtStrategyResult["whatIf"] {
  const termExtensions: DebtStrategyResult["whatIf"]["termExtensions"] = [];
  const termReductions: DebtStrategyResult["whatIf"]["termReductions"] = [];
  const extraPayments: DebtStrategyResult["whatIf"]["extraPayments"] = [];
  const compareTerms = normalizeCompareTerms(input.options?.compareTermsMonths);
  const extraPaymentKrw = Math.max(0, input.options?.extraPaymentKrw ?? 0);

  for (const summary of summaries) {
    if (summary.type === "interestOnly") {
      const convertedMonthly = amortizingMonthlyPayment(
        summary.principalKrw,
        summary.aprPct,
        summary.remainingMonths,
      );
      termReductions.push({
        liabilityId: summary.liabilityId,
        newTermMonths: summary.remainingMonths,
        newMonthlyPaymentKrw: roundKrw(convertedMonthly),
        notes: ["Converts interest-only repayment to amortizing repayment over the same remaining term."],
      });
      continue;
    }

    for (const term of compareTerms) {
      if (term === summary.remainingMonths) continue;

      const monthlyPayment = amortizingMonthlyPayment(summary.principalKrw, summary.aprPct, term);
      const row = {
        liabilityId: summary.liabilityId,
        newTermMonths: term,
        newMonthlyPaymentKrw: roundKrw(monthlyPayment),
        notes: ["Assumes same principal and APR; only term changed."],
      };

      if (term > summary.remainingMonths) {
        termExtensions.push(row);
      } else {
        termReductions.push(row);
      }
    }

    if (extraPaymentKrw > 0) {
      const basePayoff = simulateAmortizingPayoff(summary.principalKrw, summary.aprPct, summary.remainingMonths, 0);
      const extraPayoff = simulateAmortizingPayoff(summary.principalKrw, summary.aprPct, summary.remainingMonths, extraPaymentKrw);
      extraPayments.push({
        liabilityId: summary.liabilityId,
        extraPaymentKrw: roundKrw(extraPaymentKrw),
        payoffMonthsReduced: Math.max(0, basePayoff.payoffMonths - extraPayoff.payoffMonths),
        interestSavingsKrw: Math.max(0, basePayoff.totalInterestKrw - extraPayoff.totalInterestKrw),
      });
    }
  }

  return {
    termExtensions,
    termReductions,
    extraPayments,
  };
}
