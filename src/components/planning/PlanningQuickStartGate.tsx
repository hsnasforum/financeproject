"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  buildPlanningQuickStartPreview,
  buildPlanningQuickStartOutput,
  isPlanningQuickStartReady,
  type PlanningQuickRuleStatus,
  type PlanningQuickStartPreview,
  type PlanningQuickStartDraft,
} from "@/app/planning/_lib/planningQuickStart";
import { type PlanningWizardOutput } from "@/app/planning/_lib/planningOnboardingWizard";
import { type WorkspaceSelectedProfileSyncState } from "@/app/planning/_lib/workspaceQuickStart";

type PlanningQuickStartGateProps = {
  disabled?: boolean;
  nextStepLabel?: string;
  nextStepDescription?: string;
  nextStepTargetId?: string;
  profileSyncState?: WorkspaceSelectedProfileSyncState;
  runStatusReviewRequired?: boolean;
  runDone?: boolean;
  saveDone?: boolean;
  onApply: (output: PlanningWizardOutput) => void;
};

function formatGroupedIntegerInput(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("ko-KR").format(Math.round(numeric));
}

function toNumber(value: string): number | undefined {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function formatSignedAmount(value: number): string {
  const rounded = Math.round(value);
  const formatted = new Intl.NumberFormat("ko-KR").format(Math.abs(rounded));
  if (rounded < 0) return `-${formatted}원`;
  return `${formatted}원`;
}

function renderPreviewSummary(preview: PlanningQuickStartPreview): string[] {
  return [
    `월 실수령 ${formatSignedAmount(preview.monthlyIncomeNet)}에서 월 고정지출 ${formatSignedAmount(preview.fixedExpense)}을 먼저 반영한 첫 초안 월 잉여금은 ${formatSignedAmount(preview.monthlySurplus)}입니다.`,
    `${preview.goalName} 목표 ${formatSignedAmount(preview.goalTargetAmount)}은 ${preview.goalTargetMonth}개월 동안 매달 약 ${formatSignedAmount(preview.targetMonthlyContribution)}씩 모으는 기준으로 시작합니다.`,
    "초안을 적용한 뒤 아래 워크스페이스에서 자산, 부채, 선택지출을 바로 이어서 수정할 수 있습니다.",
  ];
}

function quickRuleToneClassName(status: PlanningQuickRuleStatus): string {
  if (status.tone === "danger") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status.tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function PlanningQuickStartGate({
  disabled = false,
  nextStepLabel,
  nextStepDescription,
  nextStepTargetId,
  profileSyncState = "missing",
  runStatusReviewRequired = false,
  runDone = false,
  saveDone = false,
  onApply,
}: PlanningQuickStartGateProps) {
  const [draft, setDraft] = useState<PlanningQuickStartDraft>({
    goalTargetMonth: 12,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [appliedPreview, setAppliedPreview] = useState<PlanningQuickStartPreview | null>(null);
  const [profileSaveRequiredAfterApply, setProfileSaveRequiredAfterApply] = useState(false);
  const [profileUnsavedStateSeenAfterApply, setProfileUnsavedStateSeenAfterApply] = useState(false);

  const ready = useMemo(() => isPlanningQuickStartReady(draft), [draft]);
  const preview = useMemo(
    () => (ready ? buildPlanningQuickStartPreview(draft) : null),
    [draft, ready],
  );
  useEffect(() => {
    if (!profileSaveRequiredAfterApply || profileSyncState === "saved" || profileUnsavedStateSeenAfterApply) return;
    const timeoutId = window.setTimeout(() => {
      setProfileUnsavedStateSeenAfterApply(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [profileSaveRequiredAfterApply, profileSyncState, profileUnsavedStateSeenAfterApply]);

  const profileSaveCompletedAfterApply = profileSaveRequiredAfterApply
    && profileUnsavedStateSeenAfterApply
    && profileSyncState === "saved";
  const profileSavedAfterApply = profileSaveRequiredAfterApply
    ? profileSaveCompletedAfterApply
    : profileSyncState === "saved";

  function updateField<K extends keyof PlanningQuickStartDraft>(key: K, value: PlanningQuickStartDraft[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (previewOpen) {
      setPreviewOpen(false);
    }
    if (appliedPreview) {
      setAppliedPreview(null);
    }
    if (profileSaveRequiredAfterApply) {
      setProfileSaveRequiredAfterApply(false);
    }
    if (profileUnsavedStateSeenAfterApply) {
      setProfileUnsavedStateSeenAfterApply(false);
    }
  }

  function applyQuickStart(): void {
    if (!ready || disabled || !previewOpen || !preview) return;
    setProfileSaveRequiredAfterApply(true);
    setProfileUnsavedStateSeenAfterApply(false);
    setAppliedPreview(preview);
    onApply(buildPlanningQuickStartOutput(draft, { appliedAt: new Date().toISOString() }));
    setPreviewOpen(false);
  }

  function openPreview(): void {
    if (!ready || disabled) return;
    setPreviewOpen(true);
  }

  function focusNextStep(): void {
    if (!nextStepTargetId) return;
    const target = document.getElementById(nextStepTargetId);
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof target.focus === "function") {
      target.focus();
    }
  }

  const appliedCompletedSummary = saveDone
    ? "초안 적용 완료 · 프로필 저장 완료 · 첫 실행 완료"
    : runDone
      ? "초안 적용 완료 · 프로필 저장 완료 · 첫 실행 완료"
      : runStatusReviewRequired
        ? "초안 적용 완료 · 실행 상태 확인 필요"
        : profileSyncState === "dirty" || profileSyncState === "unknown"
        ? "초안 적용 완료 · 미저장 변경 있음"
        : profileSavedAfterApply
        ? "초안 적용 완료 · 프로필 저장 완료"
        : "초안 적용 완료";
  const appliedNextStepSummary = saveDone
    ? "리포트 보기"
    : runDone
      ? "결과 저장"
      : runStatusReviewRequired
        ? "진행 상태 다시 확인"
        : profileSyncState === "unknown"
        ? "진행 상태 다시 확인"
        : profileSyncState === "dirty"
          ? "프로필 저장"
          : profileSavedAfterApply
            ? "첫 실행 시작"
            : "프로필 저장";
  const appliedTitle = saveDone
    ? "첫 실행까지 완료했습니다. 이제 리포트와 비교로 이어가면 됩니다."
    : runDone
      ? "첫 실행이 끝났습니다. 다음 단계만 확인하면 됩니다."
      : runStatusReviewRequired
        ? "최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
        : profileSyncState === "unknown"
        ? "진행 상태를 다시 확인해 주세요."
        : profileSyncState === "dirty"
          ? "선택한 프로필에 미저장 변경이 있습니다. 먼저 저장을 확인해 주세요."
          : profileSaveCompletedAfterApply
            ? "프로필 저장 완료. 이제 첫 실행만 남았습니다."
            : profileSavedAfterApply
              ? "프로필 저장이 되어 있어 바로 첫 실행으로 이어갈 수 있습니다."
              : "초안 적용 완료. 이제 프로필 저장만 하면 됩니다.";
  const appliedDescription = saveDone
    ? (nextStepDescription ?? "아래 리포트 버튼으로 결과와 비교 화면을 바로 이어서 볼 수 있습니다.")
    : runDone
      ? (nextStepDescription ?? "아래 결과 저장 버튼으로 현재 상태를 보관하면 비교와 리포트로 이어집니다.")
      : runStatusReviewRequired
        ? (nextStepDescription ?? "현재 환경에서는 최근 저장 실행과 현재 프로필의 일치 여부를 자동 확인하지 못했습니다. 아래 실행 내역에서 진행 상태를 다시 확인해 주세요.")
        : profileSyncState === "unknown"
        ? (nextStepDescription ?? "프로필 목록을 새로고침한 뒤 저장 상태를 다시 확인해 주세요.")
        : profileSyncState === "dirty"
          ? (nextStepDescription ?? "현재 편집값은 아직 저장 전이라 1단계를 완료로 보지 않습니다. 아래 저장 버튼으로 반영한 뒤 첫 실행으로 이어가세요.")
          : profileSavedAfterApply
            ? (nextStepDescription ?? "아래 첫 실행 시작 버튼으로 요약, 액션, 경고를 한 번에 계산합니다.")
            : (nextStepDescription ?? "아래 프로필 영역의 새로 만들기를 눌러 저장을 마치면 첫 실행 시작이 바로 열립니다.");
  const restoredFollowthroughVisible = !appliedPreview
    && !previewOpen
    && (profileSyncState === "saved" || profileSyncState === "dirty" || profileSyncState === "unknown" || runDone || saveDone);
  const restoredCompletedSummary = saveDone
    ? "프로필 저장 완료 · 첫 실행 완료"
    : runStatusReviewRequired
      ? "프로필 저장 완료 · 실행 상태 확인 필요"
      : profileSyncState === "dirty"
      ? "선택한 프로필 있음 · 미저장 변경 있음"
      : profileSyncState === "unknown"
        ? "저장 상태 다시 확인"
        : "프로필 저장 완료";
  const restoredNextStepSummary = nextStepLabel
    ?? (saveDone
      ? "리포트 보기"
      : runDone
        ? "결과 저장"
        : runStatusReviewRequired
          ? "진행 상태 다시 확인"
          : profileSyncState === "dirty"
          ? "프로필 저장"
          : profileSyncState === "unknown"
            ? "진행 상태 다시 확인"
            : "첫 실행 시작");
  const restoredTitle = saveDone
    ? "현재 워크스페이스 상태 기준으로 첫 실행까지 이어진 상태입니다."
    : runDone
      ? "현재 워크스페이스 상태 기준으로 첫 실행이 확인됐습니다."
      : runStatusReviewRequired
        ? "최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
        : profileSyncState === "dirty"
        ? "선택한 프로필에 미저장 변경이 있습니다. 먼저 저장을 확인해 주세요."
        : profileSyncState === "unknown"
          ? "저장 상태를 아직 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
          : "현재 워크스페이스 상태 기준으로 프로필 저장이 확인됐습니다.";
  const restoredDescription = saveDone
    ? (nextStepDescription ?? "아래 리포트 버튼으로 결과와 비교 화면을 이어서 볼 수 있습니다.")
    : runDone
      ? (nextStepDescription ?? "아래 결과 저장 또는 리포트 단계로 이어가기 전에 현재 상태를 한 번 더 확인해 주세요.")
      : runStatusReviewRequired
        ? (nextStepDescription ?? "현재 환경에서는 최근 저장 실행과 현재 프로필의 일치 여부를 자동 확인하지 못했습니다. 아래 실행 내역에서 진행 상태를 다시 확인해 주세요.")
        : profileSyncState === "dirty"
        ? (nextStepDescription ?? "현재 편집값은 아직 저장 전이라 1단계를 완료로 보지 않습니다. 아래 저장 버튼으로 반영한 뒤 첫 실행으로 이어가세요.")
        : profileSyncState === "unknown"
          ? (nextStepDescription ?? "프로필 목록을 새로고침한 뒤 저장 상태를 다시 확인해 주세요.")
          : (nextStepDescription ?? "새로고침 뒤에는 간단 시작 적용 여부를 완전히 복원할 수 없어도, 실제 저장 상태를 기준으로 다음 단계 안내를 이어서 보여줍니다.");

  return (
    <Card className="mb-6 border border-sky-200 bg-gradient-to-br from-sky-50 to-white" data-testid="planning-quickstart-gate">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">간단 시작</p>
            <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950">
              월 수입, 고정지출, 목표 1개만 넣고 첫 초안을 시작합니다.
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              먼저 초안을 미리 보고 수락하면, 선택지출·자산·부채는 기본값으로 시작하고 아래 워크스페이스에서 바로 수정할 수 있습니다.
            </p>
          </div>
          {previewOpen ? (
            <Button disabled={disabled} onClick={() => setPreviewOpen(false)} variant="outline">
              다시 입력
            </Button>
          ) : (
            <Button data-testid="planning-quickstart-open-preview" disabled={disabled || !ready} onClick={openPreview} variant="primary">
              초안 미리보기
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700">
            월 실수령액(원)
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.monthlyIncomeNet)}
              onChange={(event) => updateField("monthlyIncomeNet", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            월 고정지출(원)
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.fixedExpense)}
              onChange={(event) => updateField("fixedExpense", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            목표 이름
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              placeholder="예: 비상금 1,000만 원"
              value={draft.goalName ?? ""}
              onChange={(event) => updateField("goalName", event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            목표 금액(원)
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.goalTargetAmount)}
              onChange={(event) => updateField("goalTargetAmount", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            목표까지 남은 개월
            <input
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              inputMode="numeric"
              type="number"
              min={1}
              value={draft.goalTargetMonth ?? ""}
              onChange={(event) => updateField("goalTargetMonth", toNumber(event.target.value))}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">선택지출 0원으로 시작</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">현금성·투자자산 기본값 적용</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">부채가 없으면 빈 상태로 시작</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">적용 후 아래에서 바로 수정 가능</span>
        </div>

        {appliedPreview && !previewOpen ? (
          <div
            className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5"
            data-testid="planning-quickstart-applied-state"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">간단 시작 후속 안내</p>
                <h3 className="text-base font-black text-slate-950">{appliedTitle}</h3>
                <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${quickRuleToneClassName(appliedPreview.quickRuleStatus)}`}>
                  quick rules · {appliedPreview.quickRuleStatus.label}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">완료 상태</p>
                    <p
                      className="mt-1 text-sm font-black text-slate-950"
                      data-testid="planning-quickstart-followthrough-summary"
                    >
                      {appliedCompletedSummary}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">다음 단계</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{appliedNextStepSummary}</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-700">{appliedPreview.quickRuleStatus.detail}</p>
                <p className="text-sm leading-6 text-slate-700">{appliedDescription}</p>
              </div>
              {nextStepLabel && nextStepTargetId ? (
                <Button data-testid="planning-quickstart-next-step" disabled={disabled} onClick={focusNextStep} variant="primary">
                  {nextStepLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {restoredFollowthroughVisible ? (
          <div
            className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5"
            data-testid="planning-quickstart-restored-state"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">현재 상태 기준 후속 안내</p>
                <h3 className="text-base font-black text-slate-950">{restoredTitle}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">완료 상태</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{restoredCompletedSummary}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">다음 단계</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{restoredNextStepSummary}</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-700">{restoredDescription}</p>
              </div>
              {nextStepLabel && nextStepTargetId ? (
                <Button data-testid="planning-quickstart-next-step" disabled={disabled} onClick={focusNextStep} variant="primary">
                  {nextStepLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {previewOpen && preview ? (
          <div
            data-testid="planning-quickstart-preview"
            className="rounded-2xl border border-emerald-200 bg-white/90 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">적용 전 미리보기</p>
                <h3 className="mt-2 text-base font-black text-slate-950">이 초안으로 시작하면 아래 값이 먼저 채워집니다.</h3>
              </div>
              <Button data-testid="planning-quickstart-apply" disabled={disabled} onClick={applyQuickStart} variant="primary">
                이 초안으로 시작
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">월 잉여금 예상</p>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{formatSignedAmount(preview.monthlySurplus)}</p>
                <p className="mt-2 text-xs leading-6 text-slate-600">고정지출 반영 뒤 선택지출 0원 기준으로 먼저 계산합니다.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">목표 월 적립 기준</p>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{formatSignedAmount(preview.targetMonthlyContribution)}</p>
                <p className="mt-2 text-xs leading-6 text-slate-600">{preview.goalName} 목표를 {preview.goalTargetMonth}개월 안에 보는 단순 기준입니다.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">기본 적용 범위</p>
                <p className="mt-3 text-sm font-bold text-slate-950">선택지출·자산·부채는 기본값으로 시작</p>
                <p className="mt-2 text-xs leading-6 text-slate-600">적용 직후에도 워크스페이스 아래에서 값을 다시 바꿀 수 있습니다.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
              {renderPreviewSummary(preview).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-black ${quickRuleToneClassName(preview.quickRuleStatus)}`}>
              quick rules · {preview.quickRuleStatus.label}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{preview.quickRuleStatus.detail}</p>

            {preview.caution ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {preview.caution}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-600">
              {preview.defaultNotes.map((note) => (
                <span key={note} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  {note}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
