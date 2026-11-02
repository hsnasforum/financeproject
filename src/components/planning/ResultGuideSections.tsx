"use client";

import DiagnosisSummary from "@/components/planning/DiagnosisSummary";
import type { DiagnosisAssessment } from "@/lib/planning/v2/insights/diagnosisAssessment";
import { useState } from "react";
import { BodyEmptyState, BodyTableFrame } from "@/components/ui/BodyTone";
import { CspSafeProgressBar } from "@/components/ui/CspSafeProgressBar";
import { formatKrw } from "@/lib/planning/i18n/format";
import { type Locale } from "@/lib/planning/i18n";
import { LIMITS } from "@/lib/planning/v2/limits";
import { cn } from "@/lib/utils";
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
  minCashKrw: number | undefined;
  assessment?: DiagnosisAssessment;
  achievedGoals: number;
  totalGoals: number;
  maxDsr: number | undefined;
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
  ok: "border-primary/20 bg-primary/5 text-navy",
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

const SEVERITY_COLOR: Record<AggregatedWarningRow["severity"], string> = {
  critical: "text-rose-600 bg-rose-50",
  warn: "text-amber-600 bg-amber-50",
  info: "text-sky-600 bg-sky-50",
};

function toDsrPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "확인되지 않음";
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
    <section className="rounded-[2.5rem] border border-slate-200 bg-white p-7 shadow-sm transition-all hover:shadow-md">
      {props.assessment ? <DiagnosisSummary assessment={props.assessment} /> : <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">10초 요약</p>
          <p className="mt-3 text-lg font-bold text-navy leading-snug tracking-tight">{props.reason}</p>
        </div>
        <span className={cn("rounded-full border px-4 py-1.5 text-xs font-black tracking-tight", BADGE_STYLE[props.status])}>
          상태: {BADGE_LABEL[props.status]}
        </span>
      </div>}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.5rem] bg-surface-muted px-5 py-4 border border-slate-100/80">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">현금 최저</p>
          <p className="mt-2 text-xl font-black text-navy tabular-nums tracking-tight">{typeof props.minCashKrw === "number" ? formatKrw(props.locale, props.minCashKrw) : "확인되지 않음"}</p>
        </div>
        <div className="rounded-[1.5rem] bg-surface-muted px-5 py-4 border border-slate-100/80">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">목표 달성</p>
          <p className="mt-2 text-xl font-black text-navy tabular-nums tracking-tight">
            {props.achievedGoals} <span className="text-sm font-bold text-slate-400">/ {props.totalGoals}</span>
          </p>
        </div>
        <div className="rounded-[1.5rem] bg-surface-muted px-5 py-4 border border-slate-100/80">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최대 DSR</p>
          <p className="mt-2 text-xl font-black text-navy tabular-nums tracking-tight">{toDsrPct(props.maxDsr)}</p>
        </div>
      </div>

      <div className="mt-6 rounded-[2rem] bg-primary/10 px-6 py-5 border border-primary/10">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/60">추천 TOP 3 액션</p>
        {props.topActions.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-navy/80 italic">권장 액션이 없습니다. 목표와 경고 표를 먼저 확인하세요.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {props.topActions.slice(0, 3).map((action, index) => (
              <li className="flex items-start gap-3 text-sm font-bold text-navy" key={`${action}-${index}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black">{index + 1}</span>
                <span className="leading-tight pt-0.5">{action}</span>
              </li>
            ))}
          </ul>
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
    <section className="space-y-4">
      <div className="px-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">경고 요약</h3>
        <p className="mt-1 text-xs text-slate-500 font-medium">동일 경고 코드는 합쳐서 표시합니다. 반복 횟수와 발생 구간을 확인하세요.</p>
      </div>
      {props.warnings.length === 0 ? (
        <BodyEmptyState className="rounded-[2.5rem] border-primary/10 bg-primary/30 px-6 py-8" description="저장된 실행 경고가 없습니다. 지표에서 확인한 개별 위험 신호는 위 요약에서 함께 확인하세요." title="경고가 없습니다." />
      ) : (
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-surface-muted">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 text-left">코드</th>
                <th className="px-6 py-4 text-left">심각도</th>
                <th className="px-6 py-4 text-right">횟수</th>
                <th className="px-6 py-4 text-left">발생구간</th>
                <th className="px-6 py-4 text-left">해석 및 샘플</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {visibleWarnings.map((warning) => (
                <tr className="hover:bg-surface-muted/50 transition-colors" key={warning.code}>
                  <td className="px-6 py-4 text-xs font-black text-navy tracking-tight">{warning.code}</td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", SEVERITY_COLOR[warning.severity])}>
                      {SEVERITY_LABEL[warning.severity]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums">{warning.count}회</td>
                  <td className="px-6 py-4 text-xs font-black text-slate-400 tabular-nums">{monthRangeLabel(warning)}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 leading-relaxed">{warning.sampleMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </BodyTableFrame>
      )}
      {props.warnings.length > LIMITS.warningsTop ? (
        <div className="flex items-center justify-between px-4 py-3 rounded-[1.5rem] bg-surface-muted border border-slate-100 text-[11px]">
          <span className="font-bold text-slate-500">{expanded ? `전체 ${props.warnings.length}개 표시 중` : `추가 ${omittedCount}개 경고가 생략되었습니다.`}</span>
          <button
            className="font-black text-primary uppercase tracking-widest hover:text-navy transition-colors"
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
    <section className="space-y-4">
      <div className="px-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">목표 달성 상태</h3>
        <p className="mt-1 text-xs text-slate-500 font-medium">부족액이 큰 목표부터 조정하면 경고 완화 효과가 큽니다.</p>
      </div>
      {props.goals.length === 0 ? (
        <BodyEmptyState className="rounded-[2.5rem] px-6 py-8" description="먼저 목표를 추가하면 플랜 결과와 함께 달성 가능성을 비교할 수 있습니다." title="등록된 목표가 없습니다." />
      ) : (
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-surface-muted">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 text-left">목표</th>
                <th className="px-6 py-4 text-right">기한(월)</th>
                <th className="px-6 py-4 text-right">진행률</th>
                <th className="px-6 py-4 text-right">부족액</th>
                <th className="px-6 py-4 text-left">달성</th>
                <th className="px-6 py-4 text-left">해석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {props.goals.map((goal) => (
                <tr className="group/row hover:bg-surface-muted/50 transition-colors" key={goal.goalId}>
                  <td className="px-6 py-4 text-xs font-black text-navy">{goal.name}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-400 tabular-nums">{goal.targetMonth > 0 ? `M${goal.targetMonth}` : "-"}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs font-black text-navy tabular-nums">{goal.progressPct.toFixed(1)}%</span>
                      <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-muted">
                        <CspSafeProgressBar
                          fillClassName={goal.achieved ? "text-primary" : "text-sky-400"}
                          value={goal.progressPct}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums group-hover/row:text-rose-600 transition-colors">{formatKrw(props.locale, goal.shortfallKrw)}</td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", goal.achieved ? "text-success bg-success/10" : "text-slate-400 bg-surface-muted")}>
                      {goal.achieved ? "달성" : "미달성"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 leading-relaxed">{goal.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </BodyTableFrame>
      )}
    </section>
  );
}

export function TimelineSummaryTable(props: TimelineSummaryTableProps) {
  return (
    <section className="space-y-4">
      <div className="px-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">타임라인 3포인트 요약</h3>
        <p className="mt-1 text-xs text-slate-500 font-medium">시작/중간/마지막 지점을 비교하여 흐름 악화 구간을 식별하세요.</p>
      </div>
      {props.rows.length === 0 ? (
        <BodyEmptyState className="rounded-[2.5rem] px-6 py-8" description="실행 결과가 있으면 시작, 중간, 마지막 구간의 핵심 지표를 비교할 수 있습니다." title="타임라인 데이터가 없습니다." />
      ) : (
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-surface-muted">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 text-left">구간</th>
                <th className="px-6 py-4 text-right">월</th>
                <th className="px-6 py-4 text-right">현금</th>
                <th className="px-6 py-4 text-right">순자산</th>
                <th className="px-6 py-4 text-right">총부채</th>
                <th className="px-6 py-4 text-right">DSR</th>
                <th className="px-6 py-4 text-left">해석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {props.rows.map((row) => (
                <tr className="hover:bg-surface-muted/50 transition-colors" key={`${row.label}-${row.monthIndex}`}>
                  <td className="px-6 py-4 text-xs font-black text-navy">{row.label}</td>
                  <td className="px-6 py-4 text-right text-xs font-black text-slate-400 tabular-nums">M{row.month}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums">{formatKrw(props.locale, row.liquidAssetsKrw)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-primary tabular-nums">{formatKrw(props.locale, row.netWorthKrw)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums">{formatKrw(props.locale, row.totalDebtKrw)}</td>
                  <td className="px-6 py-4 text-right text-xs font-black text-navy tabular-nums">{toDsrPct(row.debtServiceRatio)}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 leading-relaxed">{row.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </BodyTableFrame>
      )}
    </section>
  );
}

export function AdvancedJsonPanel(props: AdvancedJsonPanelProps) {
  const title = props.title ?? "고급 보기 (원본 JSON)";
  return (
    <details className="group rounded-[2rem] border border-slate-200 bg-surface-muted/50 p-5 transition-all">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
        <span className="transition-transform group-open:rotate-90">▶</span>
        {title}
      </summary>
      <div className="mt-5 space-y-4">
        {props.sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{section.label}</p>
            <pre className="max-h-64 overflow-auto rounded-[1.5rem] border border-slate-950/10 bg-slate-950 p-5 text-[11px] leading-relaxed text-slate-300 font-mono shadow-inner">
              {JSON.stringify(section.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
