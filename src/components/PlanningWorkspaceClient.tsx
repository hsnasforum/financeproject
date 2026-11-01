"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { t } from "@/lib/planning/i18n";
import { resolvePlanningWorkspaceEntry } from "@/lib/planning/ui/planningDiagnosisWizard";
import { PlanningDiagnosisWizard } from "@/components/planning/PlanningDiagnosisWizard";
import {
  PlanningWorkspaceExecutionPanel,
  PlanningWorkspaceModalPanel,
  PlanningWorkspaceProfilePanel,
  PlanningWorkspaceResultsPanel,
  PlanningWorkspaceTopSurfacePanel,
} from "@/components/planning/workspace/panels";
import {
  type PlanningWorkspaceClientProps,
  usePlanningWorkspaceController,
} from "@/components/planning/workspace/usePlanningWorkspaceController";

export {
  transitionWorkspaceExecutionOptionsForMode,
  type WorkspaceAdvancedExecutionOptions,
} from "@/components/planning/workspace/executionOptions";

export function PlanningWorkspaceClient({
  featureFlags,
  locale,
  initialSelectedProfileId = "",
  initialSelectedProfile = null,
  snapshotItems,
  csrf = "",
}: PlanningWorkspaceClientProps) {
  const controller = usePlanningWorkspaceController({
    featureFlags,
    locale,
    initialSelectedProfileId,
    initialSelectedProfile,
    snapshotItems,
    csrf,
  });
  const { quickStart, profile, execution, results, dialogs, actions, diagnosisWizard } = controller;
  const view = useSearchParams()?.get("view");
  const entry = resolvePlanningWorkspaceEntry({
    initialSelectedProfileId,
    view,
    beginnerMode: quickStart.beginnerMode,
    beginnerModeLoaded: quickStart.beginnerModeLoaded,
  });
  const headerSelectNeedsPendingOption = Boolean(
    quickStart.selectedProfileId
    && !quickStart.profiles.some((profileOption) => profileOption.id === quickStart.selectedProfileId),
  );

  return (
    <PageShell>
      <PageHeader
        title={locale === "ko-KR" ? "재무 진단" : t(locale, "PLANNING_TITLE")}
        description={locale === "ko-KR" ? "내 재무 정보를 확인하고, 계산 결과에서 다음 행동을 정하세요." : t(locale, "PLANNING_DESC")}
        action={(
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {entry === "full" ? (
              <div className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-surface-muted px-3 py-1.5">
                <span className="text-sm font-medium text-slate-600">프로필</span>
                <select
                  aria-label="현재 작업 프로필"
                  disabled={execution.running || profile.savingProfile}
                  className="min-w-0 max-w-[12rem] cursor-pointer bg-transparent text-xs font-bold text-slate-700 outline-none"
                  value={quickStart.selectedProfileId}
                  onChange={(event) => actions.setSelectedProfileId(event.target.value)}
                >
                  {headerSelectNeedsPendingOption ? <option hidden value={quickStart.selectedProfileId} /> : null}
                  {quickStart.profiles.length === 0 ? <option value="">없음</option> : null}
                  {quickStart.profiles.length > 0 && !quickStart.selectedProfileId ? <option value="">선택 없음 · 저장 전 입력</option> : null}
                  {quickStart.profiles.map((profileOption) => (
                    <option key={profileOption.id} value={profileOption.id}>{profileOption.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full bg-white font-bold"
              onClick={() => actions.setFeedbackModalOpen(true)}
            >
              피드백
            </Button>
            <Link
              href={quickStart.runsPageHref}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-surface-muted"
            >
              실행 기록
            </Link>
            <Link
              href={quickStart.reportsPageHref}
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-bold text-white transition-colors hover:bg-navy"
            >
              리포트
            </Link>
            <Link
              href="/planning/v3/transactions/batches"
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-surface-muted"
            >
              거래 기반 상담 초안(베타)
            </Link>
          </div>
        )}
      />

      {entry === "wizard" ? <PlanningDiagnosisWizard wizard={diagnosisWizard} /> : null}
      {entry === "pending" ? <p role="status" data-planning-navigation-state="/planning" className="mb-6 text-sm text-slate-600">재무 진단 화면을 준비하고 있습니다.</p> : null}
      {entry === "full" ? (
        <>
          {view === "full" && quickStart.beginnerMode ? (
            <Link href="/planning" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
              단계별 새 진단으로 돌아가기
            </Link>
          ) : null}
          <PlanningWorkspaceTopSurfacePanel quickStart={quickStart} actions={actions} />

          <nav aria-label="재무 진단 화면 이동" className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-sm font-semibold text-primary">
            <a href="#planning-input-section" className="inline-flex min-h-11 items-center hover:underline">1. 재무 정보 확인</a>
            <a href="#planning-execution-section" className="inline-flex min-h-11 items-center hover:underline">2. 계산·기록 저장</a>
            {results.runResult ? <a href="#planning-workspace-results" data-testid="planning-result-jump" className="inline-flex min-h-11 items-center hover:underline">3. 진단 결과 보기</a> : <span className="inline-flex min-h-11 items-center font-normal text-slate-500">3. 계산 후 결과 확인</span>}
          </nav>
          <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
            <section id="planning-input-section" aria-label="재무 정보 입력" className="min-w-0 scroll-mt-28">
              <PlanningWorkspaceProfilePanel profile={profile} actions={actions} />
            </section>
            <section id="planning-execution-section" aria-label="계산 조건과 실행" className="min-w-0 scroll-mt-28">
              <PlanningWorkspaceExecutionPanel execution={execution} actions={actions} />
            </section>
          </div>

          <PlanningWorkspaceResultsPanel results={results} actions={actions} />
        </>
      ) : null}
      <PlanningWorkspaceModalPanel dialogs={dialogs} actions={actions} />
    </PageShell>
  );
}

export default PlanningWorkspaceClient;
