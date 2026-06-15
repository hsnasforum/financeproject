import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { formatPct } from "@/lib/planning/i18n/format";
import { cn } from "@/lib/utils";
import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { type ReportVM } from "../../_lib/reportViewModel";
import { CoreMetricEvidenceDock } from "./CoreMetricEvidenceDock";
import {
  PLANNER_ACTION_LINKS,
  type ReportSummaryTone,
  formatMetricMonths,
  formatMoney,
  guideToneClass,
  renderEvidenceValue,
  severityText,
  stageMessage,
} from "./shared";

type ReportDashboardSummarySectionProps = {
  vm: ReportVM;
  simulateReady: boolean;
  leadAction: ReportVM["actionRows"][number] | null;
  summaryTone: ReportSummaryTone;
  basisPreview: string;
  assumptionPreview: string;
  evidenceById: Map<string, EvidenceItem>;
};

export function ReportDashboardSummarySection({
  vm,
  simulateReady,
  leadAction,
  summaryTone,
  basisPreview,
  assumptionPreview,
  evidenceById,
}: ReportDashboardSummarySectionProps) {
  if (!simulateReady) {
    return (
      <Card className="rounded-[2rem] border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-400 italic">핵심 숫자 섹션은 시뮬레이션 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "simulate", "simulate 단계 미완료")})</p>
      </Card>
    );
  }

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-summary-cards">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">우선 액션</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-tight text-navy">
            {leadAction ? leadAction.title : "이번 달 먼저 볼 액션부터 정리했습니다."}
          </h2>
          <p className="mt-3 text-sm font-bold leading-relaxed text-slate-500">
            {leadAction?.summary || summaryTone.reason}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={summaryTone.variant} className="rounded-full px-4 py-1 font-black shadow-sm">
            {summaryTone.label}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-4 py-1 font-black border-slate-200 bg-white text-slate-500 shadow-sm">
            {vm.snapshot.asOf ? `${vm.snapshot.asOf} 기준` : "저장된 실행 기준"}
          </Badge>
        </div>
      </div>

      <ReportHeroStatGrid className="mt-8">
        <ReportHeroStatCard
          description="실수령에서 지출과 상환을 뺀 현재 여력"
          label="매달 남는 돈"
          value={formatMoney(vm.summaryCards.monthlySurplusKrw)}
        >
          <CoreMetricEvidenceDock item={evidenceById.get("monthlySurplus")} />
        </ReportHeroStatCard>
        <ReportHeroStatCard
          description="현재 현금 기준 버틸 수 있는 개월 수"
          label="비상금 버팀력"
          value={formatMetricMonths(vm.summaryCards.emergencyFundMonths)}
        >
          <CoreMetricEvidenceDock item={evidenceById.get("emergency")} />
        </ReportHeroStatCard>
        <ReportHeroStatCard
          description="소득 대비 월 상환 부담 비중"
          label="대출 상환 비중"
          value={typeof vm.summaryCards.dsrPct === "number" ? formatPct("ko-KR", vm.summaryCards.dsrPct) : "-"}
        >
          <CoreMetricEvidenceDock item={evidenceById.get("dsrPct")} />
        </ReportHeroStatCard>
        <ReportHeroStatCard
          description={`치명 경고 ${vm.summaryCards.criticalWarnings ?? 0}건`}
          label="목표 진행"
          value={vm.summaryCards.goalsAchieved ?? "-"}
        />
      </ReportHeroStatGrid>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-100 bg-surface-muted p-6 shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">왜 이 액션을 먼저 보나요</p>
          <p className="mt-3 text-sm font-bold leading-relaxed text-slate-700">
            {leadAction
              ? `${leadAction.summary}${leadAction.steps[0] ? ` 첫 단계는 ${leadAction.steps[0]}입니다.` : ""}`
              : summaryTone.reason}
          </p>
          {leadAction?.cautions[0] ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              <span className="shrink-0">※</span>
              <span>{leadAction.cautions[0]}</span>
            </div>
          ) : null}
        </div>
        <div className="rounded-[2rem] border border-slate-100 bg-surface-muted p-6 shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">계산 기준</p>
          <p className="mt-3 text-sm font-bold leading-relaxed text-slate-700">{basisPreview}</p>
          {assumptionPreview ? (
            <p className="mt-3 text-xs font-bold italic text-slate-400">가정 예시: {assumptionPreview}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

type ReportDashboardOperatingGuideSectionProps = {
  vm: ReportVM;
  simulateReady: boolean;
};

export function ReportDashboardOperatingGuideSection({
  vm,
  simulateReady,
}: ReportDashboardOperatingGuideSectionProps) {
  if (!simulateReady || !vm.monthlyOperatingGuide) return null;
  const operatingGuide = vm.monthlyOperatingGuide;

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-monthly-operating-guide">
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">월급 운영 요약</p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-navy">월급 운영 가이드</h2>
        <p className="mt-3 text-base font-black leading-snug text-slate-700">{operatingGuide.headline}</p>
        <p className="mt-2 text-xs font-bold italic text-slate-400">※ {operatingGuide.basisLabel}</p>
      </div>

      <div className="space-y-10">
        <div className="space-y-4">
          <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">현재 월수입 배분</p>
          <div className="grid gap-4 md:grid-cols-3">
            {operatingGuide.currentSplit.map((item) => (
              <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`current-${item.title}`}>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{formatMoney(item.amountKrw)}</p>
                <p className="mt-1 text-[11px] font-bold opacity-70">월 수입의 {formatPct("ko-KR", item.sharePct)}</p>
                <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-primary">{operatingGuide.nextPlanTitle}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {operatingGuide.nextPlan.map((item) => (
              <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`plan-${item.title}`}>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                {typeof item.amountKrw === "number" ? (
                  <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{formatMoney(item.amountKrw)}</p>
                ) : null}
                {typeof item.sharePct === "number" ? (
                  <p className="mt-1 text-[11px] font-bold opacity-70">
                    {operatingGuide.nextPlanTitle === "남는 돈 운영안"
                      ? `가용 재원의 ${formatPct("ko-KR", item.sharePct)}`
                      : `권장 비중 ${formatPct("ko-KR", item.sharePct)}`}
                  </p>
                ) : null}
                <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

type ReportDashboardDisclosureSectionProps = {
  vm: ReportVM;
  appliedOverrides: NonNullable<ReportVM["reproducibility"]>["appliedOverrides"];
  hasNormalization: boolean;
  renderOverrideReason: (reason?: string) => string;
};

export function ReportDashboardDisclosureSection({
  vm,
  appliedOverrides,
  hasNormalization,
  renderOverrideReason,
}: ReportDashboardDisclosureSectionProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card className="rounded-[2rem] border-slate-100 bg-white p-6 shadow-sm" data-testid="assumptions-overrides-panel">
        <details className="group/disclosure">
          <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open/disclosure:text-slate-600">
            <span className="transition-transform group-open/disclosure:rotate-90">▶</span>
            적용된 가정 오버라이드 ({appliedOverrides.length})
          </summary>
          {appliedOverrides.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-slate-50 pt-4">
              {appliedOverrides.map((override) => (
                <li className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-600" key={`${override.key}:${override.updatedAt}`}>
                  <span className="font-black text-primary">조정 항목</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-navy">{renderOverrideReason(override.reason)}</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-navy">{override.value}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-slate-300">{override.updatedAt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-center text-xs font-bold italic text-slate-300">적용된 오버라이드가 없습니다.</p>
          )}
        </details>
      </Card>

      {hasNormalization ? (
        <Card className="rounded-[2rem] border-slate-100 bg-white p-6 shadow-sm" data-testid="report-normalization-disclosure">
          <details className="group/disclosure">
            <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open/disclosure:text-slate-600">
              <span className="transition-transform group-open/disclosure:rotate-90">▶</span>
              자동 보정/기본값 적용 내역
            </summary>
            <div className="mt-4 space-y-4 border-t border-slate-50 pt-4">
              {vm.normalization?.defaultsApplied.length ? (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">기본값 자동 적용</p>
                  <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-slate-600">
                    {vm.normalization.defaultsApplied.map((item) => (
                      <li key={`default-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {vm.normalization?.fixesApplied.length ? (
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">자동 보정</p>
                  <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-slate-600">
                    {vm.normalization.fixesApplied.map((fix, index) => (
                      <li key={`${fix.path}-${index}`}>
                        <span className="text-primary">{fix.path}</span>: {fix.message}
                        {fix.from !== undefined || fix.to !== undefined
                          ? <span className="ml-1 text-slate-400">({renderEvidenceValue(fix.from)} → {renderEvidenceValue(fix.to)})</span>
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

type ReportDashboardWarningsSectionProps = {
  vm: ReportVM;
  simulateReady: boolean;
  topWarnings: ReportVM["warningAgg"];
  extraWarnings: ReportVM["warningAgg"];
};

export function ReportDashboardWarningsSection({
  simulateReady,
  topWarnings,
  extraWarnings,
}: ReportDashboardWarningsSectionProps) {
  if (!simulateReady) return null;

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="planning-reports-warnings-section">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">주의 목록</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-navy">주의가 필요한 부분</h2>
        </div>
        <Badge variant="destructive" className="rounded-full px-4 py-1 font-black">
          {topWarnings.length}개 우선 확인
        </Badge>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
        <table className="min-w-full divide-y divide-slate-100 text-sm" data-testid="report-warnings-table">
          <thead className="bg-surface-muted text-slate-400">
            <tr>
              <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">경고 항목</th>
              <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">심각도</th>
              <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">발생 이력</th>
              <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">상세 설명</th>
              <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">권장 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {topWarnings.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center font-bold text-slate-400" colSpan={5}>검출된 경고가 없습니다.</td>
              </tr>
            ) : topWarnings.map((warning) => (
              <tr className="group transition-colors hover:bg-surface-muted/50" key={`${warning.code}:${warning.subjectKey ?? "-"}`}>
                <td className="px-4 py-4">
                  <p className="font-black text-navy">{warning.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{warning.code}{warning.subjectLabel ? ` · ${warning.subjectLabel}` : ""}</p>
                </td>
                <td className="px-4 py-4">
                  <Badge variant={warning.severityMax === "critical" ? "destructive" : "warning"} className="h-5 border-none px-1.5 text-[9px] font-black">
                    {severityText(warning.severityMax)}
                  </Badge>
                </td>
                <td className="px-4 py-4 text-xs font-bold tabular-nums text-slate-500">{warning.count}회 · {warning.periodMinMax}</td>
                <td className="px-4 py-4 text-xs font-medium leading-relaxed text-slate-600">{warning.plainDescription}</td>
                <td className="px-4 py-4">
                  {warning.suggestedActionId ? (
                    <span className="text-[11px] font-black uppercase tracking-widest text-primary underline decoration-primary/20 underline-offset-4">{warning.suggestedActionId}</span>
                  ) : <span className="text-slate-300">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extraWarnings.length > 0 ? (
        <details className="group/extra mt-4 rounded-[1.5rem] border border-slate-100 bg-surface-muted/50 px-5 py-4 transition-all">
          <summary className="list-none flex items-center gap-2 cursor-pointer text-xs font-black text-slate-400 group-open/extra:text-slate-600">
            <span className="transition-transform group-open/extra:rotate-90">▶</span>
            추가 {extraWarnings.length}개 경고 더 보기
          </summary>
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {extraWarnings.map((warning) => (
              <li className="flex items-center gap-3 text-[11px] font-bold text-slate-600" key={`${warning.code}:${warning.subjectKey ?? "-"}:extra`}>
                <Badge variant={warning.severityMax === "critical" ? "destructive" : "warning"} className="h-4 shrink-0 border-none px-1 text-[8px] font-black">
                  {severityText(warning.severityMax)}
                </Badge>
                <span className="font-black text-navy">{warning.title}</span>
                <span className="tabular-nums text-slate-300">({warning.count}회)</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

type ReportDashboardGoalsSectionProps = {
  vm: ReportVM;
  simulateReady: boolean;
};

export function ReportDashboardGoalsSection({
  vm,
  simulateReady,
}: ReportDashboardGoalsSectionProps) {
  if (!simulateReady) return null;

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-goals-table">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">목표</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-navy">목표 진행 현황</h2>
        </div>
        <Badge variant="secondary" className="rounded-full px-4 py-1 font-black bg-primary/5 text-navy border-none">
          총 {vm.goalsTable.length}개 목표
        </Badge>
      </div>

      {vm.goalsTable.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-100 py-12 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-300">목표 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-surface-muted text-slate-400">
              <tr>
                <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest">목표명</th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest">목표액</th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest">현재 자산</th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest">부족액</th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest">기한</th>
                <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {vm.goalsTable.map((goal, index) => (
                <tr className="group transition-colors hover:bg-surface-muted/50" key={`${goal.name}-${index}`}>
                  <td className="px-4 py-4 font-black text-navy">{goal.name}</td>
                  <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{formatMoney(goal.targetAmount)}</td>
                  <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{formatMoney(goal.currentAmount)}</td>
                  <td className={cn("px-4 py-4 text-right font-black tabular-nums", goal.shortfall > 0 ? "text-danger" : "text-success")}>
                    {goal.shortfall > 0 ? formatMoney(goal.shortfall) : "충족"}
                  </td>
                  <td className="px-4 py-4 text-right font-black tabular-nums text-slate-400">{goal.targetMonth > 0 ? `M${goal.targetMonth}` : "-"}</td>
                  <td className="px-4 py-4 text-center">
                    <Badge variant={goal.achieved ? "success" : "secondary"} className="rounded-lg border-none px-2 py-0.5 text-[10px] font-black uppercase">
                      {goal.achieved ? "달성" : "진행 중"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type ReportDashboardActionsSectionProps = {
  vm: ReportVM;
  actionsReady: boolean;
  emergencyRecommendHref: string | null;
  goalRecommendHref: string | null;
  housingSupportContext: "goal" | "action" | null;
  housingSupportTitle: string;
  housingSupportSummary: string;
};

export function ReportDashboardActionsSection({
  vm,
  actionsReady,
  emergencyRecommendHref,
  goalRecommendHref,
  housingSupportContext,
  housingSupportTitle,
  housingSupportSummary,
}: ReportDashboardActionsSectionProps) {
  if (!actionsReady) {
    return (
      <Card className="rounded-[2rem] border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-400 italic">실행 제안 섹션은 actions 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "actions", "actions 단계 미완료")})</p>
      </Card>
    );
  }

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-top-actions">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">실행 순서</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-navy">추천 실행 순서</h2>
        </div>
        <Badge variant="warning" className="rounded-full px-4 py-1 font-black shadow-sm">
          우선순위 {vm.topActions.length}개
        </Badge>
      </div>

      {housingSupportContext ? (
        <div className="mb-8 rounded-[1.75rem] border border-sky-100 bg-sky-50/70 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">주거 판단 보조</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-black leading-relaxed text-navy">{housingSupportTitle}</p>
              <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">{housingSupportSummary}</p>
            </div>
            <Link
              className="inline-flex items-center rounded-xl bg-sky-600 px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-sky-900/10 transition hover:bg-sky-700 active:scale-95"
              href={PLANNER_ACTION_LINKS.subscriptionHousing.href}
            >
              청약 공고 다시 보기
            </Link>
          </div>
        </div>
      ) : null}

      {vm.topActions.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-100 py-12 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-300">권장 액션이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {vm.topActions.map((action) => {
            const actionCtaLink = action.code === "BUILD_EMERGENCY_FUND" && emergencyRecommendHref
              ? { href: emergencyRecommendHref, label: PLANNER_ACTION_LINKS.emergencyRecommend.label }
              : action.code === "COVER_LUMP_SUM_GOAL" && goalRecommendHref
                ? { href: goalRecommendHref, label: PLANNER_ACTION_LINKS.savingRecommend.label }
                : action.code === "REDUCE_DEBT_SERVICE"
                  ? { href: PLANNER_ACTION_LINKS.creditLoanProducts.href, label: PLANNER_ACTION_LINKS.creditLoanProducts.label }
                  : null;

            return (
              <article className="rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6 shadow-inner transition-all hover:bg-white hover:shadow-md" key={action.code}>
                <Badge variant={action.severity === "critical" ? "destructive" : "warning"} className="mb-3 h-5 border-none px-1.5 text-[9px] font-black">
                  {severityText(action.severity)}
                </Badge>
                <h3 className="text-lg font-black leading-snug tracking-tight text-navy">{action.title}</h3>
                <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">{action.summary}</p>
                <div className="mt-6 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">핵심 단계</p>
                  <ul className="space-y-1.5">
                    {action.steps.slice(0, 3).map((step, index) => (
                      <li className="flex gap-2 text-[11px] font-bold text-slate-700" key={`${action.code}-step-${index}`}>
                        <span className="shrink-0 text-primary">•</span>
                        <span className="leading-tight">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {actionCtaLink ? (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <Link
                      className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-navy/10 transition hover:bg-navy active:scale-95"
                      href={actionCtaLink.href}
                    >
                      {actionCtaLink.label}
                    </Link>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

type ReportDashboardSimulationDebtSectionProps = {
  vm: ReportVM;
  monteReady: boolean;
  debtReady: boolean;
};

export function ReportDashboardSimulationDebtSection({
  vm,
  monteReady,
  debtReady,
}: ReportDashboardSimulationDebtSectionProps) {
  if (!monteReady && !debtReady) return null;

  return (
    <>
      {monteReady && vm.monteCarloSummary ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">확률 시뮬레이션</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-navy">변동성 시뮬레이션</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {vm.monteCarloSummary.keyProbs.map((item) => (
              <div className="rounded-2xl border border-slate-100 bg-surface-muted p-5" key={item.key}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                <p className="text-xl font-black tabular-nums text-navy">{formatPct("ko-KR", item.probability * 100)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {debtReady && vm.debtSummary ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">대출 요약</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-navy">대출 부담 요약</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-surface-muted p-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">월 상환액</p>
              <p className="text-xl font-black tabular-nums text-navy">{formatMoney(vm.debtSummary.meta.totalMonthlyPaymentKrw)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-surface-muted p-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">현재 DSR</p>
              <p className="text-xl font-black tabular-nums text-primary">{formatPct("ko-KR", vm.debtSummary.meta.debtServiceRatio * 100)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-surface-muted p-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">대환 비교</p>
              <p className="text-xl font-black tabular-nums text-navy">{vm.debtSummary.refinance?.length ?? 0}건 가능</p>
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}
