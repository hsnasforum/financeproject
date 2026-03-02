import { type EvidenceItem } from "../v2/insights/evidence";
import { type CandidateKind } from "../reports/productCandidates";

export type BuildCandidatesEvidenceParams = {
  kind: CandidateKind;
  termMonths: number;
  taxRatePct: number;
  usePrimeRate: boolean;
  depositPrincipalWon: number;
  savingMonthlyPaymentWon: number;
};

function asFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundAmount(value: unknown): number {
  return Math.max(0, Math.trunc(asFiniteNumber(value, 0)));
}

function roundPercent(value: unknown): number {
  const parsed = asFiniteNumber(value, 0);
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return Math.round(parsed * 100) / 100;
}

function roundMonths(value: unknown): number {
  return Math.max(1, Math.trunc(asFiniteNumber(value, 12)));
}

export function buildCandidatesEvidence(params: BuildCandidatesEvidenceParams): EvidenceItem {
  const termMonths = roundMonths(params.termMonths);
  const taxRatePct = roundPercent(params.taxRatePct);
  const depositPrincipalWon = roundAmount(params.depositPrincipalWon);
  const savingMonthlyPaymentWon = roundAmount(params.savingMonthlyPaymentWon);
  const rateModeLabel = params.usePrimeRate ? "최고금리 우선(intr_rate2)" : "기본금리 우선(intr_rate)";
  const tabLabel = params.kind === "deposit" ? "예금" : "적금";

  return {
    id: "candidates-comparison",
    title: "후보 비교 계산 근거",
    formula: "예금(simple): gross≈principal×(ratePct/100)×(months/12), net=gross×(1-taxPct/100) | 적금(compound): 월납입 복리 기준 합산 추정 후 세후 이자 반영",
    inputs: [
      { label: "비교 탭", value: tabLabel, unitKind: "months" },
      { label: "기간", value: `${termMonths}개월`, unitKind: "months" },
      { label: "세율", value: `${taxRatePct}%`, unitKind: "pct" },
      { label: "예치금(예금)", value: `${depositPrincipalWon.toLocaleString("ko-KR")}원`, unitKind: "krw" },
      { label: "월 납입액(적금)", value: `${savingMonthlyPaymentWon.toLocaleString("ko-KR")}원`, unitKind: "krw" },
      { label: "금리 선택 모드", value: rateModeLabel, unitKind: "pct" },
    ],
    assumptions: [
      "세후 이자는 입력 세율을 일괄 적용한 추정치입니다.",
      "금리 선택은 기본금리(intr_rate) 또는 최고금리(intr_rate2) 우선 규칙을 따릅니다.",
      "예금은 단리(simple), 적금은 복리(compound) 기준 계산을 사용합니다.",
      "우대조건 충족/세부 약관/실지급 방식에 따라 실제 수령액은 달라질 수 있습니다.",
      "이 섹션은 추천이 아닌 비교용 추정 근거를 제공합니다.",
    ],
  };
}
