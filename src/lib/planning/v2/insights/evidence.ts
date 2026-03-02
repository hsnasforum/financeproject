import { roundKrw, roundMonths, roundPercent, type CalcEvidence } from "../../calc";
import {
  DEFAULT_PLANNING_POLICY,
  type PlanningInterpretationPolicy,
} from "../../catalog/planningPolicy";

export type EvidenceItem = {
  id: string;
  title: string;
  formula: string;
  inputs: Array<{ label: string; value: string }>;
  assumptions: string[];
  notes?: string[];
};

type SummaryEvidenceLike = {
  monthlySurplusKrw?: CalcEvidence;
  dsrPct?: CalcEvidence;
  emergencyFundMonths?: CalcEvidence;
};

type ReportVmLike = {
  summaryCards?: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    totalMonthlyDebtPaymentKrw?: number;
  };
  evidence?: {
    summary?: SummaryEvidenceLike;
  };
};

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatKrwWithUnit(value: unknown): string {
  const n = asFiniteNumber(value);
  if (typeof n !== "number") return "N/A";
  return `${roundKrw(n).toLocaleString("ko-KR")}원`;
}

function formatPctWithUnit(value: unknown, digits = 1): string {
  const n = asFiniteNumber(value);
  if (typeof n !== "number") return "N/A";
  return `${roundPercent(n, digits).toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

function formatMonthsWithUnit(value: unknown, digits = 1): string {
  const n = asFiniteNumber(value);
  if (typeof n !== "number") return "N/A";
  return `${roundMonths(n, digits).toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: digits })}개월`;
}

export function buildEvidence(
  reportVM: ReportVmLike,
  policy: PlanningInterpretationPolicy = DEFAULT_PLANNING_POLICY,
  calcEvidence?: SummaryEvidenceLike,
): EvidenceItem[] {
  const summaryCards = reportVM.summaryCards ?? {};
  const summaryEvidence = calcEvidence ?? reportVM.evidence?.summary ?? {};
  const items: EvidenceItem[] = [];

  const monthlyInputs = summaryEvidence.monthlySurplusKrw?.inputs ?? {};
  const monthlyIncomeKrw = asFiniteNumber(monthlyInputs.monthlyIncomeKrw);
  const monthlyExpensesKrw = asFiniteNumber(monthlyInputs.monthlyExpensesKrw);
  const monthlyDebtPaymentKrw = asFiniteNumber(monthlyInputs.monthlyDebtPaymentKrw)
    ?? asFiniteNumber(summaryCards.totalMonthlyDebtPaymentKrw);

  if (
    typeof summaryCards.monthlySurplusKrw === "number"
    || typeof monthlyIncomeKrw === "number"
    || typeof monthlyExpensesKrw === "number"
    || typeof monthlyDebtPaymentKrw === "number"
  ) {
    items.push({
      id: "monthlySurplus",
      title: "월 잉여현금",
      formula: "incomeNet - essential - discretionary - totalDebtPayment",
      inputs: [
        { label: "월 실수령", value: formatKrwWithUnit(monthlyIncomeKrw) },
        { label: "필수지출", value: "N/A" },
        { label: "선택지출", value: "N/A" },
        { label: "월 총지출(필수+선택)", value: formatKrwWithUnit(monthlyExpensesKrw) },
        { label: "월 부채상환", value: formatKrwWithUnit(monthlyDebtPaymentKrw) },
        { label: "월 잉여현금", value: formatKrwWithUnit(summaryCards.monthlySurplusKrw) },
      ],
      assumptions: [
        "필수/선택지출이 분리 저장되지 않은 경우 월 총지출 입력값으로 대체 표시합니다.",
        "원 단위 반올림(roundKrw) 규칙을 사용합니다.",
      ],
      notes: summaryEvidence.monthlySurplusKrw?.assumptions ?? [],
    });
  }

  const dsrInputs = summaryEvidence.dsrPct?.inputs ?? {};
  const dsrDebtPaymentKrw = asFiniteNumber(dsrInputs.monthlyDebtPaymentKrw)
    ?? asFiniteNumber(summaryCards.totalMonthlyDebtPaymentKrw);
  const dsrIncomeKrw = asFiniteNumber(dsrInputs.monthlyIncomeKrw);
  if (
    typeof summaryCards.dsrPct === "number"
    || typeof dsrDebtPaymentKrw === "number"
    || typeof dsrIncomeKrw === "number"
  ) {
    items.push({
      id: "dsrPct",
      title: "부채부담률(DSR)",
      formula: "(totalDebtPayment / incomeNet) * 100",
      inputs: [
        { label: "월 부채상환", value: formatKrwWithUnit(dsrDebtPaymentKrw) },
        { label: "월 실수령", value: formatKrwWithUnit(dsrIncomeKrw) },
        { label: "DSR", value: formatPctWithUnit(summaryCards.dsrPct, 1) },
      ],
      assumptions: [
        "incomeNet(월 실수령)이 0 이하인 경우 DSR은 N/A 또는 해석 제한 대상으로 봅니다.",
        "표시는 퍼센트(%) 단위이며 반올림된 값입니다.",
      ],
      notes: summaryEvidence.dsrPct?.assumptions ?? [],
    });
  }

  const emergencyInputs = summaryEvidence.emergencyFundMonths?.inputs ?? {};
  const emergencyEssentialKrw = asFiniteNumber(emergencyInputs.monthlyExpensesKrw);
  const emergencyCashKrw = asFiniteNumber(emergencyInputs.emergencyFundKrw);
  const emergencyMonthsPolicy = policy.emergencyFundMonths.caution;
  const emergencyTargetKrw = typeof emergencyEssentialKrw === "number"
    ? emergencyEssentialKrw * emergencyMonthsPolicy
    : undefined;
  const emergencyGapKrw = typeof emergencyTargetKrw === "number" && typeof emergencyCashKrw === "number"
    ? Math.max(0, emergencyTargetKrw - emergencyCashKrw)
    : undefined;

  if (
    typeof summaryCards.emergencyFundMonths === "number"
    || typeof emergencyEssentialKrw === "number"
    || typeof emergencyCashKrw === "number"
  ) {
    items.push({
      id: "emergency",
      title: "비상금 커버",
      formula: "target=essential*emergencyMonthsPolicy; gap=max(0,target-cash); months=cash/essential",
      inputs: [
        { label: "필수지출(월)", value: formatKrwWithUnit(emergencyEssentialKrw) },
        { label: "현금성 자산", value: formatKrwWithUnit(emergencyCashKrw) },
        { label: "정책 기준 개월", value: formatMonthsWithUnit(emergencyMonthsPolicy, 0) },
        { label: "비상금 목표액", value: formatKrwWithUnit(emergencyTargetKrw) },
        { label: "비상금 갭", value: formatKrwWithUnit(emergencyGapKrw) },
        { label: "비상금 커버", value: formatMonthsWithUnit(summaryCards.emergencyFundMonths, 1) },
      ],
      assumptions: [
        `정책 기준은 planningPolicy.emergencyFundMonths.caution(${emergencyMonthsPolicy}개월)입니다.`,
        "표시는 개월/원 단위 반올림 결과입니다.",
      ],
      notes: summaryEvidence.emergencyFundMonths?.assumptions ?? [],
    });
  }

  return items;
}
