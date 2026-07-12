import Link from "next/link";
import { type WorkspaceQuickStartProgressState } from "@/app/planning/_lib/workspaceQuickStart";
import PlanningOnboardingWizard from "@/components/planning/PlanningOnboardingWizard";
import PlanningQuickStartGate from "@/components/planning/PlanningQuickStartGate";
import { Button } from "@/components/ui/Button";
import {
  BodyInset,
  bodyChoiceRowClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import { cn } from "@/lib/utils";
import { formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { t } from "@/lib/planning/i18n";

function formatRunOverallStatusKo(status: unknown): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

function quickStartProgressToneClassName(state: WorkspaceQuickStartProgressState): string {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "current") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-white text-slate-600";
}

const topSurfaceLinkButtonClassName = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-bold transition-all duration-300 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10 focus-visible:ring-offset-2";
const topSurfaceOutlineLinkClassName = "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-primary/10 hover:bg-primary/5 hover:text-primary";

export function PlanningWorkspaceTopSurfacePanel({
  quickStart,
  actions,
}: {
  quickStart: PlanningWorkspaceGroups["quickStart"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const {
    locale,
    feedbackToast,
    workspaceError,
    workspaceNotice,
    beginnerMode,
    savingProfile,
    running,
    quickStartNextStep,
    profileSyncState,
    quickStartVm,
    selectedProfileId,
    profiles,
    selectedProfile,
    selectedSnapshotItem,
    preflightHasBlockers,
    preflightBlockIssues,
    preflightWarnIssues,
    runButtonDescribedBy,
    runNeedsWarningConfirmation,
    runsPageHref,
    liveSummary,
    beginnerEmergencyMonths,
    profileForm,
    savedRun,
  } = quickStart;
  const {
    applyQuickStartAction,
    loadSampleProfileAction,
    runPlanAction,
    setBeginnerMode,
    applyWizardOutputAction,
  } = actions;

  return (
    <>
      <div className="mb-8 space-y-4">
        {feedbackToast ? (
          <div className="animate-in fade-in slide-in-from-top-2 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm font-bold text-navy">
            {feedbackToast}
          </div>
        ) : null}
        {workspaceError ? (
          <div className="animate-in fade-in slide-in-from-top-2 whitespace-pre-line rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            {workspaceError}
          </div>
        ) : null}
        {workspaceNotice ? (
          <div className="whitespace-pre-line rounded-2xl border border-slate-200 bg-surface-muted p-4 text-sm font-bold text-slate-800">
            {workspaceNotice}
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">{t(locale, "DISCLAIMER_TITLE")}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800/80">{t(locale, "DISCLAIMER_BODY")}</p>
        </div>
      </div>

      {beginnerMode ? (
        <PlanningQuickStartGate
          disabled={savingProfile || running}
          nextStepDescription={quickStartNextStep.description}
          nextStepLabel={quickStartNextStep.label}
          nextStepTargetId={quickStartNextStep.targetId}
          profileSyncState={profileSyncState}
          runStatusReviewRequired={quickStartVm.runStatusReviewRequired}
          runDone={quickStartVm.beginnerStepRunDone}
          onApply={applyQuickStartAction}
        />
      ) : null}

      <Card className={cn("mb-8 border border-slate-200/60 p-8", quickStartVm.tone)} data-testid="planning-workspace-quickstart-card">
        <SubSectionHeader
          title={quickStartVm.title}
          description={quickStartVm.description}
          action={(
            <div className="flex flex-wrap gap-2">
              {profiles.length < 1 ? (
                <Button disabled={savingProfile || running} onClick={loadSampleProfileAction} variant="primary" className="rounded-xl font-bold">
                  샘플 불러오기
                </Button>
              ) : null}
              {selectedProfileId && !quickStartVm.beginnerStepRunDone && !quickStartVm.runStatusReviewRequired ? (
                <Button
                  aria-describedby={runButtonDescribedBy}
                  data-testid="planning-quickstart-run-cta"
                  disabled={running || preflightHasBlockers || runNeedsWarningConfirmation}
                  id="planning-quickstart-run-cta"
                  onClick={() => void runPlanAction()}
                  variant="primary"
                  className="rounded-xl px-6 font-bold"
                >
                  {running ? "실행 중..." : "첫 실행·기록 저장"}
                </Button>
              ) : null}
              <Link
                href={runsPageHref}
                data-ready="true"
                data-testid="planning-runs-link"
                id="planning-quickstart-runs-link"
                className={cn(
                  topSurfaceLinkButtonClassName,
                  quickStartVm.runStatusReviewRequired
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 hover:text-white"
                    : topSurfaceOutlineLinkClassName,
                )}
              >
                실행 내역
              </Link>
              {quickStartVm.beginnerStepRunDone ? (
                <Link
                  href={quickStartVm.selectedRunReportHref}
                  data-testid="planning-quickstart-report-button"
                  id="planning-quickstart-report-button"
                  className={cn(topSurfaceLinkButtonClassName, topSurfaceOutlineLinkClassName)}
                >
                  리포트
                </Link>
              ) : (
                <Button disabled title="플래닝 실행과 기록 저장이 완료되면 리포트를 열 수 있습니다." variant="outline" className="rounded-xl font-bold opacity-50">
                  리포트 대기
                </Button>
              )}
            </div>
          )}
        />

        <div className="mt-6 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span className="rounded-md bg-slate-900/5 px-2 py-1">프로필: {selectedProfile ? selectedProfile.name : "미선택"}</span>
          <span className="rounded-md bg-slate-900/5 px-2 py-1">스냅샷: {selectedSnapshotItem?.id ?? "latest"}</span>
          <span className="rounded-md bg-slate-900/5 px-2 py-1">점검: {preflightHasBlockers ? `차단 ${preflightBlockIssues.length}` : preflightWarnIssues.length > 0 ? `경고 ${preflightWarnIssues.length}` : "정상"}</span>
          {savedRun ? (
            <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">
              최근 실행 기록: {formatRunOverallStatusKo(savedRun.overallStatus)}
            </span>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">월 잉여금</p>
            <p className="text-xl font-black tabular-nums text-navy">{formatKrw(locale, liveSummary.monthlySurplus)}</p>
            <p className="mt-2 text-[10px] italic leading-relaxed text-slate-500">실수령 - (필수+선택지출)</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">비상금 버팀력</p>
            <p className="text-xl font-black tabular-nums text-navy">{beginnerEmergencyMonths}개월</p>
            <p className="mt-2 text-[10px] italic leading-relaxed text-slate-500">부족액 {formatKrw(locale, liveSummary.emergencyGapKrw)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">부채 부담</p>
            <p className="text-xl font-black tabular-nums text-navy">{profileForm.debts.length}건</p>
            <p className="mt-2 text-[10px] italic leading-relaxed text-slate-500">DSR {formatPct(locale, liveSummary.dsrPct)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" data-testid="planning-workspace-quickstart-status">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">진행 상태</p>
            <p className="text-xl font-black tracking-tight text-primary">{quickStartVm.completedSummary}</p>
            <p className="mt-2 text-[10px] italic leading-relaxed text-slate-500">다음 단계 · {quickStartVm.nextStepSummary}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <label className={bodyChoiceRowClassName}>
          <input
            checked={beginnerMode}
            onChange={(event) => setBeginnerMode(event.target.checked)}
            type="checkbox"
          />
          초보자 모드
        </label>
      </Card>
      {beginnerMode ? (
        <BodyInset className="mb-6">
          <p className="text-xs font-semibold text-slate-800">5분 진행 안내</p>
          <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-3">
            {quickStartVm.progressItems.map((item) => (
              <p key={item.label} className={`rounded-lg border px-3 py-2 ${quickStartProgressToneClassName(item.state)}`}>
                {item.label} · {item.stateLabel}
              </p>
            ))}
          </div>
        </BodyInset>
      ) : null}

      {beginnerMode ? (
        <PlanningOnboardingWizard
          disabled={savingProfile || running}
          onApply={applyWizardOutputAction}
        />
      ) : null}
    </>
  );
}
