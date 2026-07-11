import Link from "next/link";
import SnapshotPicker from "@/app/planning/_components/SnapshotPicker";
import { type StepStatus } from "@/app/planning/_lib/runPipeline";
import { ASSUMPTIONS_FORM_DEFAULT } from "@/app/planning/_lib/workspaceAssumptionsEditor";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  bodyCompactFieldClassName,
  bodyFieldClassName,
  bodyLabelClassName,
  bodyTextAreaClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import { cn } from "@/lib/utils";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import {
  formatDateTime,
  formatGroupedIntegerInput,
  formatSeverityKo,
  STEP_LABELS,
  toFiniteNumber,
} from "@/components/planning/workspace/panels/shared";

const ALLOCATION_POLICIES: Array<{ id: AllocationPolicyId; label: string }> = [
  { id: "balanced", label: "균형형 (기본)" },
  { id: "safety", label: "안정형" },
  { id: "growth", label: "성장형" },
];

type ScenarioTemplateId =
  | "NONE"
  | "REDUCE_DISCRETIONARY_10"
  | "REDUCE_DISCRETIONARY_20"
  | "INCOME_PLUS_5";

const SCENARIO_TEMPLATE_LABELS: Record<ScenarioTemplateId, string> = {
  NONE: "없음",
  REDUCE_DISCRETIONARY_10: "선택지출 -10%",
  REDUCE_DISCRETIONARY_20: "선택지출 -20%",
  INCOME_PLUS_5: "월수입 +5%",
};

