import PlanningMiniCharts from "@/components/planning/workspace/PlanningMiniCharts";
import {
  AdvancedJsonPanel,
  GoalsTable,
  ResultGuideCard,
  TimelineSummaryTable,
  WarningsTable,
} from "@/components/planning/ResultGuideSections";
import DisclosuresPanel from "@/components/planning/DisclosuresPanel";
import EvidencePanel from "@/components/planning/EvidencePanel";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  BodyInset,
  BodyStatusInset,
  BodyTableFrame,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import {
  formatDateTime,
  formatSeverityKo,
  STEP_LABELS,
} from "@/components/planning/workspace/panels/shared";
import { t, type Locale } from "@/lib/planning/i18n";
import { formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { resolveWarningCatalog } from "@/lib/planning/catalog/warningCatalog";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import { buildEvidence } from "@/lib/planning/v2/insights/evidence";
import { LIMITS } from "@/lib/planning/v2/limits";
import { aggregateWarnings as aggregateGuideWarnings } from "@/lib/planning/v2/resultGuide";
import { cn } from "@/lib/utils";

const RESULT_TAB_LABELS_KO = {
  summary: "핵심 요약", warningsGoals: "주의 신호·목표", actions: "실행 계획",
  scenarios: "조건별 비교", monteCarlo: "확률 분석", debt: "부채 분석",
} as const;

function warningSummaryLabel(code: string): string {
  const entry = resolveWarningCatalog(code);
  return entry.title === code ? entry.plainDescription : entry.title;
}

function formatNumber(locale: Locale, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatRatioPct(locale: Locale, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function formatDisclosureValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("ko-KR");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return "-";
}

export function PlanningWorkspaceResultsPanel({
  results,
  actions,
}: {
  results: PlanningWorkspaceGroups["results"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const {
    locale,
    debugEnabled,
    optimizeCandidates,
    optimizeResult,
    runResult,
    guideBadge,
    achievedGoalCount,
    goalTableRows,
    topActionTitles,
    activeTab,
    showAllActions,
    tabs,
    metricEvidenceItems,
    combinedNormalizationReport,
    summaryMonthlySurplusKrw,
    summaryEmergencyFundMonths,
    summaryEndNetWorthKrw,
    summaryWorstCashKrw,
    summaryWorstCashMonth,
    summaryGoalsText,
    summaryDsr,
    summaryEvidence,
    summaryCriticalWarnings,
    aggregatedWarningsForInsight,
    goalsForInsight,
    actionsTopForInsight,
    workspaceSnapshotState,
    monteDepletionProb,
    savedRun,
    resultDto,
    keyFindings,
    warningsSummaryTop5,
    currentStepStatuses,
    runsPageHref,
    chartMode,
    chartPoints,
    aggregatedWarnings,
    timelineSummaryRows,
    warningsGoalsDebugSections,
    scenariosStatus,
    hasScenariosData,
    scenariosBaseSummary,
    scenariosBaseWarnings,
    scenarioComparisonRows,
    scenariosDebugSections,
    monteCarloStatus,
    hasMonteCarloData,
    monteData,
    monteEndNetWorth,
    monteWorstCash,
    monteCarloDebugSections,
    actionsStatus,
    visibleActionRows,
    actionTableRows,
    omittedActionRows,
    actionsDebugSections,
    debtStatus,
    hasDebtData,
    debtMeta,
    debtSummaries,
    debtRefinance,
    debtWarnings,
    debtWhatIfSummary,
    debtDebugSections,
  } = results;
  const {
    copyStrategyAction,
    setActiveTab,
    setShowAllActions,
  } = actions;

  return (
    <>
      {optimizeCandidates.length > 0 ? (
        <Card className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">실험용 최적화 후보</h2>
            <p className="text-xs text-slate-500">
              snapshot: {optimizeResult?.meta?.snapshot?.id ?? "latest"} / {optimizeCandidates.length}개
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {optimizeCandidates.map((candidate, index) => {
              const strategy = asRecord(candidate.strategy);
              const score = asRecord(candidate.score);
              const why = asArray(candidate.why).map((item) => String(item));
              const cautions = asArray(candidate.cautions).map((item) => String(item));
              const summary = asRecord(asRecord(candidate.result).summary);
              return (
                <div className="rounded-xl border border-slate-200 bg-surface-muted p-3 text-xs text-slate-700" key={`${String(candidate.id ?? index)}`}>
                  <p className="font-semibold text-navy">{String(candidate.title ?? `Candidate ${index + 1}`)}</p>
                  <p className="mt-1">목표 달성 수: {formatNumber(locale, score.goalsAchieved)} / 최저 현금: {formatKrw(locale, Number(score.worstCashKrw ?? 0))} / 말기 순자산: {formatKrw(locale, Number(score.endNetWorthKrw ?? 0))}</p>
                  <p className="mt-1">총이자: {formatKrw(locale, Number(score.totalInterestKrw ?? summary.totalInterestKrw ?? 0))}</p>
                  <div className="mt-2 space-y-1">
                    {why.map((line, whyIndex) => (
                      <p key={`${String(candidate.id ?? index)}-why-${whyIndex}`}>- {line}</p>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1 text-amber-800">
                    {cautions.map((line, cautionIndex) => (
                      <p key={`${String(candidate.id ?? index)}-caution-${cautionIndex}`}>* {line}</p>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={() => void copyStrategyAction(strategy)} size="sm" variant="outline">전략 값 복사</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {runResult ? (
        <div className="mt-8 scroll-mt-28 space-y-6 outline-none" id="planning-workspace-results" data-testid="planning-workspace-results" tabIndex={-1}>
          <header className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
            <div><h2 className="text-2xl font-bold tracking-tight text-navy">진단 결과</h2><p className="mt-1 text-sm leading-6 text-slate-600">핵심 상태와 할 일부터 확인하고, 근거는 필요할 때 펼쳐보세요.</p></div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              {savedRun ? <BodyActionLink href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(savedRun.id)}`, savedRun.profileId)}>저장된 리포트 열기</BodyActionLink> : null}
              <a className="inline-flex min-h-11 items-center text-primary hover:underline" href="#planning-input-section">입력으로 돌아가기</a>
            </div>
          </header>
          {currentStepStatuses.some((step) => step.state === "FAILED") ? <BodyStatusInset tone="warning">일부 계산을 완료하지 못했습니다: {currentStepStatuses.filter((step) => step.state === "FAILED").map((step) => STEP_LABELS[step.id]).join(", ")}</BodyStatusInset> : null}
          {savedRun ? <p className="text-sm leading-6 text-slate-600">계산 기록이 저장되었습니다. <BodyActionLink href={runsPageHref}>실행 내역 확인</BodyActionLink></p> : <p role="status" className="text-sm leading-6 text-amber-900">계산 기록의 저장 여부를 확인해 주세요. 현재 화면의 결과를 저장된 리포트로 간주하지 마세요.</p>}
          <div className="min-w-0">
            <ResultGuideCard
              locale={locale}
              status={guideBadge.status}
              reason={guideBadge.reason}
              minCashKrw={guideBadge.minCashKrw}
              achievedGoals={achievedGoalCount}
              totalGoals={goalTableRows.length}
              maxDsr={guideBadge.maxDsr}
              topActions={topActionTitles}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-surface-muted p-4">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                <span>결과 해석 가이드</span>
                <span className="transition-transform group-open:rotate-180">↓</span>
              </summary>
              <div className="mt-4 grid gap-3 text-[11px] font-bold text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                <p className="rounded-xl border border-slate-100 bg-white p-3">
                  <span className="mb-1 block text-primary">월 현금흐름 적자</span>
                  월 적자 상태입니다. 지출 절감 또는 부채/적립 조정을 먼저 점검하세요.
                </p>
                <p className="rounded-xl border border-slate-100 bg-white p-3">
                  <span className="mb-1 block text-primary">부채 상환 부담 높음</span>
                  DSR이 높습니다. 상환 기간/금리/추가상환 시나리오를 비교하세요.
                </p>
                <p className="rounded-xl border border-slate-100 bg-white p-3">
                  <span className="mb-1 block text-primary">계산 기준 데이터 오래됨</span>
                  계산 기준 데이터가 오래됐습니다. 데이터 상태를 확인한 뒤 다시 실행해 보세요.
                </p>
                <p className="rounded-xl border border-slate-100 bg-white p-3">
                  <span className="mb-1 block text-slate-400">확률 시뮬레이션</span>
                  통계 기반 참고값이며 보장값이 아닙니다.
                </p>
                <p className="rounded-xl border border-slate-100 bg-white p-3">
                  <span className="mb-1 block text-slate-400">실행 계획 후보</span>
                  실행 비교용 제안 목록입니다. 특정 상품 가입 권유가 아닙니다.
                </p>
              </div>
            </details>
          </div>

          <Card className="min-w-0 space-y-6 p-4 sm:p-6">
            <div className="max-w-full border-b border-slate-200 pb-3" aria-label="진단 결과 항목">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={activeTab === tab.id}
                    className={cn(
                      "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                      activeTab === tab.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {locale === "ko-KR" ? RESULT_TAB_LABELS_KO[tab.id] : tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "summary" ? (
              <div className="space-y-6" data-testid="planning-result-summary">
                {keyFindings.length > 0 ? (
                  <section aria-label="이번 진단에서 확인할 점" className="rounded-xl bg-slate-50 p-4 sm:p-5" data-testid="planning-key-findings">
                    <h3 className="text-base font-semibold text-navy">이번 진단에서 확인할 점</h3>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {keyFindings.slice(0, 3).map((line, index) => <li key={`finding-${index}`} className="flex gap-3"><span className="shrink-0 font-semibold text-primary">{index + 1}.</span><span>{line}</span></li>)}
                    </ol>
                  </section>
                ) : null}
                <p className="text-sm leading-6 text-slate-600" data-testid="planning-result-basis">기준일 {resultDto?.meta.snapshot.asOf ?? "미확인"} · 계산 시점 {formatDateTime(locale, resultDto?.meta.generatedAt)}{resultDto?.meta.snapshot.missing ? " · 기준 데이터 누락" : ""}</p>
                <BodyInset>
                  <p className="font-semibold text-navy">주의 신호 요약 (최대 5개)</p>
                  {warningsSummaryTop5.length === 0 ? (
                    <p className="mt-1">경고가 없습니다.</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {warningsSummaryTop5.map((warning) => (
                        <p key={`${warning.code}:${warning.severity}`}>
                          [{formatSeverityKo(warning.severity)}] {warningSummaryLabel(warning.code)} · {warning.count}회
                        </p>
                      ))}
                    </div>
                  )}
                </BodyInset>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="mb-1 text-sm font-semibold uppercase text-slate-400">말기 순자산</p>
                    <p className="text-sm font-semibold tabular-nums text-navy">{formatKrw(locale, summaryEndNetWorthKrw)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="mb-1 text-sm font-semibold uppercase text-slate-400">최저 현금(월)</p>
                    <p className="text-sm font-semibold tabular-nums text-navy">{formatKrw(locale, summaryWorstCashKrw)} <span className="ml-1 text-sm font-bold text-slate-400">(M{summaryWorstCashMonth + 1})</span></p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="mb-1 text-sm font-semibold uppercase text-slate-400">목표 달성</p>
                    <p className="text-sm font-semibold text-primary">{summaryGoalsText}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="mb-1 text-sm font-semibold uppercase text-slate-400">DSR</p>
                    <p className="text-sm font-semibold text-navy">{typeof summaryDsr === "number" ? formatRatioPct(locale, summaryDsr) : "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="mb-1 text-sm font-semibold uppercase text-slate-400">치명 경고</p>
                    <p className={cn("text-sm font-semibold", summaryCriticalWarnings > 0 ? "text-danger" : "text-success")}>{summaryCriticalWarnings}</p>
                  </div>
                </div>

                <details className="rounded-xl border border-slate-200 p-4 sm:p-5" data-testid="planning-result-interpretation">
                  <summary className="cursor-pointer py-1 text-sm font-semibold text-navy">자세한 해석과 실행 제안</summary>
                  <div className="mt-5 min-w-0">
                <InterpretabilityGuideCard
                  summaryMetrics={{
                    ...(typeof summaryMonthlySurplusKrw === "number" ? { monthlySurplusKrw: summaryMonthlySurplusKrw } : {}),
                    ...(typeof summaryEmergencyFundMonths === "number" ? { emergencyFundMonths: summaryEmergencyFundMonths } : {}),
                    endNetWorthKrw: summaryEndNetWorthKrw,
                    worstCashKrw: summaryWorstCashKrw,
                    worstCashMonthIndex: summaryWorstCashMonth,
                    ...(typeof summaryDsr === "number" ? { dsrPct: summaryDsr } : {}),
                    ...(summaryGoalsText !== "-" ? { goalsAchievedText: summaryGoalsText } : {}),
                  }}
                  summaryEvidence={buildEvidence(
                    {
                      summaryCards: {
                        monthlySurplusKrw: summaryMonthlySurplusKrw ?? undefined,
                        dsrPct: summaryDsr ?? undefined,
                        emergencyFundMonths: summaryEmergencyFundMonths ?? undefined,
                      },
                    },
                    undefined,
                    summaryEvidence,
                  )}
                  aggregatedWarnings={aggregatedWarningsForInsight.map((warning) => ({
                    code: warning.code,
                    severity: warning.severity,
                    count: warning.count,
                    ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
                    ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
                    ...(typeof warning.sampleMessage === "string" ? { sampleMessage: warning.sampleMessage } : {}),
                  }))}
                  goals={goalsForInsight.map((goal) => ({
                    goalId: goal.id,
                    name: goal.name,
                    achieved: goal.achieved,
                    targetMonth: goal.targetMonth,
                    progressPct: goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0,
                    shortfallKrw: goal.shortfall,
                    interpretation: goal.comment,
                  }))}
                  outcomes={{
                    ...(actionsTopForInsight.length > 0 ? { actionsTop: actionsTopForInsight } : {}),
                    snapshotMeta: workspaceSnapshotState.outcomesMeta,
                    monteCarlo: {
                      retirementDepletionBeforeEnd: monteDepletionProb,
                    },
                    ...(savedRun?.id ? { runId: savedRun.id } : {}),
                  }}
                />

                  </div>
                </details>
                <details className="rounded-xl border border-slate-200 p-4 sm:p-5" data-testid="planning-result-evidence">
                  <summary className="cursor-pointer py-1 text-sm font-semibold text-navy">계산 근거와 적용 데이터</summary>
                  <div className="mt-5 min-w-0 space-y-6">
                <div className="space-y-4" data-testid="planning-metric-evidence">
                  <SubSectionHeader
                    title="계산 근거"
                    titleClassName="text-sm"
                    description="현재 입력값과 선택한 정책 기준으로 계산된 중간 단계 데이터입니다."
                  />
                  <div className="overflow-x-auto">
                    <EvidencePanel
                      items={metricEvidenceItems}
                      locale={locale}
                      formatNumber={(value) => formatNumber(locale, value)}
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-[2rem]">
                  <DisclosuresPanel report={combinedNormalizationReport} />
                </div>

                {Object.keys(summaryEvidence).length > 0 ? (
                  <details className="group rounded-2xl border border-slate-200 p-4" data-testid="planning-summary-evidence">
                    <summary className="flex cursor-pointer items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                      <span>요약 지표 계산 근거</span>
                      <span className="transition-transform group-open:rotate-180">↓</span>
                    </summary>
                    <div className="mt-6 space-y-4">
                      {Object.entries(summaryEvidence).map(([metric, evidence]) => (
                        evidence ? (
                          <div className="rounded-xl border border-slate-100 bg-surface-muted p-5" key={metric}>
                            <p className="text-sm font-black text-navy">{metric}</p>
                            <p className="mt-2 inline-block rounded bg-primary/5 px-2 py-1 text-xs font-bold text-primary">공식: {evidence.formula}</p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">입력 데이터</p>
                                <ul className="space-y-1 text-[11px] font-bold text-slate-600">
                                  {Object.entries(evidence.inputs).map(([key, value]) => (
                                    <li className="flex justify-between border-b border-slate-200/50 pb-1" key={`${metric}:${key}`}>
                                      <span>{key}</span>
                                      <span className="text-navy">{formatDisclosureValue(value)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">적용 가정</p>
                                <ul className="space-y-1 text-[11px] font-medium text-slate-500">
                                  {evidence.assumptions.map((assumption, index) => (
                                    <li key={`${metric}:assumption:${index}`}>• {assumption}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </details>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  <BodyInset>{t(locale, "SUMMARY_LABEL_GENERATED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.generatedAt)}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_ID")}: <span className="font-semibold">{resultDto?.meta.snapshot.id ?? "최신 데이터"}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_AS_OF")}: <span className="font-semibold">{resultDto?.meta.snapshot.asOf ?? "-"}</span></BodyInset>
                  <BodyInset>{t(locale, "SUMMARY_LABEL_SNAPSHOT_FETCHED_AT")}: <span className="font-semibold">{formatDateTime(locale, resultDto?.meta.snapshot.fetchedAt)}</span></BodyInset>
                  <BodyInset>기준일 경과 일수: <span className="font-semibold">{formatNumber(locale, resultDto?.meta.health?.snapshotStaleDays)}</span></BodyInset>
                  <BodyInset>기준 데이터 누락: <span className="font-semibold">{resultDto?.meta.snapshot.missing ? "예" : "아니요"}</span></BodyInset>
                </div>

                  </div>
                </details>
              </div>
            ) : null}

            {activeTab === "warningsGoals" ? (
              <div className="animate-in fade-in mt-6 space-y-6 duration-300">
                <SubSectionHeader title={t(locale, "CHARTS_HEADER")} titleClassName="text-sm" />
                {chartMode === "none" ? (
                  <EmptyState title={t(locale, "CHART_NOT_AVAILABLE")} />
                ) : (
                  <PlanningMiniCharts locale={locale} mode={chartMode} points={chartPoints} />
                )}

                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-xs font-bold leading-relaxed text-navy">
                  💡 해석: 상태 배지와 아래 표를 함께 보면 반복 경고, 목표 부족액, 현금흐름 악화 구간을 빠르게 확인할 수 있습니다.
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <SubSectionHeader title="발생 경고 요약" titleClassName="text-[11px]" />
                    <WarningsTable warnings={aggregatedWarnings} />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="space-y-4">
                      <SubSectionHeader title="목표 달성 상태" titleClassName="text-[11px]" />
                      <GoalsTable locale={locale} goals={goalTableRows} />
                    </div>
                    <div className="space-y-4">
                      <SubSectionHeader title="주요 지표 타임라인" titleClassName="text-[11px]" />
                      <TimelineSummaryTable locale={locale} rows={timelineSummaryRows} />
                    </div>
                  </div>
                </div>

                {debugEnabled && warningsGoalsDebugSections.length > 0 ? (
                  <AdvancedJsonPanel
                    sections={warningsGoalsDebugSections}
                    title="고급 보기 (canonical 요약)"
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "scenarios" ? (
              <div className="animate-in fade-in mt-6 space-y-6 duration-300">
                {scenariosStatus.state === "FAILED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                    시나리오 단계 실패: {scenariosStatus.message ?? "시나리오 계산에 실패했습니다."}
                  </div>
                ) : !hasScenariosData ? (
                  <EmptyState title="시나리오 결과가 없습니다" />
                ) : (
                  <>
                    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-xs font-bold leading-relaxed text-navy">
                      💡 해석: 기준 대비 순자산 변화와 목표 달성 변화를 함께 보면 어떤 가정이 결과를 악화시키는지 빠르게 파악할 수 있습니다.
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="mb-1 text-[10px] font-black uppercase text-slate-400">기준 말기 순자산</p>
                        <p className="text-sm font-black tabular-nums text-navy">{formatKrw(locale, Number(scenariosBaseSummary.endNetWorthKrw ?? 0))}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="mb-1 text-[10px] font-black uppercase text-slate-400">기준 최저 현금</p>
                        <p className="text-sm font-black tabular-nums text-navy">{formatKrw(locale, Number(scenariosBaseSummary.worstCashKrw ?? 0))}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="mb-1 text-[10px] font-black uppercase text-slate-400">기준 목표 달성</p>
                        <p className="text-sm font-black tabular-nums text-navy">{formatNumber(locale, scenariosBaseSummary.goalsAchieved)}건</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="mb-1 text-[10px] font-black uppercase text-slate-400">기준 경고 수</p>
                        <p className="text-sm font-black tabular-nums text-navy">{formatNumber(locale, scenariosBaseSummary.warningsCount)}개</p>
                      </div>
                    </div>

                    <WarningsTable warnings={aggregateGuideWarnings(scenariosBaseWarnings)} />

                    <div className="space-y-4">
                      <SubSectionHeader title="시나리오 비교 표" titleClassName="text-sm" />
                      {scenarioComparisonRows.length === 0 ? (
                        <EmptyState title="시나리오 결과가 없습니다" />
                      ) : (
                        <BodyTableFrame>
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-surface-muted">
                              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-3 text-left">시나리오</th>
                                <th className="px-4 py-3 text-right">말기 순자산</th>
                                <th className="px-4 py-3 text-right">기준 대비</th>
                                <th className="px-4 py-3 text-right">목표 달성</th>
                                <th className="px-4 py-3 text-right">달성 변화</th>
                                <th className="px-4 py-3 text-right">경고 수</th>
                                <th className="px-4 py-3 text-left">해석</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                              {scenarioComparisonRows.map((row) => (
                                <tr className="hover:bg-surface-muted/50 transition-colors" key={row.id || row.title}>
                                  <td className="px-4 py-3.5 text-xs font-black text-navy">{row.title}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, row.endNetWorthKrw)}</td>
                                  <td className={cn("px-4 py-3.5 text-right text-xs font-black tabular-nums", row.endNetWorthDeltaKrw < 0 ? "text-danger" : "text-success")}>
                                    {formatKrw(locale, row.endNetWorthDeltaKrw)}
                                  </td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{row.goalsAchieved}</td>
                                  <td className={cn("px-4 py-3.5 text-right text-xs font-black tabular-nums", row.goalsAchievedDelta < 0 ? "text-danger" : "text-success")}>
                                    {row.goalsAchievedDelta >= 0 ? "+" : ""}{row.goalsAchievedDelta}
                                  </td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-400">{row.warningsCount}</td>
                                  <td className="px-4 py-3.5 text-xs font-medium leading-relaxed text-slate-500">{row.shortWhy[0] ?? "핵심 지표 변화를 먼저 확인하세요."}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </BodyTableFrame>
                      )}
                    </div>

                    {debugEnabled && scenariosDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={scenariosDebugSections}
                        title="고급 보기 (scenario summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "monteCarlo" ? (
              <div className="animate-in fade-in mt-6 space-y-6 duration-300">
                {monteCarloStatus.state === "FAILED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                    몬테카를로 단계 실패: {monteCarloStatus.message ?? "몬테카를로 계산에 실패했습니다."}
                  </div>
                ) : monteCarloStatus.state === "SKIPPED" ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    몬테카를로 단계 생략: {monteCarloStatus.message ?? "실행 조건에 의해 생략되었습니다."}
                  </div>
                ) : !hasMonteCarloData || Object.keys(monteData).length === 0 ? (
                  <EmptyState title="몬테카를로 결과가 없습니다" />
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-100 bg-surface-muted p-4 text-xs font-bold leading-relaxed text-slate-700 shadow-sm">
                      <span className="mr-2">📊</span>
                      {typeof monteDepletionProb === "number"
                        ? <>은퇴 자산 고갈 확률: <span className="font-black text-primary">{formatPct(locale, monteDepletionProb * 100)}</span> <span className="text-[10px] font-medium text-slate-400">(모델 기반 통계값, 보장 아님)</span></>
                        : "고갈 확률 지표가 제공되지 않았습니다."}
                    </div>
                    <div className="space-y-4">
                      <SubSectionHeader title="확률 분포 요약 (End State)" titleClassName="text-sm" />
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-100">
                          <thead className="bg-surface-muted">
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              <th className="px-4 py-3 text-left">지표</th>
                              <th className="px-4 py-3 text-right">P10 (하위)</th>
                              <th className="px-4 py-3 text-right">P50 (중앙)</th>
                              <th className="px-4 py-3 text-right">P90 (상위)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 bg-white">
                            <tr className="hover:bg-surface-muted/50 transition-colors">
                              <td className="px-4 py-3.5 text-xs font-black text-navy">말기 순자산</td>
                              <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(monteEndNetWorth.p10 ?? 0))}</td>
                              <td className="px-4 py-3.5 text-right text-xs font-black tabular-nums text-primary">{formatKrw(locale, Number(monteEndNetWorth.p50 ?? 0))}</td>
                              <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(monteEndNetWorth.p90 ?? 0))}</td>
                            </tr>
                            <tr className="hover:bg-surface-muted/50 transition-colors">
                              <td className="px-4 py-3.5 text-xs font-black text-navy">최저 현금</td>
                              <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(monteWorstCash.p10 ?? 0))}</td>
                              <td className="px-4 py-3.5 text-right text-xs font-black tabular-nums text-primary">{formatKrw(locale, Number(monteWorstCash.p50 ?? 0))}</td>
                              <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(monteWorstCash.p90 ?? 0))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    </div>
                  </>
                )}
                {debugEnabled && monteCarloDebugSections.length > 0 ? (
                  <AdvancedJsonPanel
                    sections={monteCarloDebugSections}
                    title="고급 보기 (monte carlo summary)"
                  />
                ) : null}
              </div>
            ) : null}

            {activeTab === "actions" ? (
              <div className="animate-in fade-in mt-6 space-y-6 duration-300">
                {actionsStatus.state === "FAILED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                    실행 계획 단계 실패: {actionsStatus.message ?? "실행 계획 생성에 실패했습니다."}
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-xs font-bold leading-relaxed text-navy">
                      💡 해석: 심각도(치명/경고/정보) 순서대로 우선 처리하면 경고를 가장 빠르게 줄일 수 있습니다.
                    </div>

                    <div className="space-y-4">
                      <SubSectionHeader title="추천 실행 계획 목록" titleClassName="text-sm" />
                      {actionTableRows.length === 0 ? (
                        <EmptyState title="실행 계획이 없습니다" />
                      ) : (
                        <BodyTableFrame>
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-surface-muted">
                              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-3 text-left">심각도</th>
                                <th className="px-4 py-3 text-left">코드</th>
                                <th className="px-4 py-3 text-left">액션</th>
                                <th className="px-4 py-3 text-left">요약</th>
                                <th className="px-4 py-3 text-right">근거</th>
                                <th className="px-4 py-3 text-right">단계</th>
                                <th className="px-4 py-3 text-right">주의</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                              {visibleActionRows.map((row) => (
                                <tr className="hover:bg-surface-muted/50 transition-colors" key={`${row.code}-${row.title}`}>
                                  <td className="px-4 py-3.5">
                                    <Badge variant={row.severity === "critical" ? "destructive" : row.severity === "warn" ? "warning" : "secondary"} className="h-5 px-1.5 text-[9px] font-black uppercase">
                                      {row.severity === "critical" ? "치명" : row.severity === "warn" ? "경고" : "정보"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3.5 text-[11px] font-black uppercase tracking-tight text-slate-400">{row.code}</td>
                                  <td className="px-4 py-3.5 text-xs font-black text-navy">{row.title}</td>
                                  <td className="max-w-xs px-4 py-3.5 text-xs font-medium leading-relaxed text-slate-500">{row.summary || "요약 없음"}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-400">{row.whyCount}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-400">{row.steps.length}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-400">{row.cautions.length}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </BodyTableFrame>
                      )}
                      {actionTableRows.length > LIMITS.actionsTop ? (
                        <div className="flex items-center justify-between px-2">
                          <span className="text-xs font-bold italic text-slate-400">{showAllActions ? `전체 ${actionTableRows.length}개 액션 표시 중` : `추가 ${omittedActionRows}개 액션이 생략되었습니다.`}</span>
                          <Button
                            variant="ghost"
                            className="h-8 rounded-lg text-xs font-black text-primary hover:bg-primary/5"
                            onClick={() => setShowAllActions((prev) => !prev)}
                          >
                            {showAllActions ? "간략히 보기 ↑" : "전체 액션 보기 ↓"}
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {actionTableRows.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        {actionTableRows.slice(0, 3).map((row) => (
                          <div className="flex flex-col rounded-2xl border border-slate-100 bg-surface-muted p-5" key={`detail-${row.code}-${row.title}`}>
                            <p className="text-sm font-black text-navy">{row.title}</p>
                            <p className="mt-2 flex-1 text-xs font-medium leading-relaxed text-slate-500">{row.summary || "핵심 문제를 줄이기 위한 조치입니다."}</p>

                            <div className="mt-4 space-y-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">권장 단계</p>
                              {row.steps.length === 0 ? (
                                <p className="text-[11px] font-bold italic text-slate-400">세부 단계는 고급 보기를 참고하세요.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {row.steps.slice(0, 3).map((step, index) => (
                                    <li className="flex gap-2 text-[11px] font-bold text-slate-600" key={`${row.code}-step-${index}`}>
                                      <span className="text-primary">{index + 1}.</span>
                                      <span className="leading-relaxed">{step}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            {row.cautions.length > 0 ? (
                              <div className="mt-4 rounded-lg bg-amber-50 p-2 text-[10px] font-bold text-amber-700">
                                ⚠️ 주의: {row.cautions[0]}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {debugEnabled && actionsDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={actionsDebugSections}
                        title="고급 보기 (actions summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "debt" ? (
              <div className="animate-in fade-in mt-6 space-y-6 duration-300">
                {debtStatus.state === "FAILED" ? (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                    부채 분석 단계 실패: {debtStatus.message ?? "부채 분석에 실패했습니다."}
                  </div>
                ) : !hasDebtData ? (
                  <EmptyState title="부채 분석 결과가 없습니다" />
                ) : (
                  <>
                    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-xs font-bold leading-relaxed text-navy">
                      💡 해석: 부채 탭은 현재 상환부담(DSR), 이자비용, 리파이낸스 효과를 함께 보고 우선순위를 정하는 용도입니다.
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <span className="text-[10px] font-black uppercase text-slate-400">현재 DSR</span>
                        <span className="text-sm font-black tabular-nums text-navy">{formatRatioPct(locale, debtMeta.debtServiceRatio)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <span className="text-[10px] font-black uppercase text-slate-400">월 총상환액</span>
                        <span className="text-sm font-black tabular-nums text-primary">{formatKrw(locale, Number(debtMeta.totalMonthlyPaymentKrw ?? 0))}</span>
                      </div>
                    </div>

                    <WarningsTable warnings={debtWarnings} />

                    <div className="space-y-4">
                      <SubSectionHeader title="부채별 상환 요약" titleClassName="text-sm" />
                      {debtSummaries.length === 0 ? (
                        <EmptyState title="부채 요약 데이터가 없습니다" />
                      ) : (
                        <BodyTableFrame>
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-surface-muted">
                              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-3 text-left">부채명</th>
                                <th className="px-4 py-3 text-right">원금</th>
                                <th className="px-4 py-3 text-right">금리(APR)</th>
                                <th className="px-4 py-3 text-right">월 상환액</th>
                                <th className="px-4 py-3 text-right">월 이자</th>
                                <th className="px-4 py-3 text-right">잔여 총이자</th>
                                <th className="px-4 py-3 text-right">상환완료</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                              {debtSummaries.map((row, index) => (
                                <tr className="hover:bg-surface-muted/50 transition-colors" key={`${String(row.liabilityId ?? index)}-${String(row.name ?? "")}`}>
                                  <td className="px-4 py-3.5 text-xs font-black text-navy">{String(row.name ?? row.liabilityId ?? "부채")}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(row.principalKrw ?? 0))}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-black tabular-nums text-primary">{typeof row.aprPct === "number" ? formatPct(locale, row.aprPct) : "-"}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(row.monthlyPaymentKrw ?? 0))}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-rose-600/70">{formatKrw(locale, Number(row.monthlyInterestKrw ?? 0))}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{formatKrw(locale, Number(row.totalInterestRemainingKrw ?? 0))}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-black text-slate-400">M{Number(row.payoffMonthIndex ?? 0) + 1}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </BodyTableFrame>
                      )}
                    </div>

                    <div className="space-y-4">
                      <SubSectionHeader title="리파이낸스 비교" titleClassName="text-sm" />
                      {debtRefinance.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-8 text-center text-xs font-bold text-slate-400">
                          적용 가능한 리파이낸스 제안이 없습니다. 현재 조건 유지 또는 추가상환을 먼저 검토하세요.
                        </div>
                      ) : (
                        <BodyTableFrame>
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-surface-muted">
                              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-3 text-left">부채</th>
                                <th className="px-4 py-3 text-left">제안</th>
                                <th className="px-4 py-3 text-right">신규금리</th>
                                <th className="px-4 py-3 text-right">월상환 변화</th>
                                <th className="px-4 py-3 text-right">예상이자절감</th>
                                <th className="px-4 py-3 text-right">손익분기</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                              {debtRefinance.map((row, index) => (
                                <tr className="hover:bg-surface-muted/50 transition-colors" key={`${String(row.liabilityId ?? index)}-${String(row.offerTitle ?? "")}`}>
                                  <td className="px-4 py-3.5 text-[11px] font-black uppercase tracking-tight text-slate-400">{String(row.liabilityId ?? "부채")}</td>
                                  <td className="px-4 py-3.5 text-xs font-black text-navy">{String(row.offerTitle ?? "리파이낸스")}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-black tabular-nums text-primary">{typeof row.newAprPct === "number" ? formatPct(locale, row.newAprPct) : "-"}</td>
                                  <td className={cn("px-4 py-3.5 text-right text-xs font-black tabular-nums", Number(row.monthlyPaymentDeltaKrw ?? 0) > 0 ? "text-danger" : "text-success")}>
                                    {formatKrw(locale, Number(row.monthlyPaymentDeltaKrw ?? 0))}
                                  </td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-success">{formatKrw(locale, Number(row.interestSavingsKrw ?? 0))}</td>
                                  <td className="px-4 py-3.5 text-right text-xs font-bold text-slate-400">{typeof row.breakEvenMonths === "number" ? `${row.breakEvenMonths}개월` : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </BodyTableFrame>
                      )}
                    </div>

                    <div className="space-y-4">
                      <SubSectionHeader title="What-if 요약" titleClassName="text-sm" />
                      <BodyTableFrame>
                        <table className="min-w-full divide-y divide-slate-100">
                          <thead className="bg-surface-muted">
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              <th className="px-4 py-3 text-left">전략</th>
                              <th className="px-4 py-3 text-right">제안 수</th>
                              <th className="px-4 py-3 text-left">해석</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 bg-white">
                            {debtWhatIfSummary.map((row) => (
                              <tr className="hover:bg-surface-muted/50 transition-colors" key={row.title}>
                                <td className="px-4 py-3.5 text-xs font-black text-navy">{row.title}</td>
                                <td className="px-4 py-3.5 text-right text-xs font-bold tabular-nums text-slate-700">{row.count}</td>
                                <td className="px-4 py-3.5 text-xs font-medium leading-relaxed text-slate-500">{row.interpretation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </BodyTableFrame>
                    </div>

                    {debugEnabled && debtDebugSections.length > 0 ? (
                      <AdvancedJsonPanel
                        sections={debtDebugSections}
                        title="고급 보기 (debt summary)"
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}
