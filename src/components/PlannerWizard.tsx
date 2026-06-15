"use client";

import { useMemo, useState } from "react";
import { QuickViewModal } from "@/components/QuickViewModal";
import { PlaybookModal } from "@/components/PlaybookModal";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { buildBenefitQueries, inferSubscriptionRegion } from "@/lib/planner/executionHints";
import { computeInsuranceMetrics } from "@/lib/planner/insuranceMetrics";
import { buildPlan, type PlannerInput } from "@/lib/planner/plan";
import { computeRetirementMetrics } from "@/lib/planner/retirementMetrics";
import { loadCheckedMap, saveCheckedMap, type ChecklistCheckedMap } from "@/lib/planner/checklistStorage";
import { getLinkOpenMode, setLinkOpenMode, type LinkOpenMode } from "@/lib/planner/uiPrefs";
import {
  createSnapshotId,
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  type PlannerSnapshot,
} from "@/lib/planner/storage";
import { uiTextKo } from "@/lib/uiText.ko";
import { PlannerWizardFooterNav, PlannerWizardSidebar, MascotGuide } from "./plannerWizard/surfaces";
import {
  DEFAULT_INPUT,
  INITIAL_QUICK_VIEW,
  type PlannerActionLink,
  type QuickViewState,
  STEPS,
  openNewTab,
  resolveQuickView,
} from "./plannerWizard/shared";
import {
  PlannerWizardAlternativesStep,
  PlannerWizardAnalysisStep,
  PlannerWizardExecutionStep,
  PlannerWizardGoalStep,
  PlannerWizardMonitoringStep,
} from "./plannerWizard/steps";

