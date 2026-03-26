import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import {
  normalizeDraft,
  normalizeDraftWithDisclosure,
  toProfileJson,
  type FormDraft,
  type ProfileFormModel,
} from "./profileFormModel";

export type WorkspaceLiveSummary = {
  monthlySurplus: number;
  totalMonthlyDebtPayment: number;
  dsrPct: number;
  emergencyTargetKrw: number;
  emergencyGapKrw: number;
};

export type WorkspaceQuickStartProgressState = "done" | "current" | "pending";

export type WorkspaceQuickStartProgressItem = {
  label: string;
  state: WorkspaceQuickStartProgressState;
  stateLabel: string;
};

export type WorkspaceSelectedProfileSyncState = "missing" | "unknown" | "dirty" | "saved";

export type WorkspaceQuickStartVm = {
  beginnerStepProfileDone: boolean;
  beginnerStepRunDone: boolean;
  beginnerStepSaveDone: boolean;
  profileSyncState: WorkspaceSelectedProfileSyncState;
  runStatusReviewRequired: boolean;
  selectedRunReportHref: string;
  title: string;
  description: string;
  completedSummary: string;
  nextStepSummary: string;
  progressItems: WorkspaceQuickStartProgressItem[];
  tone: string;
};

function normalizeStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeStableValue(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    const normalized = normalizeStableValue(record[key]);
    if (normalized === undefined) continue;
    output[key] = normalized;
  }
  return output;
}

export function stableStringifyWorkspaceValue(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

export function focusWorkspaceQuickStartTarget(targetId: string): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const target = document.getElementById(targetId);
  if (!(target instanceof HTMLElement)) return false;

  const prefersReducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center",
  });
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  return true;
}

export function buildWorkspaceLiveSummary(profileForm: ProfileFormModel): WorkspaceLiveSummary {
  const income = Math.max(0, profileForm.monthlyIncomeNet);
  const essential = Math.max(0, profileForm.monthlyEssentialExpenses);
  const discretionary = Math.max(0, profileForm.monthlyDiscretionaryExpenses);
  const liquidAssets = Math.max(0, profileForm.liquidAssets);
  const monthlySurplus = income - essential - discretionary;
  const totalMonthlyDebtPayment = profileForm.debts.reduce((sum, debt) => sum + Math.max(0, debt.monthlyPayment), 0);
  const dsrPct = income > 0 ? (totalMonthlyDebtPayment / income) * 100 : 0;
  const emergencyTargetKrw = (essential + discretionary) * 6;
  const emergencyGapKrw = Math.max(0, emergencyTargetKrw - liquidAssets);

  return {
    monthlySurplus,
    totalMonthlyDebtPayment,
    dsrPct,
    emergencyTargetKrw,
    emergencyGapKrw,
  };
}

export function isWorkspaceQuickStartProfileDone(
  profileForm: ProfileFormModel,
  validationErrorCount: number,
): boolean {
  const hasIncome = profileForm.monthlyIncomeNet > 0;
  const hasExpenses = profileForm.monthlyEssentialExpenses > 0 || profileForm.monthlyDiscretionaryExpenses > 0;
  const hasAssets = profileForm.liquidAssets > 0 || profileForm.investmentAssets > 0;

  return validationErrorCount === 0 && hasIncome && hasExpenses && hasAssets;
}

export function resolveWorkspaceSelectedProfileSyncState(input: {
  selectedProfileId: string;
  selectedProfile: { name: string; profile: Record<string, unknown> } | null;
  profileForm: ProfileFormModel;
  profileName: string;
  pendingSuggestionsCount?: number;
}): WorkspaceSelectedProfileSyncState {
  if (input.selectedProfileId.trim().length < 1) return "missing";
  if (!input.selectedProfile) return "unknown";
  if ((input.pendingSuggestionsCount ?? 0) > 0) return "dirty";

  try {
    const savedProfile = normalizeDraft(
      input.selectedProfile.profile as FormDraft,
      input.selectedProfile.name || input.profileName,
    );
    const currentProfile = normalizeDraftWithDisclosure(
      toProfileJson(input.profileForm) as FormDraft,
      input.profileName,
    ).profile;
    const nameDirty = input.selectedProfile.name !== input.profileName;
    const profileDirty = stableStringifyWorkspaceValue(savedProfile) !== stableStringifyWorkspaceValue(currentProfile);
    return nameDirty || profileDirty ? "dirty" : "saved";
  } catch {
    return "unknown";
  }
}

