"use client";

import { type UserInsight } from "@/lib/planning/v2/insights/interpret";
import { Card } from "@/components/ui/Card";

type Props = {
  insight: UserInsight;
};

function severityBadge(severity: UserInsight["severity"]): { label: string; className: string } {
  if (severity === "risk") {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (severity === "warn") {
    return {
      label: "주의",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: "양호",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
}

function warningLevelText(level: "info" | "warn" | "critical"): string {
  if (level === "critical") return "치명";
  if (level === "warn") return "경고";
  return "정보";
}

function formatPeriod(first?: number, last?: number): string {
  if (typeof first !== "number" && typeof last !== "number") return "-";
  if (typeof first === "number" && typeof last === "number") {
    if (first === last) return `M${first + 1}`;
    return `M${first + 1}~M${last + 1}`;
  }
  if (typeof first === "number") return `M${first + 1}`;
  return `M${(last ?? 0) + 1}`;
}

export default function ResultInterpretationCard({ insight }: Props) {
  const badge = severityBadge(insight.severity);
  const primaryStep = insight.nextSteps[0];
  const secondarySteps = insight.nextSteps.slice(1, 3);

  return (
    <Card className="space-y-3 border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Summary</p>
          <h2 className="mt-1 text-base font-bold text-slate-900">한눈에 보는 결과</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-4">
        <p className="text-xs font-semibold text-slate-500">먼저 이 문장만 보세요</p>
        <p className="mt-2 text-base font-bold leading-6 text-slate-900">{insight.headline}</p>
      </section>

      <div>
        <p className="text-xs font-semibold text-slate-700">왜 이렇게 봤냐면</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {insight.bullets.map((bullet, index) => (
            <article className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700" key={`bullet-${index}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reason {index + 1}</p>
              <p className="mt-2 leading-5">{bullet}</p>
            </article>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700">지금 가장 먼저 할 일</p>
        {primaryStep ? (
          <article className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Priority 1</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{primaryStep.title}</p>
            <p className="mt-2 text-slate-700">{primaryStep.why}</p>
          </article>
        ) : (
          <p className="mt-1 text-xs text-slate-600">우선순위로 제안할 실행 항목이 없습니다.</p>
        )}
        {secondarySteps.length > 0 ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {secondarySteps.map((step, index) => (
              <article className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs" key={`${step.title}-${index}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Next {index + 2}</p>
                <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-slate-700">{step.why}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">전문 경고와 세부 근거 보기</summary>
        <div className="mt-2 space-y-2">
          {insight.translatedWarnings.length === 0 ? (
            <p>추가로 확인할 전문 경고는 없습니다.</p>
          ) : insight.translatedWarnings.map((warning) => (
            <article className="rounded-lg border border-slate-200 bg-white px-3 py-2" key={`${warning.code}:${warning.level}`}>
              <p className="text-xs font-semibold text-slate-900">
                [{warningLevelText(warning.level)}] {warning.title}
              </p>
              <p className="mt-1">무슨 뜻인가요: {warning.meaning}</p>
              <p className="mt-1">왜 중요하나요: {warning.impact}</p>
              <p className="mt-1">어떻게 보면 되나요: {warning.suggestion}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                발생: {warning.count ?? 0}회 / 기간: {formatPeriod(warning.months?.first, warning.months?.last)}
              </p>
              <details className="mt-1 text-[11px] text-slate-500">
                <summary className="cursor-pointer">고급(코드 보기)</summary>
                <p className="mt-1 font-mono">{warning.code}</p>
              </details>
            </article>
          ))}
        </div>
      </details>
    </Card>
  );
}
