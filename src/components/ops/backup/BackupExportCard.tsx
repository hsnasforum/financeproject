import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PendingExportConfirmation } from "./contracts";

type BackupExportCardProps = {
  exportGzip: boolean;
  exportMode: "full" | "delta";
  exporting: boolean;
  finalizingExport: boolean;
  hasCsrf: boolean;
  isSettingsSurface: boolean;
  passphrase: string;
  pendingExportConfirmation: PendingExportConfirmation | null;
  previewing: boolean;
  restoring: boolean;
  savedFileConfirmationLabel: string;
  onExport: () => void;
  onExportGzipChange: (checked: boolean) => void;
  onExportModeChange: (mode: "full" | "delta") => void;
  onFinalizeExport: () => void;
  onPassphraseChange: (value: string) => void;
};

export function BackupExportCard({
  exportGzip,
  exportMode,
  exporting,
  finalizingExport,
  hasCsrf,
  isSettingsSurface,
  passphrase,
  pendingExportConfirmation,
  previewing,
  restoring,
  savedFileConfirmationLabel,
  onExport,
  onExportGzipChange,
  onExportModeChange,
  onFinalizeExport,
  onPassphraseChange,
}: BackupExportCardProps) {
  return (
    <Card>
      <h2 className="text-base font-black text-navy">{isSettingsSurface ? "1) 내 재무설계 데이터 백업" : "1) 백업 파일 만들기"}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {isSettingsSurface
          ? "프로필, 실행 결과, 후속 행동 기록과 상세 계좌·거래·분류 데이터를 암호화 파일로 내려받습니다."
          : "프로필, 실행 결과, 가정 기록과 후속 행동 상태를 암호화 백업 파일로 내려받습니다."}
      </p>
      <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="ops-backup-passphrase-export">백업 암호</label>
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        id="ops-backup-passphrase-export"
        onChange={(event) => onPassphraseChange(event.target.value)}
        placeholder="백업 암호 입력"
        type="password"
        value={passphrase}
      />
      {!isSettingsSurface ? (
        <>
          <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="ops-backup-export-mode">백업 범위</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            id="ops-backup-export-mode"
            onChange={(event) => onExportModeChange(event.target.value === "delta" ? "delta" : "full")}
            value={exportMode}
          >
            <option value="full">전체 백업</option>
            <option value="delta">변경분 백업 (마지막 저장 확인 이후)</option>
          </select>
        </>
      ) : null}
      <div className="mt-4">
        {!isSettingsSurface ? (
          <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              checked={exportGzip}
              onChange={(event) => onExportGzipChange(event.target.checked)}
              type="checkbox"
            />
            압축 전송 사용(gzip, 대용량 백업 권장)
          </label>
        ) : null}
        <Button
          data-testid="ops-backup-export-button"
          disabled={!hasCsrf || exporting || finalizingExport || previewing || restoring || passphrase.trim().length < 1}
          onClick={onExport}
          size="sm"
          type="button"
          variant="primary"
        >
          {exporting ? "백업 파일 생성 중..." : "암호화 백업 다운로드"}
        </Button>
        {pendingExportConfirmation ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950">
            <p>
              다운로드 폴더에서 <strong>{pendingExportConfirmation.fileName}</strong> 파일이 저장되었는지 확인해 주세요.
              확인 전에는 다음 변경분 백업 기준을 옮기지 않아 같은 내용이 다시 포함될 수 있습니다.
            </p>
            <Button
              className="mt-3"
              disabled={finalizingExport || exporting}
              onClick={onFinalizeExport}
              size="sm"
              type="button"
              variant="outline"
            >
              {finalizingExport ? "저장 확인 반영 중..." : savedFileConfirmationLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