export function buildWorkspaceQuickStartVm(input: {
  selectedProfileId: string;
  profileSyncState: WorkspaceSelectedProfileSyncState;
  beginnerStepProfileDone: boolean;
  beginnerStepRunDone: boolean;
  beginnerStepSaveDone: boolean;
  runStatusReviewRequired?: boolean;
  savedRunId?: string;
  savedRunOverallStatus?: PlanningRunOverallStatus;
  reportsPageHref: string;
  selectedProfileReportHref: (runId: string) => string;
  formatRunOverallStatus: (status: PlanningRunOverallStatus | undefined) => string;
}): WorkspaceQuickStartVm {
  const {
    profileSyncState,
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    runStatusReviewRequired: rawRunStatusReviewRequired = false,
    savedRunId,
    savedRunOverallStatus,
    reportsPageHref,
    selectedProfileReportHref,
    formatRunOverallStatus,
  } = input;

  const runStatusReviewRequired = profileSyncState === "saved" && rawRunStatusReviewRequired;

  const selectedRunReportHref = savedRunId
    ? selectedProfileReportHref(savedRunId)
    : reportsPageHref;

  const title = profileSyncState === "missing"
    ? "진행 상태를 다시 확인해 주세요. 다음 단계는 프로필 저장입니다."
    : profileSyncState === "unknown"
      ? "저장 상태를 아직 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
      : profileSyncState === "dirty"
        ? "선택한 프로필에 미저장 변경이 있습니다. 먼저 저장을 확인해 주세요."
        : runStatusReviewRequired
          ? "최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
          : !beginnerStepRunDone
          ? "프로필 저장/선택이 끝났습니다. 이제 첫 실행만 남았습니다."
          : !beginnerStepSaveDone
            ? "첫 실행이 끝났습니다. 결과 저장만 하면 저장된 리포트 확인으로 이어집니다."
            : "프로필 저장/선택, 첫 실행, 결과 저장까지 완료했습니다. 이제 저장된 리포트를 확인할 수 있습니다.";

  const description = profileSyncState === "missing"
    ? "새로고침 뒤에는 간단 시작 적용 완료 안내를 안전하게 복원할 수 없으니, 아래 프로필 영역에서 실제 저장 상태를 먼저 확인해 주세요."
    : profileSyncState === "unknown"
      ? "저장된 프로필과 현재 편집값을 아직 맞춰 보지 못했습니다. 아래 프로필 목록을 새로고침한 뒤 상태를 다시 확인해 주세요."
      : profileSyncState === "dirty"
        ? "현재 편집본은 아직 저장 전이라 1단계를 완료로 보지 않습니다. 이전 실행이나 리포트가 최신 변경을 반영하지 않을 수 있으니, 아래 저장 버튼으로 반영한 뒤 첫 실행을 다시 확인하세요."
      : runStatusReviewRequired
        ? "현재 환경에서는 최근 저장 실행과 현재 프로필의 일치 여부를 자동 확인하지 못했습니다. 아래 실행 내역에서 진행 상태를 다시 확인해 주세요."
        : !beginnerStepRunDone
          ? beginnerStepProfileDone
            ? "사전 점검 차단이 없다면 아래 첫 실행 시작 버튼으로 요약, 액션, 경고를 한 번에 계산하고, 결과 저장 뒤 저장된 리포트 확인으로 이어집니다."
            : "저장된 프로필을 기준으로는 첫 실행부터 이어갈 수 있고, 빈 항목은 아래에서 계속 보완할 수 있습니다."
          : !beginnerStepSaveDone
            ? "결과를 저장해야 같은 조건 재실행, What-if 비교, 저장된 리포트 확인을 다시 열 수 있습니다."
            : `최근 저장 상태: ${formatRunOverallStatus(savedRunOverallStatus)} · 저장된 결과는 리포트에서 다시 보고, 실행 기록에서 비교를 이어갈 수 있습니다.`;

  const completedSummary = profileSyncState === "missing"
    ? "실제 저장 상태를 다시 확인해 주세요."
    : profileSyncState === "unknown"
      ? "저장된 프로필과 현재 편집값을 다시 확인해 주세요."
      : profileSyncState === "dirty"
        ? "선택한 프로필 있음 · 미저장 변경 있음"
        : runStatusReviewRequired
          ? "프로필 저장 완료 · 실행 상태 확인 필요"
          : !beginnerStepRunDone
          ? "프로필 저장 완료"
          : beginnerStepSaveDone
            ? "프로필 저장 완료 · 첫 실행 완료 · 결과 저장 완료"
            : "프로필 저장 완료 · 첫 실행 완료";

  const nextStepSummary = profileSyncState === "missing" || profileSyncState === "dirty"
    ? "프로필 저장"
    : profileSyncState === "unknown"
      ? "진행 상태 다시 확인"
      : runStatusReviewRequired
        ? "진행 상태 다시 확인"
        : !beginnerStepRunDone
        ? "첫 실행 시작"
        : !beginnerStepSaveDone
          ? "결과 저장 후 리포트 확인"
          : "저장된 리포트 확인 또는 실행 내역 비교";

  const progressItems: WorkspaceQuickStartProgressItem[] = profileSyncState === "saved" && runStatusReviewRequired
    ? [
      { label: "프로필 저장", state: "done", stateLabel: "완료" },
      { label: "첫 실행", state: "current", stateLabel: "확인 필요" },
      { label: "결과 저장", state: "pending", stateLabel: "대기" },
      { label: "리포트 확인", state: "pending", stateLabel: "대기" },
    ]
    : profileSyncState === "saved"
    ? [
      { label: "프로필 저장", state: "done", stateLabel: "완료" },
      {
        label: "첫 실행",
        state: beginnerStepRunDone ? "done" : "current",
        stateLabel: beginnerStepRunDone ? "완료" : "다음",
      },
      {
        label: "결과 저장",
        state: beginnerStepSaveDone ? "done" : beginnerStepRunDone ? "current" : "pending",
        stateLabel: beginnerStepSaveDone ? "완료" : beginnerStepRunDone ? "다음" : "대기",
      },
      {
        label: "리포트 확인",
        state: beginnerStepSaveDone ? "current" : "pending",
        stateLabel: beginnerStepSaveDone ? "다음" : "대기",
      },
    ]
    : profileSyncState === "unknown"
      ? [
        { label: "프로필 저장", state: "pending", stateLabel: "확인 필요" },
        { label: "첫 실행", state: "pending", stateLabel: "대기" },
        { label: "결과 저장", state: "pending", stateLabel: "대기" },
        { label: "리포트 확인", state: "pending", stateLabel: "대기" },
      ]
      : [
        { label: "프로필 저장", state: "current", stateLabel: "다음" },
        { label: "첫 실행", state: "pending", stateLabel: "대기" },
        { label: "결과 저장", state: "pending", stateLabel: "대기" },
        { label: "리포트 확인", state: "pending", stateLabel: "대기" },
      ];

  const tone = profileSyncState === "missing"
    ? "border-sky-200 bg-sky-50"
    : profileSyncState === "unknown" || profileSyncState === "dirty"
      ? "border-amber-200 bg-amber-50"
      : runStatusReviewRequired
        ? "border-amber-200 bg-amber-50"
        : !beginnerStepRunDone
        ? "border-amber-200 bg-amber-50"
        : !beginnerStepSaveDone
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-slate-50";

  return {
    beginnerStepProfileDone,
    beginnerStepRunDone,
    beginnerStepSaveDone,
    profileSyncState,
    runStatusReviewRequired,
    selectedRunReportHref,
    title,
    description,
    completedSummary,
    nextStepSummary,
    progressItems,
    tone,
  };
}