function formatPreflightIssue(issue: { message: string; fixHint?: string | null }): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.message} (${issue.fixHint})`;
  }
  return issue.message;
}

function formatStepStateKo(state: StepStatus["state"]): string {
  if (state === "PENDING") return "대기";
  if (state === "RUNNING") return "진행중";
  if (state === "SUCCESS") return "성공";
  if (state === "FAILED") return "실패";
  return "생략";
}

export function PlanningWorkspaceExecutionPanel({
  execution,
  actions,
}: {
  execution: PlanningWorkspaceGroups["execution"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const {
    locale,
    beginnerMode,
    selectedProfileId,
    snapshotItemsWarning,
    availableSnapshotItems,
    effectiveSnapshotSelection,
    policyId,
    runTitle,
    horizonMonths,
    assumptionsOverrideJson,
    assumptionsJsonError,
    assumptionsForm,
    runScenariosEnabled,
    runMonteCarloEnabled,
    runActionsEnabled,
    runDebtEnabled,
    runOptimizeEnabled,
    includeProducts,
    maxCandidatesPerAction,
    monteCarloPaths,
    monteCarloSeed,
    debtExtraPaymentKrw,
    debtOffersJson,
    debtOffersJsonError,
    debtOfferRows,
    debtLiabilityOptions,
    optimizerConstraintsJson,
    optimizerKnobsJson,
    optimizerSearchJson,
    loadingBaselineRuns,
    baselineRunId,
    scenarioTemplateId,
    availableBaselineRuns,
    scenarioPatchesPreview,
    healthWarnings,
    hasCriticalHealth,
    advancedActionsBlockedByHealth,
    monteCarloServerDisabled,
    includeProductsServerDisabled,
    optimizerServerDisabled,
    effectiveRunDebtEnabled,
    preflightBlockIssues,
    preflightWarnIssues,
    preflightHasBlockers,
    preflightWarnSummary,
    runNeedsWarningConfirmation,
    runButtonDescribedBy,
    currentStepStatuses,
    monteCarloBudgetSkipped,
    healthAck,
    healthDisabledReason,
    runWarningConfirmed,
    running,
    runningOptimize,
  } = execution;
  const {
    setSnapshotSelection,
    setPolicyId,
    setRunTitle,
    setHorizonMonths,
    updateAssumptionsField,
    setRunScenariosEnabled,
    setRunMonteCarloEnabled,
    setRunActionsEnabled,
    setRunDebtEnabled,
    setRunOptimizeEnabled,
    setIncludeProducts,
    setMaxCandidatesPerAction,
    setMonteCarloPaths,
    setMonteCarloSeed,
    setDebtExtraPaymentKrw,
    addDebtOfferRow,
    removeDebtOfferRow,
    updateDebtOfferRow,
    setOptimizerConstraintsJson,
    setOptimizerKnobsJson,
    setOptimizerSearchJson,
    replaceAssumptionsFromJsonText,
    replaceDebtOffersFromJsonText,
    setHealthAck,
    setRunWarningConfirmed,
    setBaselineRunId,
    setScenarioTemplateId,
    runPlanAction,
    runScenarioAction,
    runOptimizeAction,
  } = actions;

  return (
    <Card className="space-y-8 p-8">
      <SubSectionHeader
        title="실행 옵션"
        description="기본값만으로도 실행 가능합니다."
      />

      <div className="space-y-6">
        <SnapshotPicker
          advancedEnabled={!beginnerMode}
          items={availableSnapshotItems}
          value={effectiveSnapshotSelection}
          onChange={(next) => setSnapshotSelection(next)}
        />
        {snapshotItemsWarning ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600">{snapshotItemsWarning}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`block text-xs ${bodyLabelClassName}`}>
            분배 정책
            <select
              className={cn(bodyFieldClassName, "mt-2 h-11 rounded-xl border-slate-200 font-bold")}
              value={policyId}
              onChange={(event) => setPolicyId(event.target.value as AllocationPolicyId)}
            >
              {ALLOCATION_POLICIES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className={`block text-xs ${bodyLabelClassName}`}>
            실행 제목
            <input
              className={cn(bodyFieldClassName, "mt-2 h-11 rounded-xl border-slate-200 font-bold")}
              value={runTitle}
              onChange={(event) => setRunTitle(event.target.value)}
              placeholder="예: 2025년 3월 시뮬레이션"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-surface-muted p-6">
          <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">분석 기간</p>
          {beginnerMode ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="sm"
                variant={horizonMonths === "120" ? "primary" : "outline"}
                className="h-12 rounded-xl font-black"
                onClick={() => setHorizonMonths("120")}
              >
                10년 (120개월)
              </Button>
              <Button
                size="sm"
                variant={horizonMonths === "360" ? "primary" : "outline"}
                className="h-12 rounded-xl font-black"
                onClick={() => setHorizonMonths("360")}
              >
                30년 (360개월)
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input
                className={cn(bodyFieldClassName, "h-11 max-w-[120px] rounded-xl border-slate-200 text-center font-black")}
                value={horizonMonths}
                onChange={(event) => setHorizonMonths(event.target.value)}
              />
              <span className="text-sm font-bold text-slate-500">개월 분석</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" className="h-9 px-3 text-xs font-bold" onClick={() => setHorizonMonths("120")}>10년</Button>
                <Button size="sm" variant="ghost" className="h-9 px-3 text-xs font-bold" onClick={() => setHorizonMonths("360")}>30년</Button>
              </div>
            </div>
          )}
        </div>

        {!beginnerMode ? (
          <div className="space-y-4 rounded-2xl border border-slate-100 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">가정(Assumptions) Override</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`block text-xs ${bodyLabelClassName}`}>
                인플레이션(%)
                <input
                  className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")}
                  type="number"
                  value={assumptionsForm.inflationPct}
                  onChange={(event) => updateAssumptionsField("inflationPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.inflationPct))}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                기대수익률(%)
                <input
                  className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")}
                  type="number"
                  value={assumptionsForm.expectedReturnPct}
                  onChange={(event) => updateAssumptionsField("expectedReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.expectedReturnPct))}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                현금수익률(%)
                <input
                  className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")}
                  type="number"
                  value={assumptionsForm.cashReturnPct}
                  onChange={(event) => updateAssumptionsField("cashReturnPct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.cashReturnPct))}
                />
              </label>
              <label className={`block text-xs ${bodyLabelClassName}`}>
                인출률(%)
                <input
                  className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")}
                  type="number"
                  value={assumptionsForm.withdrawalRatePct}
                  onChange={(event) => updateAssumptionsField("withdrawalRatePct", toFiniteNumber(event.target.value, ASSUMPTIONS_FORM_DEFAULT.withdrawalRatePct))}
                />
              </label>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-100 bg-surface-muted p-6">
          <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Pipeline 설정</p>
          {beginnerMode ? (
            <div className="grid grid-cols-2 gap-y-2 px-1 text-[11px] font-bold text-slate-600">
              <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> 시나리오: ON</p>
              <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Monte Carlo: OFF</p>
              <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Actions: ON</p>
              <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Debt 분석: ON</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input checked={runScenariosEnabled} onChange={(event) => setRunScenariosEnabled(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                <span className="text-xs font-bold text-slate-700">시나리오 실행</span>
              </label>
              {!monteCarloServerDisabled ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input checked={runMonteCarloEnabled} disabled={advancedActionsBlockedByHealth} onChange={(event) => setRunMonteCarloEnabled(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-bold text-slate-700">몬테카를로 실행</span>
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input checked={runActionsEnabled} disabled={advancedActionsBlockedByHealth} onChange={(event) => setRunActionsEnabled(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                <span className="text-xs font-bold text-slate-700">실행 계획 생성</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input checked={runDebtEnabled} onChange={(event) => setRunDebtEnabled(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                <span className="text-xs font-bold text-slate-700">부채 분석</span>
              </label>
              {!optimizerServerDisabled ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input checked={runOptimizeEnabled} disabled={advancedActionsBlockedByHealth} onChange={(event) => setRunOptimizeEnabled(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-bold text-slate-700">최적화기 실행</span>
                </label>
              ) : null}
            </div>
          )}
        </div>

        {!beginnerMode ? (
          <div className="space-y-4">
            {runMonteCarloEnabled ? (
              <div className="grid grid-cols-2 gap-4">
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  몬테카를로 paths
                  <input className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")} value={monteCarloPaths} onChange={(event) => setMonteCarloPaths(event.target.value)} />
                </label>
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  몬테카를로 seed
                  <input className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")} value={monteCarloSeed} onChange={(event) => setMonteCarloSeed(event.target.value)} />
                </label>
              </div>
            ) : null}

            {runActionsEnabled ? (
              <div className="grid grid-cols-2 gap-4">
                {!includeProductsServerDisabled ? (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-surface-muted p-3">
                    <input checked={includeProducts} disabled={advancedActionsBlockedByHealth} onChange={(event) => setIncludeProducts(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    <span className="text-xs font-bold text-slate-700">상품 후보 포함</span>
                  </label>
                ) : <div />}
                <label className={`block text-xs ${bodyLabelClassName}`}>
                  후보 최대 개수
                  <input className={cn(bodyFieldClassName, "mt-2 h-10 rounded-xl border-slate-200")} value={maxCandidatesPerAction} onChange={(event) => setMaxCandidatesPerAction(event.target.value)} />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {effectiveRunDebtEnabled ? (
          <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6">
            <SubSectionHeader title="부채 추가상환 및 리파이낸스" titleClassName="text-sm" />
            <label className={`block text-xs ${bodyLabelClassName}`}>
              부채 추가상환 금액(KRW)
              <input
                className={cn(bodyFieldClassName, "mt-2 h-11 rounded-xl border-slate-200 font-bold")}
                inputMode="numeric"
                type="text"
                value={formatGroupedIntegerInput(toFiniteNumber(debtExtraPaymentKrw, 0))}
                onChange={(event) => setDebtExtraPaymentKrw(event.target.value)}
              />
            </label>
            {!beginnerMode ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">리파이낸스 제안</p>
                  <Button onClick={addDebtOfferRow} size="sm" variant="outline" className="h-8 rounded-lg bg-white font-bold">제안 추가</Button>
                </div>
                {debtOfferRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs font-bold text-slate-400">입력된 제안이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {debtOfferRows.map((row, index) => (
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm" key={row.rowId}>
                        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto]">
                          <select
                            className={cn(bodyCompactFieldClassName, "h-9 rounded-lg border-slate-200 font-bold")}
                            value={row.liabilityId}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, liabilityId: event.target.value })}
                          >
                            <option value="">부채 선택</option>
                            {debtLiabilityOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.id} ({option.label})</option>
                            ))}
                          </select>
                          <input
                            className={cn(bodyCompactFieldClassName, "h-9 rounded-lg border-slate-200")}
                            value={row.title}
                            onChange={(event) => updateDebtOfferRow(index, { ...row, title: event.target.value })}
                            placeholder="제안 제목(선택)"
                          />
                          <Button aria-label="삭제" onClick={() => removeDebtOfferRow(index)} size="sm" variant="ghost" className="h-9 text-rose-600">삭제</Button>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">신규 금리(%)</span>
                            <input
                              className={cn(bodyCompactFieldClassName, "mt-1 h-9 rounded-lg border-slate-200 font-black text-primary")}
                              type="number"
                              value={row.newAprPct}
                              onChange={(event) => updateDebtOfferRow(index, { ...row, newAprPct: toFiniteNumber(event.target.value) })}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">수수료(KRW)</span>
                            <input
                              className={cn(bodyCompactFieldClassName, "mt-1 h-9 rounded-lg border-slate-200")}
                              inputMode="numeric"
                              type="text"
                              value={formatGroupedIntegerInput(row.feeKrw)}
                              onChange={(event) => updateDebtOfferRow(index, { ...row, feeKrw: Math.max(0, toFiniteNumber(event.target.value)) })}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!beginnerMode && runOptimizeEnabled ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-6">
          <SubSectionHeader title="실험용 최적화기" titleClassName="text-sm text-indigo-900" description="후보 전략 2~5개를 비교만 제공합니다. 자동 적용은 하지 않습니다." />
          <label className={`block text-xs ${bodyLabelClassName}`}>
            Optimizer 제약 JSON
            <textarea
              className={cn(bodyTextAreaClassName, "mt-2 min-h-[90px] rounded-xl border-slate-200")}
              value={optimizerConstraintsJson}
              onChange={(event) => setOptimizerConstraintsJson(event.target.value)}
            />
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            Optimizer 파라미터 JSON
            <textarea
              className={cn(bodyTextAreaClassName, "mt-2 min-h-[90px] rounded-xl border-slate-200")}
              value={optimizerKnobsJson}
              onChange={(event) => setOptimizerKnobsJson(event.target.value)}
            />
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            Optimizer 탐색 JSON
            <textarea
              className={cn(bodyTextAreaClassName, "mt-2 min-h-[90px] rounded-xl border-slate-200")}
              value={optimizerSearchJson}
              onChange={(event) => setOptimizerSearchJson(event.target.value)}
            />
          </label>
          <Button disabled={runningOptimize || optimizerServerDisabled || advancedActionsBlockedByHealth} onClick={() => void runOptimizeAction()} size="sm" variant="outline" className="h-10 rounded-xl border-indigo-200 bg-white px-6 font-bold text-indigo-700">
            {runningOptimize ? "최적화 실행 중..." : "최적화 실행"}
          </Button>
        </div>
      ) : null}

      {!beginnerMode ? (
        <details className="group mt-6 rounded-[2rem] border border-slate-200 bg-surface-muted/50 p-6">
          <summary className="flex cursor-pointer items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">
            <span>고급(개발자): JSON 편집기</span>
            <span className="transition-transform group-open:rotate-180">↓</span>
          </summary>
          <div className="animate-in fade-in mt-6 space-y-8 duration-300">
            <div className="space-y-4">
              <SubSectionHeader title="가정 Override JSON" titleClassName="text-[11px]" description="계산에 사용되는 거시 지표 가정을 원본 형식으로 편집합니다." />
              <textarea
                className={cn(bodyTextAreaClassName, "mt-2 min-h-[140px] rounded-xl border-slate-200 bg-white font-mono")}
                value={assumptionsOverrideJson}
                onChange={(event) => replaceAssumptionsFromJsonText(event.target.value)}
              />
              {assumptionsJsonError ? <p className="mt-2 px-1 text-xs font-bold text-rose-600">{assumptionsJsonError}</p> : null}
            </div>

            <div className="space-y-4">
              <SubSectionHeader title="리파이낸스 제안 JSON" titleClassName="text-[11px]" description="부채 갈아타기 시나리오 데이터를 원본 형식으로 편집합니다." />
              <textarea
                className={cn(bodyTextAreaClassName, "mt-2 min-h-[120px] rounded-xl border-slate-200 bg-white font-mono")}
                value={debtOffersJson}
                onChange={(event) => replaceDebtOffersFromJsonText(event.target.value)}
              />
              {debtOffersJsonError ? <p className="mt-2 px-1 text-xs font-bold text-rose-600">{debtOffersJsonError}</p> : null}
            </div>
          </div>
        </details>
      ) : null}

      <div className="mt-6 space-y-4">
        {healthWarnings.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-800">가정 건강도 경고 ({healthWarnings.length})</p>
            <div className="space-y-1 text-xs font-bold text-amber-700/80">
              {healthWarnings.map((warning) => (
                <p key={`${warning.code}:${warning.severity}`}>[{formatSeverityKo(warning.severity)}] {warning.code} - {warning.message}</p>
              ))}
            </div>
            {healthWarnings.some((warning) => warning.code === "SNAPSHOT_STALE" || warning.code === "SNAPSHOT_VERY_STALE" || warning.code === "SNAPSHOT_MISSING") ? (
              <div className="mt-2">
                <Link href="/ops/assumptions" className="text-xs font-black text-amber-900 underline decoration-amber-200 underline-offset-4 decoration-2 transition-all hover:decoration-amber-400">스냅샷 동기화하러 가기 →</Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {preflightHasBlockers ? (
          <div className="space-y-2 rounded-2xl border border-rose-100 bg-rose-50 p-4" id="planning-preflight-block-reason">
            <p className="text-sm font-black text-rose-800">사전 점검 차단 ({preflightBlockIssues.length})</p>
            <div className="space-y-1 text-xs font-bold text-rose-700/80">
              {preflightBlockIssues.map((issue, index) => (
                <p key={`${issue.code}-${index}`}>[{issue.code}] {formatPreflightIssue(issue)}</p>
              ))}
            </div>
          </div>
        ) : null}
        {preflightWarnIssues.length > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600">
            사전 점검 경고: {preflightWarnSummary}
            {preflightWarnIssues.length > 1 ? ` 외 ${preflightWarnIssues.length - 1}건` : ""}
          </p>
        ) : null}

        {hasCriticalHealth ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input checked={healthAck} onChange={(event) => setHealthAck(event.target.checked)} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span className="text-xs font-bold leading-relaxed text-rose-800">위 경고를 확인했고, 이 가정으로 계산 결과가 왜곡될 수 있음을 이해했습니다.</span>
            </label>
          </div>
        ) : null}
      </div>

      {healthDisabledReason ? (
        <p className="px-1 text-xs italic font-bold text-slate-400" id="planning-advanced-actions-disabled-reason">{healthDisabledReason}</p>
      ) : null}
      {monteCarloBudgetSkipped ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600">Monte Carlo는 예산 초과로 생략되었습니다.</p>
      ) : null}

      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-6">
        <SubSectionHeader
          title="What-if 시나리오"
          description="추천이 아닌 특정 조건을 가정하여 비교 실행합니다."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`block text-xs ${bodyLabelClassName}`}>
            기준 실행(Baseline)
            <select
              className={cn(bodyFieldClassName, "mt-2 h-11 rounded-xl border-slate-200 font-bold")}
              value={baselineRunId}
              onChange={(event) => setBaselineRunId(event.target.value)}
            >
              <option value="">선택 안 함</option>
              {availableBaselineRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title ? `${run.title} · ` : ""}{run.id.slice(0, 8)} · {formatDateTime(locale, run.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <label className={`block text-xs ${bodyLabelClassName}`}>
            시나리오 템플릿
            <select
              className={cn(bodyFieldClassName, "mt-2 h-11 rounded-xl border-slate-200 font-bold")}
              value={scenarioTemplateId}
              onChange={(event) => setScenarioTemplateId(event.target.value as ScenarioTemplateId)}
            >
              {(Object.keys(SCENARIO_TEMPLATE_LABELS) as ScenarioTemplateId[]).map((templateId) => (
                <option key={templateId} value={templateId}>
                  {SCENARIO_TEMPLATE_LABELS[templateId]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loadingBaselineRuns ? <p className="px-1 text-[10px] font-bold text-slate-400 animate-pulse">기준 실행 목록 로딩 중...</p> : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">적용 PATCH 미리보기</p>
          {scenarioPatchesPreview.length < 1 ? (
            <p className="py-2 text-xs font-bold italic text-slate-300">적용할 항목이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {scenarioPatchesPreview.map((patch, index) => (
                <li key={`${patch.op}:${index}`} className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  {"field" in patch
                    ? <><span className="text-slate-400">{patch.field}</span> <span className="text-primary">{patch.op}</span> <span>{patch.value}</span></>
                    : <><span className="text-slate-400">debt({patch.debtId})</span> <span className="text-primary">{patch.op}</span> <span>{patch.value}</span></>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-surface-muted p-6 shadow-sm" data-testid="run-stages-timeline">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Execution Pipeline</p>
          <Badge variant="secondary" className="border border-slate-200 bg-white text-[9px] text-slate-500 shadow-sm">
            {running ? "단계 실행 중" : "최근 실행 상태"}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {currentStepStatuses.map((step) => (
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm" data-testid={`stage-${step.id}`} key={step.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600">{STEP_LABELS[step.id]}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tight",
                    step.state === "SUCCESS" ? "bg-primary/5 text-primary" :
                      step.state === "RUNNING" ? "animate-pulse bg-sky-50 text-sky-600" :
                        step.state === "FAILED" ? "bg-rose-50 text-rose-600" : "bg-surface-muted text-slate-400",
                  )}
                  data-testid={step.id === "simulate" ? "stage-simulate-pill" : `stage-${step.id}-status`}
                >
                  <span
                    data-stage-state={step.state}
                    data-testid={step.id === "simulate" ? "stage-simulate-status" : undefined}
                  >
                    {formatStepStateKo(step.state)}
                  </span>
                </span>
              </div>
              {step.message ? <p className="mt-2 line-clamp-1 text-[10px] leading-relaxed text-slate-400" title={step.message}>{step.message}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {preflightWarnIssues.length > 0 ? (
        <label className="cursor-pointer rounded-2xl border border-amber-100 bg-amber-50 p-4" id="planning-run-warning-confirm-hint">
          <span className="flex items-start gap-3">
            <input
              id="planning-run-warning-confirm-checkbox"
              checked={runWarningConfirmed}
              disabled={running || preflightHasBlockers}
              onChange={(event) => setRunWarningConfirmed(event.target.checked)}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-xs font-bold leading-relaxed text-amber-800">사전 점검 경고를 확인했고, 이 상태로 실행하고 기록을 저장합니다.</span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button
          aria-describedby={runButtonDescribedBy}
          data-testid="run-button"
          disabled={running || !selectedProfileId || preflightHasBlockers || runNeedsWarningConfirmation}
          onClick={() => void runPlanAction()}
          variant="primary"
          className="h-12 rounded-full px-8 text-base font-black shadow-lg shadow-primary/20"
        >
          {running ? "실행 중..." : "플래닝 실행·기록 저장"}
        </Button>
        <Button
          disabled={running || !selectedProfileId || preflightHasBlockers || runNeedsWarningConfirmation || scenarioPatchesPreview.length < 1}
          onClick={() => void runScenarioAction()}
          variant="outline"
          className="h-12 rounded-full bg-white px-6 text-sm font-bold"
        >
          {running ? "실행 중..." : "시나리오 실행·기록 저장"}
        </Button>
      </div>
    </Card>
  );
}
