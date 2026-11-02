import { Card } from "@/components/ui/Card";
import type { BackupRestorePayload } from "./contracts";

type RestoreData = NonNullable<BackupRestorePayload["data"]>;

type BackupRestoreResultCardProps = {
  issues: NonNullable<RestoreData["issues"]>;
  normalizationProfiles: NonNullable<NonNullable<RestoreData["normalization"]>["profiles"]>;
  restoreResult: RestoreData;
  warnings: string[];
};

export function BackupRestoreResultCard({
  issues,
  normalizationProfiles,
  restoreResult,
  warnings,
}: BackupRestoreResultCardProps) {
  const importedRows = [
    ["프로필", restoreResult.imported?.profiles ?? 0],
    ["실행 기록", restoreResult.imported?.runs ?? 0],
    ["실행 결과 파일", restoreResult.imported?.runBlobs ?? 0],
    ["실행 계획", restoreResult.imported?.actionPlans ?? 0],
    ["실행 진행 상태", restoreResult.imported?.actionProgress ?? 0],
    ["가정값 이력", restoreResult.imported?.assumptionsHistory ?? 0],
    ["정책", restoreResult.imported?.policies ?? 0],
    ["상세 계좌·거래·분류 파일", restoreResult.imported?.planningV3Files ?? 0],
  ] as const;

  return (
    <Card className="mt-6" data-testid="ops-backup-restore-card">
      <h3 className="text-base font-black text-navy">복원 결과</h3>
      <p className="mt-2 text-xs text-slate-600">
        복원 방식: {restoreResult.mode === "replace" ? "백업 시점으로 교체" : restoreResult.mode === "merge" ? "기존 기록 유지" : "확인되지 않음"}
      </p>
      <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        {importedRows.map(([label, count]) => (
          <li className="rounded-md border border-slate-200 bg-surface-muted px-2 py-1" key={label}>
            {label}: {count.toLocaleString("ko-KR")}개
          </li>
        ))}
        <li className="rounded-md border border-slate-200 bg-surface-muted px-2 py-1">
          최신 스냅샷: {restoreResult.imported?.latestSnapshot ? "포함" : "없음"}
        </li>
      </ul>
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
      {issues.length > 0 ? (
        <details className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-rose-700">확인이 필요한 항목 ({issues.length}개)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-rose-700">
            {issues.slice(0, 50).map((issue, index) => (
              <li key={`${issue.path ?? "-"}:${index}`}>
                [{issue.entity ?? "-"}] {issue.id ? `${issue.id} / ` : ""}{issue.path ?? "-"} - {issue.message ?? "-"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {normalizationProfiles.length > 0 ? (
        <details className="mt-4 rounded-lg border border-slate-200 bg-surface-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-800">자동 보정 내역 ({normalizationProfiles.length}개)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
            {normalizationProfiles.map((entry, index) => {
              const defaultsCount = entry.disclosure?.defaultsApplied?.length ?? 0;
              const fixesCount = entry.disclosure?.fixesApplied?.length ?? 0;
              return (
                <li key={`${entry.id ?? "profile"}:${index}`}>
                  {entry.id ?? "식별자 없음"}: 기본값 적용 {defaultsCount}건, 형식 보정 {fixesCount}건
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
