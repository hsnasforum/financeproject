import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { Button } from "@/components/ui/Button";

type BackupRestoreConfirmDialogProps = {
  isSettingsSurface: boolean;
  mode: "merge" | "replace";
  restoring: boolean;
  selectedName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function BackupRestoreConfirmDialog({
  isSettingsSurface,
  mode,
  restoring,
  selectedName,
  onClose,
  onConfirm,
}: BackupRestoreConfirmDialogProps) {
  return (
    <AccessibleDialog
      labelledBy="ops-backup-restore-confirm-title"
      onClose={onClose}
      closeOnOverlay={false}
      overlayClassName="bg-slate-900/45 px-4 py-8"
      panelClassName="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <h3 id="ops-backup-restore-confirm-title" className="text-base font-black text-navy">복원 실행 확인</h3>
      <p className="mt-2 text-sm text-slate-700">
        {mode === "replace"
          ? (isSettingsSurface
            ? "현재 사용자의 프로필·실행 기록과 상세 계좌·거래·분류 데이터를 백업 시점 상태로 교체합니다. 미리보기의 파일과 개수를 확인하셨나요?"
            : "현재 기록을 백업 시점 기록으로 교체합니다. 계속 진행할까요?")
          : (isSettingsSurface
            ? "기존 프로필과 실행 기록을 유지하며 합칩니다. 상세 계좌·거래·분류 데이터는 현재 변경을 보호하기 위해 적용하지 않습니다. 계속할까요?"
            : "기존 기록을 유지하며 백업 내용을 합칩니다. 계속 진행할까요?")}
      </p>
      <div className="mt-2 rounded-md border border-slate-200 bg-surface-muted px-2 py-1 text-xs text-slate-700">
        복원 방식: <span className="font-semibold">{mode === "replace" ? "백업 시점으로 교체" : "기존 기록 유지"}</span> / 파일: <span className="font-semibold">{selectedName || "-"}</span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClose}
          disabled={restoring}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={restoring}
          onClick={onConfirm}
        >
          복원 시작
        </Button>
      </div>
    </AccessibleDialog>
  );
}
