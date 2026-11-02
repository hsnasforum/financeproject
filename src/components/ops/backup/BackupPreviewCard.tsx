import { Card } from "@/components/ui/Card";
import type { BackupPreviewPayload } from "./contracts";
import { formatDateTime } from "./contracts";

type BackupPreviewCardProps = {
  preview: NonNullable<BackupPreviewPayload["data"]>;
  summaryRows: string[];
  warnings: string[];
};

export function BackupPreviewCard({ preview, summaryRows, warnings }: BackupPreviewCardProps) {
  const profileIds = preview.ids?.profileIds ?? [];
  const runIds = preview.ids?.runIds ?? [];
  const snapshotIds = preview.ids?.snapshotIds ?? [];
  const identifierCount = profileIds.length + runIds.length + snapshotIds.length;

  return (
    <Card className="mt-6" data-testid="ops-backup-preview-card">
      <h3 className="text-base font-black text-navy">백업 내용 미리보기</h3>
      <p className="mt-2 text-xs text-slate-600">
        백업 방식: {preview.manifest?.mode === "delta" ? "변경분" : "전체"} · 생성 시각: {formatDateTime(preview.manifest?.createdAt)} · 파일 형식: v{preview.manifest?.formatVersion ?? "-"} · 앱 버전: {preview.manifest?.appVersion ?? "-"}
      </p>
      {preview.manifest?.mode === "delta" ? (
        <p className="mt-1 text-xs text-slate-600">
          같은 실행 또는 스냅샷 식별자가 이미 있으면 기존 기록을 유지하고 중복 항목을 건너뜁니다.
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        {summaryRows.map((row) => (
          <li className="rounded-md border border-slate-200 bg-surface-muted px-2 py-1" key={row}>{row}</li>
        ))}
      </ul>
      <details className="mt-4 rounded-lg border border-slate-200 bg-surface-muted/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
          포함된 기록 식별자 보기 ({identifierCount.toLocaleString("ko-KR")}개)
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {[
            { label: "프로필", values: profileIds },
            { label: "실행 기록", values: runIds },
            { label: "스냅샷", values: snapshotIds },
          ].map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-slate-800">{group.label}</p>
              <div className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                {group.values.length < 1 ? "없음" : group.values.join("\n")}
              </div>
            </div>
          ))}
        </div>
      </details>
      {warnings.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-amber-800">주의 사항</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
