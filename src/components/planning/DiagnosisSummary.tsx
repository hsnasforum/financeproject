import type { DiagnosisAssessment } from "@/lib/planning/v2/insights/diagnosisAssessment";
import { cn } from "@/lib/utils";

export default function DiagnosisSummary({ assessment, showLabel = true }: { assessment: DiagnosisAssessment; showLabel?: boolean }) {
  return (
    <div className="min-w-0 space-y-3 text-sm leading-6" data-testid="diagnosis-assessment" data-state={assessment.code}>
      {showLabel ? <p className={cn("font-bold", assessment.code === "RISK" ? "text-rose-800" : assessment.code === "CAUTION" ? "text-amber-800" : "text-navy")}>{assessment.label}</p> : null}
      <p className="font-semibold text-navy">{assessment.headline}</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="font-semibold">{assessment.basisLabel}</p>
        <p className="text-slate-600">{assessment.basisDescription}</p>
      </div>
      <p className="font-semibold text-slate-700">개별 위험 신호 · 기간 중 최저 현금, 목표와 경고</p>
      {assessment.signals.length ? <ul className="space-y-2">
        {assessment.signals.map((signal) => <li key={signal.id} className={cn("border-l-2 pl-3", signal.severity === "risk" ? "border-rose-300 text-rose-800" : "border-amber-300 text-amber-800")}>
          <span className="font-semibold">{signal.title} · {signal.evidence}</span><br />{signal.description}
        </li>)}
      </ul> : <p>확인된 지표의 개별 위험 신호는 없습니다.</p>}
      {assessment.missingMetrics.length ? <p className="text-slate-600">확인되지 않음: {assessment.missingMetrics.join(" · ")}. 누락된 값을 0으로 간주하지 않습니다.</p> : null}
    </div>
  );
}
