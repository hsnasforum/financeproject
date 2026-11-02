"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type Locale } from "@/lib/planning/i18n";
import {
  buildDiagnosisSubmission,
  buildDiagnosisSummary,
  canResetDiagnosis,
  canStartDiagnosisSubmission,
  isDiagnosisDirty,
  listDiagnosisAppliedDefaults,
  planningDiagnosisSession,
  resolveDiagnosisNext,
  submitDiagnosisDraft,
  syncDiagnosisBeforeUnload,
  validateDiagnosisStep,
  type DiagnosisAction,
  type DiagnosisDraft,
  type DiagnosisGuard,
  type DiagnosisIssue,
  type DiagnosisSessionState,
  type DiagnosisStep,
  type DiagnosisSummaryRow,
} from "@/lib/planning/ui/planningDiagnosisWizard";
import { type SnapshotListItem } from "@/lib/planning/ui/snapshotListTypes";
import { type SnapshotSelection } from "@/lib/planning/ui/snapshotSelection";
import { assumptionsFormToRecord, type AssumptionsFormModel } from "@/lib/planning/ui/workspaceAssumptionsEditor";
import { focusWorkspaceQuickStartTarget } from "@/lib/planning/ui/workspaceQuickStart";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import { formatGroupedIntegerInput, toFiniteNumber } from "@/components/planning/workspace/panels/shared";
import { createPlanningProfileRecord } from "@/components/planning/workspace/useWorkspaceProfileBundle";
import {
  createPlanningReportRecord,
  createPlanningRunRecord,
} from "@/components/planning/workspace/useWorkspaceRunExecutionActions";
import { buildWorkspaceExecutionGuardPresenter } from "@/components/planning/workspace/workspacePresenters";
import {
  buildPlanningRunInput,
  formatPreflightIssue,
  parseHorizonMonths,
  parseMaxCandidatesPerAction,
  parseMonteCarloPaths,
  parseMonteCarloSeed,
  type ParsedRunInputs,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";

export type DiagnosisRunConfig = {
  policyId: AllocationPolicyId;
  runTitle: string;
  assumptionsForm: AssumptionsFormModel;
  assumptionsExtraOverrides: Record<string, unknown>;
  effectiveSnapshotSelection: SnapshotSelection;
  selectedSnapshotId: string | undefined;
  selectedSnapshotItem: SnapshotListItem | null | undefined;
  effectiveRunScenariosEnabled: boolean;
  effectiveRunMonteCarloEnabled: boolean;
  effectiveRunActionsEnabled: boolean;
  effectiveRunDebtEnabled: boolean;
  effectiveIncludeProducts: boolean;
  maxCandidatesPerAction: string;
  monteCarloPaths: string;
  monteCarloSeed: string;
  debtExtraPaymentKrw: string;
};

export type PlanningDiagnosisWizardController = {
  state: DiagnosisSessionState;
  dirty: boolean;
  issues: DiagnosisIssue[];
  showIssues: boolean;
  guard: DiagnosisGuard;
  conditions: DiagnosisSummaryRow[];
  appliedDefaults: string[];
  summary: DiagnosisSummaryRow[];
  canSubmit: boolean;
  goNext: () => void;
  goPrevious: () => void;
  dispatch: (action: DiagnosisAction) => void;
  loadExample: () => void;
  requestReset: (acknowledged: boolean) => void;
  submit: () => Promise<void>;
};

const POLICY_LABELS: Record<AllocationPolicyId, string> = {
  balanced: "균형형 (기본)",
  safety: "안정형",
  growth: "성장형",
};

export const DIAGNOSIS_WARNING_CONFIRM_ID = "diagnosis-warning-confirm";

const NO_GUARD: DiagnosisGuard = { blockers: [], warnings: [], signature: "" };

// The existing parseRunInputs checks the legacy profile editor, which the wizard must not depend on.
// Only the run options are shared; the period comes from the wizard and beginner runs send no offers.
export function buildDiagnosisParsedRunInputs(input: {
  draft: DiagnosisDraft;
  profile: unknown;
  config: DiagnosisRunConfig;
}): { ok: true; parsed: ParsedRunInputs } | { ok: false; message: string } {
  const { config } = input;
  const horizon = parseHorizonMonths(input.draft.horizonMonths.replaceAll(",", "").trim());
  if (!horizon) return { ok: false, message: "분석 기간은 1~1200개월 사이여야 합니다." };

  const paths = parseMonteCarloPaths(config.monteCarloPaths);
  const seed = parseMonteCarloSeed(config.monteCarloSeed);
  if (config.effectiveRunMonteCarloEnabled && (paths === null || seed === null)) {
    return { ok: false, message: "Monte Carlo 설정을 전체 입력 화면에서 확인해 주세요." };
  }
  const maxCandidates = parseMaxCandidatesPerAction(config.maxCandidatesPerAction);
  if (config.effectiveRunActionsEnabled && maxCandidates === null) {
    return { ok: false, message: "후보 최대 개수는 1~20 범위여야 합니다." };
  }
  const extraPayment = Math.max(0, Math.trunc(toFiniteNumber(config.debtExtraPaymentKrw, 0)));

  return {
    ok: true,
    parsed: {
      profile: input.profile as Record<string, unknown>,
      assumptions: assumptionsFormToRecord(config.assumptionsForm, config.assumptionsExtraOverrides),
      horizon,
      policyId: config.policyId,
      ...(config.selectedSnapshotId ? { snapshotId: config.selectedSnapshotId } : {}),
      monteCarlo: { paths: paths ?? 0, seed: seed ?? 0 },
      actions: {
        includeProducts: config.effectiveIncludeProducts,
        maxCandidatesPerAction: maxCandidates ?? 0,
      },
      debt: {
        offers: [],
        options: {
          ...(extraPayment > 0 ? { extraPaymentKrw: extraPayment } : {}),
        },
      },
    },
  };
}

export function buildDiagnosisRunBody(input: {
  profileId: string;
  parsed: ParsedRunInputs;
  config: DiagnosisRunConfig;
}) {
  const { config } = input;
  return withDevCsrf({
    profileId: input.profileId,
    title: config.runTitle,
    input: buildPlanningRunInput({
      parsed: input.parsed,
      effectiveRunScenariosEnabled: config.effectiveRunScenariosEnabled,
      effectiveRunActionsEnabled: config.effectiveRunActionsEnabled,
      effectiveRunDebtEnabled: config.effectiveRunDebtEnabled,
      effectiveRunMonteCarloEnabled: config.effectiveRunMonteCarloEnabled,
    }),
  });
}

export function buildDiagnosisRunConditions(input: {
  draft: DiagnosisDraft;
  config: DiagnosisRunConfig;
}): DiagnosisSummaryRow[] {
  const { config } = input;
  const assumptions = config.assumptionsForm;
  const snapshot = config.selectedSnapshotItem;
  const analyses = [
    config.effectiveRunScenariosEnabled ? "시나리오 비교" : "",
    config.effectiveRunMonteCarloEnabled ? "Monte Carlo" : "",
    config.effectiveRunActionsEnabled ? "실행 제안" : "",
    config.effectiveRunDebtEnabled ? "부채 분석" : "",
    config.effectiveIncludeProducts ? "상품 후보" : "",
  ].filter(Boolean);
  return [
    { label: "분석 기간", value: input.draft.horizonMonths.trim() ? `${input.draft.horizonMonths.trim()}개월` : "미입력" },
    { label: "배분 정책", value: POLICY_LABELS[config.policyId] },
    {
      label: "계산 가정",
      value: `물가상승률 ${assumptions.inflationPct}% · 기대수익률 ${assumptions.expectedReturnPct}% · 현금수익률 ${assumptions.cashReturnPct}% · 인출률 ${assumptions.withdrawalRatePct}%`,
    },
    {
      label: "기준 데이터",
      value: snapshot
        ? [
          `기준일 ${snapshot.asOf ?? "미확인"}`,
          snapshot.fetchedAt ? `수집 ${snapshot.fetchedAt.slice(0, 10)}` : "",
          typeof snapshot.staleDays === "number" ? `${snapshot.staleDays}일 경과` : "",
        ].filter(Boolean).join(" · ")
        : "기준일 없음 · 시장 기준 데이터가 없으면 기본 가정으로 계산합니다.",
    },
    { label: "분석 항목", value: analyses.join(" · ") || "기본 계산만" },
    { label: "추가상환", value: `${formatGroupedIntegerInput(toFiniteNumber(config.debtExtraPaymentKrw, 0))}원` },
  ];
}

export function buildDiagnosisGuard(input: {
  draft: DiagnosisDraft;
  config: DiagnosisRunConfig;
}): DiagnosisGuard {
  const { config, draft } = input;
  const submission = buildDiagnosisSubmission(draft);
  if (!submission.ok) return NO_GUARD;
  const parsed = buildDiagnosisParsedRunInputs({ draft, profile: submission.profile, config });
  const preflight = buildWorkspaceExecutionGuardPresenter({
    profileForm: submission.form,
    effectiveSnapshotSelection: config.effectiveSnapshotSelection,
    assumptionsForm: config.assumptionsForm,
    assumptionsExtraOverrides: config.assumptionsExtraOverrides,
    beginnerMode: true,
    effectiveRunDebtEnabled: config.effectiveRunDebtEnabled,
    debtOfferRows: [],
    effectiveRunMonteCarloEnabled: config.effectiveRunMonteCarloEnabled,
    monteCarloPaths: config.monteCarloPaths,
    horizonMonths: draft.horizonMonths,
  });
  const warnings = [...submission.warnings, ...preflight.preflightWarnIssues.map(formatPreflightIssue)];
  return {
    blockers: [
      ...preflight.preflightBlockIssues.map(formatPreflightIssue),
      ...(parsed.ok ? [] : [parsed.message]),
    ],
    warnings,
    signature: warnings.join("|"),
  };
}

function focusAfterRender(targetId: string): void {
  window.requestAnimationFrame(() => focusWorkspaceQuickStartTarget(targetId));
}

export function usePlanningDiagnosisWizard(input: {
  locale: Locale;
  config: DiagnosisRunConfig;
  loadProfiles: () => Promise<void>;
}): PlanningDiagnosisWizardController {
  const { config, loadProfiles, locale } = input;
  const session = planningDiagnosisSession;
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getServerState);
  const dirty = isDiagnosisDirty(state);

  // Registered from the controller so the warning also covers the full input view of this page.
  useEffect(() => syncDiagnosisBeforeUnload(window, dirty), [dirty]);

  const issues = useMemo(() => validateDiagnosisStep(state.draft, state.step), [state.draft, state.step]);
  const onConfirmStep = state.step === 5;
  const guard = useMemo(
    () => (onConfirmStep ? buildDiagnosisGuard({ draft: state.draft, config }) : NO_GUARD),
    [config, onConfirmStep, state.draft],
  );
  const summary = useMemo(() => {
    const submission = onConfirmStep ? buildDiagnosisSubmission(state.draft) : null;
    return submission?.ok ? buildDiagnosisSummary(state.draft) : [];
  }, [onConfirmStep, state.draft]);
  const conditions = useMemo(
    () => buildDiagnosisRunConditions({ draft: state.draft, config }),
    [config, state.draft],
  );
  const appliedDefaults = useMemo(() => listDiagnosisAppliedDefaults(state.draft), [state.draft]);

  const goNext = useCallback((): void => {
    const current = session.getState();
    session.dispatch({ type: "attemptStep", step: current.step });
    const next = resolveDiagnosisNext(current);
    if (next.advance) {
      session.dispatch({ type: "goToStep", step: next.nextStep });
      return;
    }
    if (next.focusFieldId) focusAfterRender(next.focusFieldId);
  }, [session]);

  const goPrevious = useCallback((): void => {
    const { step } = session.getState();
    if (step > 1) session.dispatch({ type: "goToStep", step: (step - 1) as DiagnosisStep });
  }, [session]);

  const loadExample = useCallback((): void => {
    if (isDiagnosisDirty(session.getState()) && !window.confirm("지금 입력한 내용을 예시 값으로 바꿀까요?")) return;
    session.dispatch({ type: "loadExample" });
  }, [session]);

  const requestReset = useCallback((acknowledged: boolean): void => {
    const current = session.getState();
    if (!canResetDiagnosis(current, acknowledged)) return;
    const hasUnsavedInput = !acknowledged && isDiagnosisDirty(current);
    if (hasUnsavedInput && !window.confirm("입력한 내용을 모두 지우고 새 진단을 시작할까요?")) return;
    session.dispatch({ type: "reset" });
  }, [session]);

  const submit = useCallback(async (): Promise<void> => {
    const current = session.getState();
    const firstIssue = validateDiagnosisStep(current.draft, 5)[0];
    if (firstIssue || !canStartDiagnosisSubmission(current, guard)) {
      session.dispatch({ type: "attemptStep", step: 5 });
      if (firstIssue) focusAfterRender(firstIssue.fieldId);
      else if (guard.blockers.length < 1) focusAfterRender(DIAGNOSIS_WARNING_CONFIRM_ID);
      return;
    }

    await submitDiagnosisDraft({
      store: session,
      guard,
      deps: {
        saveProfile: ({ name, profile }) => createPlanningProfileRecord({ locale, name, profile }),
        runDiagnosis: async (profileId) => {
          const parsed = buildDiagnosisParsedRunInputs({ draft: current.draft, profile: {}, config });
          if (!parsed.ok) return { status: "failed", message: parsed.message };
          return createPlanningRunRecord({
            locale,
            body: buildDiagnosisRunBody({ profileId, parsed: parsed.parsed, config }),
            createKey: () => crypto.randomUUID(),
          });
        },
        saveReport: (runId) => createPlanningReportRecord({ locale, runId }),
      },
    });
    // List refresh only: no selection change, so the existing editor and profiles stay as they are.
    if (session.getState().submission.profileId) void loadProfiles().catch(() => undefined);
  }, [config, guard, loadProfiles, locale, session]);

  return {
    state,
    dirty,
    issues,
    showIssues: state.attemptedStep >= state.step,
    guard,
    conditions,
    appliedDefaults,
    summary,
    canSubmit: onConfirmStep && issues.length < 1 && canStartDiagnosisSubmission(state, guard),
    goNext,
    goPrevious,
    dispatch: session.dispatch,
    loadExample,
    requestReset,
    submit,
  };
}
