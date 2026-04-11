"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { t } from "@/lib/planning/i18n";
import { buildPlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
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
  snapshotItems,
  csrf = "",
}: PlanningWorkspaceClientProps) {
  const controller = usePlanningWorkspaceController({
    featureFlags,
    locale,
    initialSelectedProfileId,
    snapshotItems,
    csrf,
  });
  const { quickStart, profile, execution, results, dialogs, actions } = buildPlanningWorkspaceGroups(controller);

  return (
    <PageShell>
      <PageHeader
        title={t(locale, "PLANNING_TITLE")}
        description={t(locale, "PLANNING_DESC")}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface-muted px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">프로필</span>
              <select
                className="cursor-pointer bg-transparent text-xs font-bold text-slate-700 outline-none"
                value={quickStart.selectedProfileId}
                onChange={(event) => actions.setSelectedProfileId(event.target.value)}
              >
                {quickStart.profiles.length === 0 ? <option value="">없음</option> : null}
                {quickStart.profiles.map((profileOption) => (
                  <option key={profileOption.id} value={profileOption.id}>{profileOption.name}</option>
                ))}
              </select>
            </div>
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
          </div>
        )}
      />

      <PlanningWorkspaceTopSurfacePanel quickStart={quickStart} actions={actions} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PlanningWorkspaceProfilePanel profile={profile} actions={actions} />
        <PlanningWorkspaceExecutionPanel execution={execution} actions={actions} />
      </div>

      <PlanningWorkspaceResultsPanel results={results} actions={actions} />
      <PlanningWorkspaceModalPanel dialogs={dialogs} actions={actions} />
    </PageShell>
  );
}

export default PlanningWorkspaceClient;
