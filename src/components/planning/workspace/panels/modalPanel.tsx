import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";
import { Button } from "@/components/ui/Button";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import {
  BodyDialogSurface,
  bodyFieldClassName,
  bodyTextAreaClassName,
} from "@/components/ui/BodyTone";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import type { PlanningWorkspaceGroups } from "@/components/planning/workspace/groups";
import { cn } from "@/lib/utils";

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: PlanningFeedbackCategory; label: string }> = [
  { value: "bug", label: "버그" },
  { value: "ux", label: "사용성" },
  { value: "data", label: "데이터" },
  { value: "other", label: "기타" },
];

export function PlanningWorkspaceModalPanel({
  dialogs,
  actions,
}: {
  dialogs: PlanningWorkspaceGroups["dialogs"];
  actions: PlanningWorkspaceGroups["actions"];
}) {
  const {
    profileDeleteDialog,
    feedbackModalOpen,
    feedbackSubmitting,
    feedbackCategory,
    feedbackTitle,
    feedbackMessage,
    workspaceSnapshotState,
    savedRun,
    healthSummary,
    savingProfile,
  } = dialogs;
  const {
    setProfileDeleteDialog,
    submitDeleteProfileAction,
    setFeedbackCategory,
    setFeedbackTitle,
    setFeedbackMessage,
    setFeedbackModalOpen,
    submitPlanningFeedbackAction,
  } = actions;

  return (
    <>
      {profileDeleteDialog ? (
        <AccessibleDialog
          labelledBy="planning-profile-delete-title"
          onClose={() => {
            if (!savingProfile) setProfileDeleteDialog(null);
          }}
          closeOnOverlay={false}
          overlayClassName="bg-slate-900/45 px-4 py-8"
          panelClassName="w-full max-w-md"
        >
          <BodyDialogSurface className="max-w-md">
            <div id="planning-profile-delete-title"><SubSectionHeader title="프로필 삭제 확인" /></div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">아래 확인 문구를 정확히 입력해야 삭제가 진행됩니다.</p>
            <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 font-mono text-[10px] text-rose-600">{profileDeleteDialog.expectedConfirm}</div>
            <input
              className={cn(bodyFieldClassName, "mt-4 h-11 text-center font-bold")}
              value={profileDeleteDialog.confirmText}
              onChange={(event) => {
                const nextValue = event.target.value;
                setProfileDeleteDialog((prev) => (prev ? { ...prev, confirmText: nextValue } : prev));
              }}
              disabled={savingProfile}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xl px-6 font-bold"
                onClick={() => {
                  if (savingProfile) return;
                  setProfileDeleteDialog(null);
                }}
                disabled={savingProfile}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                className="h-10 rounded-xl px-6 font-bold"
                onClick={() => void submitDeleteProfileAction()}
                disabled={savingProfile || profileDeleteDialog.confirmText.trim() !== profileDeleteDialog.expectedConfirm}
              >
                {savingProfile ? "삭제 중..." : "삭제 진행"}
              </Button>
            </div>
          </BodyDialogSurface>
        </AccessibleDialog>
      ) : null}

      {feedbackModalOpen ? (
        <AccessibleDialog
          labelledBy="planning-feedback-title"
          onClose={() => {
            if (!feedbackSubmitting) setFeedbackModalOpen(false);
          }}
          closeOnOverlay={false}
          overlayClassName="bg-slate-900/45 px-4 py-8"
          panelClassName="w-full max-w-xl"
        >
          <BodyDialogSurface className="max-w-xl">
            <div id="planning-feedback-title"><SubSectionHeader title="피드백 보내기" /></div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">/planning 사용 중 발견한 불편한 점이나 버그를 알려주세요. 피드백은 브라우저 로컬 저장소에 안전하게 보관됩니다.</p>

            <div className="animate-in fade-in slide-in-from-bottom-2 mt-8 space-y-6 duration-300">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">분류</label>
                  <select
                    className={cn(bodyFieldClassName, "h-11 rounded-xl border-slate-200 font-bold")}
                    value={feedbackCategory}
                    onChange={(event) => setFeedbackCategory(event.target.value as PlanningFeedbackCategory)}
                    disabled={feedbackSubmitting}
                  >
                    {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">제목</label>
                  <input
                    className={cn(bodyFieldClassName, "h-11 rounded-xl border-slate-200 font-bold")}
                    placeholder="제목 (선택 사항)"
                    value={feedbackTitle}
                    onChange={(event) => setFeedbackTitle(event.target.value)}
                    maxLength={160}
                    disabled={feedbackSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">내용</label>
                <textarea
                  className={cn(bodyTextAreaClassName, "min-h-[160px] rounded-2xl")}
                  placeholder="구체적인 내용을 입력해 주세요 (재현 단계 등)."
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  maxLength={5000}
                  disabled={feedbackSubmitting}
                />
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-100 bg-surface-muted p-4 text-[11px] font-bold text-slate-500">
                <p className="flex justify-between"><span>snapshot:</span> <span className="text-navy">{workspaceSnapshotState.displayId || "-"}</span></p>
                <p className="flex justify-between"><span>runId:</span> <span className="text-navy">{savedRun?.id ?? "-"}</span></p>
                <p className="flex justify-between"><span>health:</span> <span className="text-navy">critical={healthSummary?.criticalCount ?? "-"}, warnings={healthSummary?.warningCodes?.length ?? 0}</span></p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xl px-6 font-bold"
                onClick={() => {
                  if (feedbackSubmitting) return;
                  setFeedbackModalOpen(false);
                }}
                disabled={feedbackSubmitting}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                className="h-10 rounded-xl px-6 font-bold"
                onClick={() => void submitPlanningFeedbackAction()}
                disabled={feedbackSubmitting || !feedbackMessage.trim()}
              >
                {feedbackSubmitting ? "저장 중..." : "저장"}
              </Button>
            </div>
          </BodyDialogSurface>
        </AccessibleDialog>
      ) : null}
    </>
  );
}
