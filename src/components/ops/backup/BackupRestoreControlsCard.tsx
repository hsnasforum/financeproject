import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatBytes } from "./contracts";

type BackupRestoreControlsCardProps = {
  canUpload: boolean;
  file: File | null;
  hasCsrf: boolean;
  isSettingsSurface: boolean;
  mode: "merge" | "replace";
  passphrase: string;
  previewIncludesPlanningV3: boolean;
  previewToken: string;
  previewing: boolean;
  restoring: boolean;
  selectedName: string;
  selectedSize: number;
  onFileChange: (file: File | null) => void;
  onModeChange: (mode: "merge" | "replace") => void;
  onPassphraseChange: (value: string) => void;
  onPreview: () => void;
  onRestore: () => void;
};

export function BackupRestoreControlsCard({
  canUpload,
  file,
  hasCsrf,
  isSettingsSurface,
  mode,
  passphrase,
  previewIncludesPlanningV3,
  previewToken,
  previewing,
  restoring,
  selectedName,
  selectedSize,
  onFileChange,
  onModeChange,
  onPassphraseChange,
  onPreview,
  onRestore,
}: BackupRestoreControlsCardProps) {
  return (
    <Card>
      <h2 className="text-base font-black text-navy">2) 백업 파일 확인 및 복원</h2>
      <p className="mt-2 text-sm text-slate-600">
        {isSettingsSurface
          ? "암호화 백업 파일과 암호를 선택한 뒤 미리보기로 내용을 확인하고 복원하세요."
          : "암호화 백업 파일과 암호를 선택하고 내용을 확인한 뒤, 기존 기록 유지 또는 교체 방식으로 복원하세요."}
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-700" htmlFor="ops-backup-passphrase-import">복구 암호</label>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          id="ops-backup-passphrase-import"
          onChange={(event) => onPassphraseChange(event.target.value)}
          placeholder="복구 암호 입력"
          type="password"
          value={passphrase}
        />
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-surface-muted">
          백업 파일 선택
          <input
            accept=".json,.enc,application/json,application/octet-stream"
            className="hidden"
            data-testid="ops-backup-file-input"
            disabled={!canUpload}
            onChange={(event) => {
              onFileChange(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
        <p className="text-xs text-slate-600">선택 파일: {selectedName || "-"} {selectedName ? `(${formatBytes(selectedSize)})` : ""}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="ops-backup-preview-button"
            disabled={!file || !canUpload || passphrase.trim().length < 1}
            onClick={onPreview}
            size="sm"
            type="button"
            variant="outline"
          >
            {previewing ? "미리보기 확인 중..." : "미리보기 확인"}
          </Button>
          <label className="text-xs text-slate-700">
            복원 방식
            <select
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
              data-testid="ops-backup-restore-mode"
              disabled={restoring || previewing || !file}
              onChange={(event) => onModeChange(event.target.value === "replace" ? "replace" : "merge")}
              value={mode}
            >
              <option value="merge">{isSettingsSurface ? "기존 기록 유지하며 합치기 (상세 데이터 제외)" : "기존 기록 유지하며 합치기"}</option>
              <option value="replace">
                {!isSettingsSurface
                  ? "백업 시점 기록으로 교체"
                  : previewIncludesPlanningV3
                    ? "백업 시점의 전체 사용자 데이터로 교체"
                    : "백업 파일에 포함된 기록으로 교체"}
              </option>
            </select>
          </label>
          <Button
            data-testid="ops-backup-restore-button"
            disabled={!file || !previewToken || restoring || previewing || !hasCsrf || passphrase.trim().length < 1}
            onClick={onRestore}
            size="sm"
            type="button"
            variant="primary"
          >
            {restoring ? "복원 중..." : "복원 실행"}
          </Button>
        </div>
        {isSettingsSurface && previewIncludesPlanningV3 ? (
          <p className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${mode === "replace"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {mode === "replace"
              ? "상세 계좌·거래·분류 데이터까지 백업 시점 상태로 교체 복원합니다."
              : "기존 기록 유지 방식에서는 현재 상세 데이터 변경을 보호하기 위해 계좌·거래·분류 데이터를 복원하지 않습니다. 전체 복원이 필요하면 백업 시점으로 교체를 선택하세요."}
          </p>
        ) : null}
        {isSettingsSurface && previewToken && !previewIncludesPlanningV3 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {mode === "replace"
              ? "이 백업에는 상세 계좌·거래·분류 데이터가 없습니다. 교체해도 상세 데이터는 바뀌지 않고, 백업에 담긴 프로필·실행 기록만 교체합니다."
              : "이 백업에는 상세 계좌·거래·분류 데이터가 없어 복원되지 않습니다."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
