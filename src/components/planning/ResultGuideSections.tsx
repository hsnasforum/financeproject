"use client";

import { useState } from "react";
import { formatKrw } from "@/lib/planning/i18n/format";
import { type Locale } from "@/lib/planning/i18n";
import { LIMITS } from "@/lib/planning/v2/limits";
import {
  type AggregatedWarningRow,
  type GoalStatusRow,
  type ResultBadgeStatus,
  type TimelinePointRow,
} from "@/lib/planning/v2/resultGuide";

type ResultGuideCardProps = {
  locale: Locale;
  status: ResultBadgeStatus;
  reason: string;
  minCashKrw: number;
  achievedGoals: number;
  totalGoals: number;
  maxDsr: number;
  topActions: string[];
};

type WarningsTableProps = {
  warnings: AggregatedWarningRow[];
};

type GoalsTableProps = {
  locale: Locale;
  goals: GoalStatusRow[];
};

type TimelineSummaryTableProps = {
  locale: Locale;
  rows: TimelinePointRow[];
};

type AdvancedJsonPanelProps = {
  title?: string;
  sections: Array<{ label: string; value: unknown }>;
};

const BADGE_STYLE: Record<ResultBadgeStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  risk: "border-rose-200 bg-rose-50 text-rose-800",
};

const BADGE_LABEL: Record<ResultBadgeStatus, string> = {
  ok: "양호",
  warn: "주의",
  risk: "위험",
};

const SEVERITY_LABEL: Record<AggregatedWarningRow["severity"], string> = {
  critical: "치명",
  warn: "경고",
  info: "정보",
};

function toDsrPct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function monthRangeLabel(row: AggregatedWarningRow): string {
  const first = row.firstMonth;
  const last = row.lastMonth;
  if (typeof first !== "number" && typeof last !== "number") return "-";
  if (typeof first === "number" && typeof last === "number") {
    if (first === last) return `M${first}`;
    return `M${first}~M${last}`;
  }
  if (typeof first === "number") return `M${first}`;
  return `M${last ?? 0}`;
}

export function ResultGuideCard(props: ResultGuideCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">10초 요약</p>
          <p className="mt-1 text-sm text-slate-700">{props.reason}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${BADGE_STYLE[props.status]}`}>
          상태: {BADGE_LABEL[props.status]}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">현금 최저</p>
          <p className="text-sm font-semibold text-slate-900">{formatKrw(props.locale, props.minCashKrw)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">목표 달성</p>
          <p className="text-sm font-semibold text-slate-900">{props.achievedGoals}/{props.totalGoals}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">최대 DSR</p>
          <p className="text-sm font-semibold text-slate-900">{toDsrPct(props.maxDsr)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Top 3 액션</p>
        {props.topActions.length === 0 ? (
          <p className="mt-1">권장 액션이 없습니다. 목표와 경고 표를 먼저 확인하세요.</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {props.topActions.slice(0, 3).map((action, index) => (
              <li key={`${action}-${index}`}>{index + 1}. {action}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function WarningsTable(props: WarningsTableProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleWarnings = expanded ? props.warnings : props.warnings.slice(0, LIMITS.warningsTop);
  const omittedCount = Math.max(0, props.warnings.length - visibleWarnings.length);

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-900">경고 요약</h3>
      <p>동일 경고 코드는 합쳐서 표시합니다. 반복 횟수와 발생 구간을 우선 확인하세요.</p>
      {props.warnings.length === 0 ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
          경고가 없습니다. 현재 가정에서는 위험 신호가 관측되지 않았습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">코드</th>
                <th className="px-3 py-2 text-left">심각도</th>
                <th className="px-3 py-2 text-right">횟수</th>
                <th className="px-3 py-2 text-left">발생월</th>
                <th className="px-3 py-2 text-left">해석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visibleWarnings.map((warning) => (
                <tr key={warning.code}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{warning.code}</td>
                  <td className="px-3 py-2">{SEVERITY_LABEL[warning.severity]}</td>
                  <td className="px-3 py-2 text-right">{warning.count}</td>
                  <td className="px-3 py-2">{monthRangeLabel(warning)}</td>
                  <td className="px-3 py-2">{warning.sampleMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.warnings.length > LIMITS.warningsTop ? (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>{expanded ? `전체 ${props.warnings.length}개 표시 중` : `추가 ${omittedCount}개 경고가 생략되었습니다.`}</span>
          <button
            className="font-semibold text-emerald-700"
            onClick={() => setExpanded((prev) => !prev)}
            type="button"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function GoalsTable(props: GoalsTableProps) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-900">목표 상태</h3>
      <p>부족액이 큰 목표부터 조정하면 경고 완화 효과가 큽니다.</p>
      {props.goals.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">등록된 목표가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">목표</th>
                <th className="px-3 py-2 text-right">기한(월)</th>
                <th className="px-3 py-2 text-right">진행률</th>
                <th className="px-3 py-2 text-right">부족액</th>
                <th className="px-3 py-2 text-left">달성</th>
                <th className="px-3 py-2 text-left">해석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {props.goals.map((goal) => (
                <tr key={goal.goalId}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{goal.name}</td>
                  <td className="px-3 py-2 text-right">{goal.targetMonth > 0 ? goal.targetMonth : "-"}</td>
                  <td className="px-3 py-2 text-right">{goal.progressPct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{formatKrw(props.locale, goal.shortfallKrw)}</td>
                  <td className="px-3 py-2">{goal.achieved ? "예" : "아니오"}</td>
                  <td className="px-3 py-2">{goal.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TimelineSummaryTable(props: TimelineSummaryTableProps) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-900">타임라인 3포인트 요약</h3>
      <p>시작/중간/마지막 지점을 비교하면 흐름 악화 구간을 빠르게 찾을 수 있습니다.</p>
      {props.rows.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">타임라인 데이터가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">구간</th>
                <th className="px-3 py-2 text-right">월</th>
                <th className="px-3 py-2 text-right">현금</th>
                <th className="px-3 py-2 text-right">순자산</th>
                <th className="px-3 py-2 text-right">총부채</th>
                <th className="px-3 py-2 text-right">DSR</th>
                <th className="px-3 py-2 text-left">해석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {props.rows.map((row) => (
                <tr key={`${row.label}-${row.monthIndex}`}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.label}</td>
                  <td className="px-3 py-2 text-right">{row.month}</td>
                  <td className="px-3 py-2 text-right">{formatKrw(props.locale, row.liquidAssetsKrw)}</td>
                  <td className="px-3 py-2 text-right">{formatKrw(props.locale, row.netWorthKrw)}</td>
                  <td className="px-3 py-2 text-right">{formatKrw(props.locale, row.totalDebtKrw)}</td>
                  <td className="px-3 py-2 text-right">{toDsrPct(row.debtServiceRatio)}</td>
                  <td className="px-3 py-2">{row.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdvancedJsonPanel(props: AdvancedJsonPanelProps) {
  const title = props.title ?? "고급 보기 (원본 JSON)";
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">{title}</summary>
      <div className="mt-3 space-y-3">
        {props.sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1 text-xs font-semibold text-slate-700">{section.label}</p>
            <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
              {JSON.stringify(section.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
