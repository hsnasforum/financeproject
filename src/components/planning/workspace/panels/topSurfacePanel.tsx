import Link from "next/link";
import PlanningQuickStartGate from "@/components/planning/PlanningQuickStartGate";
import { Button } from "@/components/ui/Button";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import { cn } from "@/lib/utils";

const actionLink = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function PlanningWorkspaceTopSurfacePanel({ quickStart, actions }: {
  quickStart: PlanningWorkspaceGroups["quickStart"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const { feedbackToast, workspaceError, workspaceNotice, beginnerMode, savingProfile, running,
    quickStartNextStep, profileSyncState, quickStartVm, selectedProfileId, profiles, selectedProfile,
    selectedSnapshotItem, preflightHasBlockers, preflightBlockIssues, preflightWarnIssues,
    runButtonDescribedBy, runNeedsWarningConfirmation, runsPageHref } = quickStart;

  return (
    <div className="mb-6 space-y-5">
      {feedbackToast ? <p role="status" className="rounded-xl bg-primary/5 p-4 text-sm leading-6 text-navy">{feedbackToast}</p> : null}
      {workspaceError ? <p role="alert" className="whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">{workspaceError}</p> : null}
      {workspaceNotice ? <p role="status" className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{workspaceNotice}</p> : null}
      <p className="border-l-2 border-amber-300 pl-4 text-sm leading-6 text-slate-600">입력과 가정에 따른 참고용 계산입니다. 수익이나 목표 달성을 보장하지 않으며, 기준일과 변경한 계산 조건을 함께 확인해 주세요.</p>

      {beginnerMode ? (
        <PlanningQuickStartGate
          disabled={savingProfile || running}
          nextStepDescription={quickStartNextStep.description}
          nextStepLabel={quickStartNextStep.label}
          nextStepTargetId={quickStartNextStep.targetId}
          profileSyncState={profileSyncState}
          runStatusReviewRequired={quickStartVm.runStatusReviewRequired}
          runDone={quickStartVm.beginnerStepRunDone}
          onApply={actions.applyQuickStartAction}
        />
      ) : null}

      <section aria-label="재무 진단 진행 상태" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="planning-workspace-quickstart-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1" data-testid="planning-workspace-quickstart-status" id="planning-workspace-progress-status">
            <p className="text-sm font-semibold text-navy">{quickStartVm.completedSummary}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">다음 단계 · {quickStartVm.nextStepSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profiles.length < 1 ? <Button disabled={savingProfile || running} onClick={actions.loadSampleProfileAction} variant="outline">샘플 불러오기</Button> : null}
            {selectedProfileId && profileSyncState === "saved" && !quickStartVm.beginnerStepRunDone && !quickStartVm.runStatusReviewRequired ? (
              <Button aria-describedby={runButtonDescribedBy} data-testid="planning-quickstart-run-cta" id="planning-quickstart-run-cta"
                disabled={running || savingProfile || preflightHasBlockers || runNeedsWarningConfirmation}
                onClick={() => void actions.runPlanAction()} variant="primary" className="rounded-lg font-semibold">
                {running ? "실행 중..." : "첫 실행·기록 저장"}
              </Button>
            ) : null}
            <Link href={runsPageHref} data-ready="true" data-testid="planning-runs-link" id="planning-quickstart-runs-link"
              className={cn(actionLink, quickStartVm.runStatusReviewRequired && "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white")}>
              실행 내역
            </Link>
            {quickStartVm.beginnerStepRunDone ? (
              <Link href={quickStartVm.selectedRunReportHref} data-testid="planning-quickstart-report-button" id="planning-quickstart-report-button" className={actionLink}>리포트</Link>
            ) : null}
          </div>
        </div>
        <ol aria-label="진단 순서" className="grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          {quickStartVm.progressItems.map((item, index) => (
            <li key={item.label} aria-current={item.state === "current" ? "step" : undefined} className={cn("rounded-lg px-3 py-2 leading-6", item.state === "current" ? "bg-primary/5 font-semibold text-primary" : "text-slate-600")}>
              <span className="mr-2 tabular-nums">{index + 1}.</span>{item.label} · {item.stateLabel}
            </li>
          ))}
        </ol>
        <details className="border-t border-slate-100 pt-2 text-sm leading-6 text-slate-600">
          <summary className="cursor-pointer py-2 font-medium">선택한 프로필과 데이터 확인</summary>
          <p>프로필: {selectedProfile?.name ?? "미선택"}</p>
          <p className="break-all">계산 기준 자료: {selectedSnapshotItem?.id ?? "자동 선택 — 최신 저장 자료"}</p>
          <p>입력 점검: {preflightHasBlockers ? `수정 필요 ${preflightBlockIssues.length}건` : preflightWarnIssues.length > 0 ? `확인할 경고 ${preflightWarnIssues.length}건` : "차단 항목 없음"}</p>
        </details>
      </section>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
        <input checked={beginnerMode} onChange={(event) => actions.setBeginnerMode(event.target.checked)} type="checkbox" />초보자 모드
        <span className="font-normal text-slate-500">해제하면 세부 계산 옵션을 조정할 수 있습니다.</span>
      </label>
    </div>
  );
}
