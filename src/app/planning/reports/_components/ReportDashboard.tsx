"use client";

import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { type ReportVM } from "@/lib/planning/reports/reportViewModel";
import {
  ReportDashboardActionsSection,
  ReportDashboardDisclosureSection,
  ReportDashboardGoalsSection,
  ReportDashboardOperatingGuideSection,
  ReportDashboardSimulationDebtSection,
  ReportDashboardSummarySection,
  ReportDashboardWarningsSection,
} from "./reportDashboard/sections";
import {
  PLANNER_ACTION_LINKS,
  actionSummaryToneFromInterpretation,
  buildActionRecommendHref,
  compactText,
  isStageSuccess,
  resolveHousingSupportContext,
  resolvePlanningStage,
} from "./reportDashboard/shared";

type Props = {
  vm: ReportVM;
};

export default function ReportDashboard({ vm }: Props) {
  const topWarnings = vm.warningAgg.slice(0, 10);
  const extraWarnings = vm.warningAgg.slice(10);
  const simulateReady = isStageSuccess(vm, "simulate");
  const actionsReady = isStageSuccess(vm, "actions");
  const monteReady = isStageSuccess(vm, "monteCarlo");
  const debtReady = isStageSuccess(vm, "debt");
  const appliedOverrides = vm.reproducibility?.appliedOverrides ?? [];
  const normalization = vm.normalization;
  const hasNormalization = (normalization?.defaultsApplied.length ?? 0) > 0
    || (normalization?.fixesApplied.length ?? 0) > 0;
  const evidenceById = new Map<string, EvidenceItem>((vm.evidence?.items ?? []).map((item) => [item.id, item]));
  const leadAction = vm.actionRows[0] ?? null;
  const summaryTone = actionSummaryToneFromInterpretation(vm.interpretation);
  const basisPreview = compactText(
    vm.monthlyOperatingGuide?.basisLabel || vm.assumptionsLines[0],
    120,
  ) || "저장된 실행 결과와 기본 가정 기준으로 계산했습니다.";
  const assumptionPreview = compactText(vm.assumptionsLines[0], 120);
  const renderOverrideReason = (reason?: string) => reason?.trim() || "입력값 기준으로 조정";
  const planningStage = resolvePlanningStage(vm);
  const emergencyRecommendHref = planningStage
    ? buildActionRecommendHref({
      baseHref: PLANNER_ACTION_LINKS.emergencyRecommend.href,
      runId: vm.header.runId,
      stage: planningStage,
      overallStatus: vm.stage.overallStatus,
      actionCode: "BUILD_EMERGENCY_FUND",
    })
    : null;
  const goalRecommendHref = planningStage
    ? buildActionRecommendHref({
      baseHref: PLANNER_ACTION_LINKS.savingRecommend.href,
      runId: vm.header.runId,
      stage: planningStage,
      overallStatus: vm.stage.overallStatus,
      actionCode: "COVER_LUMP_SUM_GOAL",
    })
    : null;
  const housingSupportContext = resolveHousingSupportContext(vm);
  const housingSupportTitle = housingSupportContext === "goal"
    ? "주거 관련 목표가 있다면 청약 일정부터 다시 확인해 보세요."
    : "현재 실행 제안에 주거 관련 확인 항목이 있어 청약 공고를 먼저 좁혀 볼 수 있습니다.";
  const housingSupportSummary = housingSupportContext === "goal"
    ? "플래닝에서는 다음에 볼 주거 정보를 먼저 좁혀 줍니다. 세부 조건과 실제 계약 판단은 주거 화면에서 다시 확인하세요."
    : "여기서는 다음에 볼 주거 정보를 빠르게 좁혀 줍니다. 세부 조건과 실제 계약 판단은 주거 화면에서 다시 확인하세요.";

  return (
    <div className="space-y-8" data-testid="report-dashboard">
      <ReportDashboardSummarySection
        vm={vm}
        simulateReady={simulateReady}
        leadAction={leadAction}
        summaryTone={summaryTone}
        basisPreview={basisPreview}
        assumptionPreview={assumptionPreview}
        evidenceById={evidenceById}
      />

      <ReportDashboardOperatingGuideSection vm={vm} simulateReady={simulateReady} />

      <ReportDashboardDisclosureSection
        vm={vm}
        appliedOverrides={appliedOverrides}
        hasNormalization={hasNormalization}
        renderOverrideReason={renderOverrideReason}
      />

      <ReportDashboardWarningsSection
        vm={vm}
        simulateReady={simulateReady}
        topWarnings={topWarnings}
        extraWarnings={extraWarnings}
      />

      <ReportDashboardGoalsSection vm={vm} simulateReady={simulateReady} />

      <ReportDashboardActionsSection
        vm={vm}
        actionsReady={actionsReady}
        emergencyRecommendHref={emergencyRecommendHref}
        goalRecommendHref={goalRecommendHref}
        housingSupportContext={housingSupportContext}
        housingSupportTitle={housingSupportTitle}
        housingSupportSummary={housingSupportSummary}
      />

      <ReportDashboardSimulationDebtSection vm={vm} monteReady={monteReady} debtReady={debtReady} />
    </div>
  );
}
