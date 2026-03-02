import {
  computeDebtServiceRatio,
  monthlyRateFromAprPct,
  normalizeAprPct,
  summarizeDebt,
} from "./calc";
import { debtStrategyWarningMessage } from "../warningsCatalog.ko";
import { analyzeRefinance } from "./refi";
import { buildDebtWhatIf } from "./whatIf";
import { type DebtStrategyInput, type DebtStrategyResult, type LiabilityV2 } from "./types";

const DEFAULT_HORIZON_MONTHS = 120;
const DSR_WARN_THRESHOLD = 0.4;
const DSR_CRITICAL_THRESHOLD = 0.6;

function roundMoney(value: number): number {
  return Math.round(value);
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function sanitizeLiability(liability: LiabilityV2, fallbackMonths: number): LiabilityV2 {
  return {
    id: liability.id,
    name: liability.name,
    type: liability.type === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, Number(liability.principalKrw) || 0),
    aprPct: normalizeAprPct(Number(liability.aprPct) || 0),
    remainingMonths: Math.max(1, Math.trunc(Number(liability.remainingMonths) || fallbackMonths)),
    ...(Number.isFinite(liability.minimumPaymentKrw)
      ? { minimumPaymentKrw: Math.max(0, Number(liability.minimumPaymentKrw)) }
      : {}),
  };
}

function buildNegativeAmortizationWarnings(liabilities: LiabilityV2[]) {
  const warnings: DebtStrategyResult["warnings"] = [];
  for (const liability of liabilities) {
    if (liability.type !== "amortizing") continue;
    const minimumPaymentKrw = liability.minimumPaymentKrw;
    if (!Number.isFinite(minimumPaymentKrw)) continue;

    const firstMonthInterest = liability.principalKrw * monthlyRateFromAprPct(liability.aprPct);
    if ((minimumPaymentKrw as number) + 1e-9 < firstMonthInterest) {
      warnings.push({
        code: "NEGATIVE_AMORTIZATION_RISK",
        message: debtStrategyWarningMessage("NEGATIVE_AMORTIZATION_RISK"),
        data: {
          liabilityId: liability.id,
          minimumPaymentKrw: roundMoney(minimumPaymentKrw as number),
          firstMonthInterestKrw: roundMoney(firstMonthInterest),
        },
      });
    }
  }
  return warnings;
}

export function computeDebtStrategy(input: DebtStrategyInput): DebtStrategyResult {
  const horizonMonths = Math.max(1, Math.trunc(input.horizonMonths ?? DEFAULT_HORIZON_MONTHS));
  const nowMonthIndex = Math.max(0, Math.trunc(input.nowMonthIndex ?? 0));
  const monthlyIncomeKrw = Math.max(0, Number(input.monthlyIncomeKrw) || 0);

  const liabilities = input.liabilities.map((liability) => sanitizeLiability(liability, horizonMonths));
  const summaries = liabilities.map((liability) => summarizeDebt(liability, nowMonthIndex));
  const totalMonthlyPaymentKrw = summaries.reduce((sum, summary) => sum + summary.monthlyPaymentKrw, 0);
  const debtServiceRatio = computeDebtServiceRatio(summaries, monthlyIncomeKrw);

  const whatIf = buildDebtWhatIf(
    {
      ...input,
      liabilities,
      monthlyIncomeKrw,
      nowMonthIndex,
      horizonMonths,
    },
    summaries,
  );

  const refinance = (input.offers ?? [])
    .map((offer) => {
      const liability = liabilities.find((entry) => entry.id === offer.liabilityId);
      if (!liability) return null;
      return analyzeRefinance(liability, offer);
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const warnings: DebtStrategyResult["warnings"] = [];
  if (debtServiceRatio > DSR_CRITICAL_THRESHOLD) {
    warnings.push({
      code: "DSR_HIGH_CRITICAL",
      message: debtStrategyWarningMessage("DSR_HIGH_CRITICAL"),
      data: { debtServiceRatio: round4(debtServiceRatio) },
    });
  } else if (debtServiceRatio > DSR_WARN_THRESHOLD) {
    warnings.push({
      code: "DSR_HIGH_WARN",
      message: debtStrategyWarningMessage("DSR_HIGH_WARN"),
      data: { debtServiceRatio: round4(debtServiceRatio) },
    });
  }

  warnings.push(...buildNegativeAmortizationWarnings(liabilities));

  return {
    meta: {
      debtServiceRatio: round4(debtServiceRatio),
      totalMonthlyPaymentKrw: roundMoney(totalMonthlyPaymentKrw),
    },
    summaries,
    ...(refinance.length > 0 ? { refinance } : {}),
    whatIf,
    warnings,
    cautions: [
      "이 결과는 수학적 비교이며 금융상품 가입 권유가 아닙니다.",
      "결과는 가정 기반 계산치이며 보장이 아닙니다.",
      "수수료/조건은 사용자 입력값 기준이므로 실제 대출기관 조건을 확인하세요.",
    ],
  };
}
