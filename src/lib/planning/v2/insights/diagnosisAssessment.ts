import type { InterpretationInput, InterpretationVerdict, InterpretationVM } from "./interpretationVm";

export type DiagnosisAssessment = {
  code: InterpretationVerdict;
  label: string;
  headline: string;
  basisLabel: string;
  basisDescription: string;
  missingMetrics: string[];
  signals: Array<{ id: string; severity: "risk" | "caution"; title: string; evidence: string; description: string }>;
};

// Presentation only: retain the frozen three-metric verdict and all stored warnings.
// Individual diagnostics use their existing thresholds, before the UI's top-3 limit.
export function buildDiagnosisAssessment(
  input: InterpretationInput,
  verdict: InterpretationVM["verdict"],
  diagnostics: InterpretationVM["diagnostics"],
): DiagnosisAssessment {
  const signals: DiagnosisAssessment["signals"] = diagnostics
    .filter((item) => item.id !== "snapshot" && item.severity !== "info")
    .map((item) => ({ ...item, severity: item.severity as "risk" | "caution" }));
  for (const [warningCode, severity, minimumCount] of [
    ["NEGATIVE_CASHFLOW", "risk", 1],
    ["CONTRIBUTION_SKIPPED", "caution", 3],
  ] as const) {
    const count = input.aggregatedWarnings.filter((w) => w.code === warningCode)
      .reduce((sum, w) => sum + Math.max(1, w.count), 0);
    if (count >= minimumCount) {
      signals.push({
        id: warningCode, severity,
        title: warningCode === "NEGATIVE_CASHFLOW" ? "기간 중 현금흐름 부족" : "목표 납입 생략",
        evidence: `${count}건`,
        description: warningCode === "NEGATIVE_CASHFLOW"
          ? "저장된 실행에서 현금흐름 부족 경고가 발생했습니다."
          : "저장된 실행에서 목표 납입이 반복해서 생략됐습니다.",
      });
    }
  }
  const missingMetrics = ([
    ["monthlySurplusKrw", "월 잉여금"], ["emergencyFundMonths", "비상금 커버"],
    ["dsrPct", "DSR"], ["worstCashKrw", "기간 중 최저 현금"],
  ] as const).filter(([key]) => !Number.isFinite(input.summary[key])).map(([, label]) => label);
  const code: InterpretationVerdict = signals.some((item) => item.severity === "risk") ? "RISK"
    : signals.length > 0 ? "CAUTION"
      : missingMetrics.length > 0 || verdict.code === "UNKNOWN" ? "UNKNOWN" : "GOOD";
  const label = code === "RISK" ? "위험 신호 있음" : code === "CAUTION" ? "주의 신호 있음"
    : code === "UNKNOWN" ? "확인 필요" : "뚜렷한 위험 신호 없음";
  const headline = code === "RISK" ? "기본 지표 판정과 별개로 개별 위험 신호가 있습니다. 아래 근거를 먼저 확인하세요."
    : code === "CAUTION" ? "주의할 개별 신호가 있습니다. 목표와 경고를 함께 점검하세요."
      : code === "UNKNOWN" ? "확인되지 않은 지표가 있어 전체 상태를 판단하지 않습니다."
        : "확인된 지표에서 뚜렷한 위험 신호는 없습니다. 가정과 데이터 상태를 함께 확인하세요.";
  return {
    code, label, headline, signals, missingMetrics,
    basisLabel: `기본 지표 판정: ${verdict.label}`,
    basisDescription: "월 잉여금·비상금 커버·DSR만 종합한 판정입니다. 기간 중 최저 현금·목표 미달·경고와는 평가 범위가 다릅니다.",
  };
}
