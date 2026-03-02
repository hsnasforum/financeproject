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

  return (
    <Card className="space-y-3 border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">결과 해석 가이드 (10초 요약)</h2>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
        {insight.headline}
      </p>

      <div>
        <p className="text-xs font-semibold text-slate-700">핵심 진단 Top3</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-700">
          {insight.bullets.map((bullet, index) => (
            <li key={`bullet-${index}`}>{bullet}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700">다음 행동</p>
        <div className="mt-1 space-y-2">
          {insight.nextSteps.slice(0, 3).map((step, index) => (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" key={`${step.title}-${index}`}>
              <p className="font-semibold text-slate-900">[{index + 1}] {step.title}</p>
              <p className="mt-1 text-slate-700">{step.why}</p>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">경고 해석 (Top {insight.translatedWarnings.length})</summary>
        <div className="mt-2 space-y-2">
          {insight.translatedWarnings.length === 0 ? (
            <p>해석할 경고가 없습니다.</p>
          ) : insight.translatedWarnings.map((warning) => (
            <article className="rounded-lg border border-slate-200 bg-white px-3 py-2" key={`${warning.code}:${warning.level}`}>
              <p className="text-xs font-semibold text-slate-900">
                [{warningLevelText(warning.level)}] {warning.title}
              </p>
              <p className="mt-1">의미: {warning.meaning}</p>
              <p className="mt-1">영향: {warning.impact}</p>
              <p className="mt-1">조치: {warning.suggestion}</p>
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