export function PlannerWizard() {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<PlannerInput>(DEFAULT_INPUT);
  const [snapshots, setSnapshots] = useState<PlannerSnapshot[]>(() => listSnapshots());
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [checkedMap, setCheckedMap] = useState<ChecklistCheckedMap>(() => loadCheckedMap());
  const [linkOpenMode, setLinkOpenModeState] = useState<LinkOpenMode>(() => getLinkOpenMode());
  const [quickView, setQuickView] = useState<QuickViewState>(INITIAL_QUICK_VIEW);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [playbookId, setPlaybookId] = useState<string | null>(null);

  const plan = useMemo(() => buildPlan(input), [input]);

  function setNumber(key: keyof PlannerInput, value: string) {
    const clean = value.replace(/[^0-9.]/g, "");
    const num = Number(clean);
    setInput((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
  }

  function setText(key: keyof PlannerInput, value: string) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function setBoolean(key: keyof PlannerInput, value: boolean) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function saveCurrentSnapshot() {
    const snapshot: PlannerSnapshot = {
      id: createSnapshotId(),
      createdAt: new Date().toISOString(),
      input,
      metrics: plan.metrics,
      recommendations: plan.recommendations,
    };
    saveSnapshot(snapshot);
    setSnapshots(listSnapshots());
  }

  function applySnapshot(id: string) {
    const snap = loadSnapshot(id);
    if (!snap) return;
    setInput({ ...DEFAULT_INPUT, ...snap.input });
  }

  function deleteSnapshotById(id: string) {
    deleteSnapshot(id);
    setSnapshots(listSnapshots());
  }

  function toggleChecklist(id: string) {
    const next = { ...checkedMap, [id]: !checkedMap[id] };
    setCheckedMap(next);
    saveCheckedMap(next);
  }

  function openAction(action: PlannerActionLink) {
    const resolved = resolveQuickView(action);
    if (linkOpenMode === "newtab") {
      openNewTab(resolved.href);
      return;
    }

    setQuickView({
      open: true,
      kind: resolved.kind,
      title: resolved.title,
      hrefForNewTab: resolved.href,
    });
  }

  function openPlaybook(id?: string) {
    if (!id) return;
    setPlaybookId(id);
    setPlaybookOpen(true);
  }

  function handleLinkOpenModeChange(mode: LinkOpenMode) {
    setLinkOpenModeState(mode);
    setLinkOpenMode(mode);
  }

  function handlePreviousStep() {
    setStep((currentStep) => Math.max(0, currentStep - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNextStep() {
    setStep((currentStep) => Math.min(STEPS.length - 1, currentStep + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const compareSnapA = compareA ? loadSnapshot(compareA) : null;
  const compareSnapB = compareB ? loadSnapshot(compareB) : null;
  const benefitQueries = buildBenefitQueries(input);
  const subscriptionRegion = inferSubscriptionRegion(input.goalName);
  const trendSource = [...snapshots].slice(0, 10).reverse();
  const monthlySavingTrend = trendSource.map((snapshot) => snapshot.metrics.monthlySaving);
  const emergencyGapTrend = trendSource.map((snapshot) => snapshot.metrics.emergencyGap);
  const goalRequiredTrend = trendSource.map((snapshot) => snapshot.metrics.goalRequiredMonthly);
  const debtRatioTrend = trendSource.map((snapshot) => snapshot.metrics.debtPaymentRatio * 100);

  const healthScore = useMemo(() => {
    let score = 70;
    if (plan.metrics.debtPaymentRatio > 0.3) score -= 20;
    if (plan.metrics.emergencyGap > 0) score -= 15;
    if (!plan.metrics.goalFeasible) score -= 10;
    return Math.max(0, Math.min(100, score));
  }, [plan]);

  const insuranceMetrics = useMemo(
    () =>
      computeInsuranceMetrics({
        unit: input.unit,
        monthlyIncome: input.monthlyIncome,
        monthlyInsurancePremium: input.monthlyInsurancePremium,
      }),
    [input.unit, input.monthlyIncome, input.monthlyInsurancePremium],
  );
  const retirementMetrics = useMemo(
    () =>
      computeRetirementMetrics({
        unit: input.unit,
        monthlyIncome: input.monthlyIncome,
        monthlyFixedExpense: input.monthlyFixedExpense,
        monthlyVariableExpense: input.monthlyVariableExpense,
        retirementAssets: input.retirementAssets,
        retirementMonthlyContribution: input.retirementMonthlyContribution,
        npsExpectedMonthly: input.npsExpectedMonthly,
        retirementNeedRatioPct: input.retirementNeedRatioPct,
        retirementWithdrawalRatePct: input.retirementWithdrawalRatePct,
      }),
    [
      input.unit,
      input.monthlyIncome,
      input.monthlyFixedExpense,
      input.monthlyVariableExpense,
      input.retirementAssets,
      input.retirementMonthlyContribution,
      input.npsExpectedMonthly,
      input.retirementNeedRatioPct,
      input.retirementWithdrawalRatePct,
    ],
  );

  return (
    <PageShell className="bg-surface-muted">
      <SectionHeader
        title={uiTextKo.planner.title}
        subtitle={uiTextKo.planner.subtitle}
        icon="/icons/ic-planner.png"
        className="mb-8"
      />

      <div className="flex flex-col gap-8 md:flex-row">
        <PlannerWizardSidebar
          step={step}
          linkOpenMode={linkOpenMode}
          onStepSelect={setStep}
          onLinkOpenModeChange={handleLinkOpenModeChange}
        />

        <div className="flex-1 space-y-6">
          <MascotGuide step={step} />

          <div
            key={step}
            className="animate-in fade-in slide-in-from-right-2 duration-300"
          >
              {step === 0 ? (
                <PlannerWizardGoalStep
                  input={input}
                  setNumber={setNumber}
                  setText={setText}
                />
              ) : null}

              {step === 1 ? (
                <PlannerWizardAnalysisStep
                  input={input}
                  plan={plan}
                  insuranceMetrics={insuranceMetrics}
                  retirementMetrics={retirementMetrics}
                  setNumber={setNumber}
                  setText={setText}
                  setBoolean={setBoolean}
                />
              ) : null}

              {step === 2 ? (
                <PlannerWizardAlternativesStep
                  input={input}
                  plan={plan}
                  healthScore={healthScore}
                  linkOpenMode={linkOpenMode}
                  openAction={openAction}
                />
              ) : null}

              {step === 3 ? (
                <PlannerWizardExecutionStep
                  plan={plan}
                  checkedMap={checkedMap}
                  benefitQueries={benefitQueries}
                  subscriptionRegion={subscriptionRegion}
                  toggleChecklist={toggleChecklist}
                  openAction={openAction}
                  openPlaybook={openPlaybook}
                />
              ) : null}

              {step === 4 ? (
                <PlannerWizardMonitoringStep
                  plan={plan}
                  input={input}
                  snapshots={snapshots}
                  compareA={compareA}
                  compareB={compareB}
                  compareSnapA={compareSnapA}
                  compareSnapB={compareSnapB}
                  monthlySavingTrend={monthlySavingTrend}
                  emergencyGapTrend={emergencyGapTrend}
                  goalRequiredTrend={goalRequiredTrend}
                  debtRatioTrend={debtRatioTrend}
                  saveCurrentSnapshot={saveCurrentSnapshot}
                  applySnapshot={applySnapshot}
                  deleteSnapshotById={deleteSnapshotById}
                  setCompareA={setCompareA}
                  setCompareB={setCompareB}
                />
              ) : null}
          </div>

          <PlannerWizardFooterNav
            step={step}
            onPrevious={handlePreviousStep}
            onContinue={handleNextStep}
          />
        </div>
      </div>

      <QuickViewModal
        open={quickView.open}
        onClose={() => setQuickView((prev) => ({ ...prev, open: false }))}
        kind={quickView.kind}
        title={quickView.title}
        hrefForNewTab={quickView.hrefForNewTab}
      />

      <PlaybookModal open={playbookOpen} onClose={() => setPlaybookOpen(false)} playbookId={playbookId} />
    </PageShell>
  );
}
