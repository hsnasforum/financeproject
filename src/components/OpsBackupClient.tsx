"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type BackupPreviewPayload = {
  ok?: boolean;
  data?: {
    manifest?: {
      kind?: string;
      formatVersion?: number;
      mode?: "full" | "delta";
      createdAt?: string;
      appVersion?: string;
      conflictPolicy?: {
        runId?: string;
        snapshotId?: string;
      };
      counts?: Record<string, number>;
    };
    actual?: {
      totalFiles?: number;
      totalBytes?: number;
      profiles?: number;
      runs?: number;
      runBlobs?: number;
      actionPlans?: number;
      actionProgress?: number;
      assumptionsHistory?: number;
      policies?: number;
    };
    ids?: {
      profileIds?: string[];
      runIds?: string[];
      snapshotIds?: string[];
    };
    warnings?: string[];
  };
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
  message?: string;
};

type VaultStatusPayload = {
  ok?: boolean;
  csrfToken?: string;
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
};

type BackupRestorePayload = {
  ok?: boolean;
  data?: {
    mode?: "merge" | "replace";
    imported?: {
      profiles?: number;
      runs?: number;
      runBlobs?: number;
      actionPlans?: number;
      actionProgress?: number;
      assumptionsHistory?: number;
      latestSnapshot?: boolean;
      policies?: number;
    };
    issues?: Array<{
      entity?: string;
      id?: string;
      path?: string;
      message?: string;
    }>;
    warnings?: string[];
    normalization?: {
      profiles?: Array<{
        id?: string;
        disclosure?: {
          defaultsApplied?: string[];
          fixesApplied?: Array<{
            path?: string;
            from?: unknown;
            to?: unknown;
            message?: string;
          }>;
        };
      }>;
    };
  };
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
  message?: string;
};

type OpsApiError = {
  code?: string;
  message?: string;
  fixHref?: string;
};

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function OpsBackupClient() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportMode, setExportMode] = useState<"full" | "delta">("full");
  const [exportGzip, setExportGzip] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [csrf, setCsrf] = useState("");
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<BackupPreviewPayload["data"] | null>(null);
  const [restoreResult, setRestoreResult] = useState<BackupRestorePayload["data"] | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [errorFixHref, setErrorFixHref] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch("/api/ops/security/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
        if (!mounted) return;
        if (!response.ok || !payload?.ok) {
          const apiError = payload?.error;
          setErrorFixHref(typeof apiError?.fixHref === "string" ? apiError.fixHref : "");
          throw new Error(apiError?.message ?? "CSRF 토큰을 불러오지 못했습니다.");
        }
        setCsrf(typeof payload.csrfToken === "string" ? payload.csrfToken : "");
        setErrorFixHref("");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "CSRF 토큰을 불러오지 못했습니다.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const hasCsrf = csrf.trim().length > 0;
  const canUpload = hasCsrf && !previewing && !restoring && !exporting;
  const selectedName = file?.name ?? "";
  const selectedSize = file?.size ?? 0;
  const previewWarnings = preview?.warnings ?? [];
  const restoreWarnings = restoreResult?.warnings ?? [];
  const restoreIssues = restoreResult?.issues ?? [];
  const restoreNormalizationProfiles = restoreResult?.normalization?.profiles ?? [];

  const summaryRows = useMemo(() => {
    const actual = preview?.actual;
    if (!actual) return [];
    return [
      `profiles: ${actual.profiles ?? 0}`,
      `runs: ${actual.runs ?? 0}`,
      `runBlobs: ${actual.runBlobs ?? 0}`,
      `actionPlans: ${actual.actionPlans ?? 0}`,
      `actionProgress: ${actual.actionProgress ?? 0}`,
      `assumptionsHistory: ${actual.assumptionsHistory ?? 0}`,
      `policies: ${actual.policies ?? 0}`,
      `totalFiles: ${actual.totalFiles ?? 0}`,
      `totalBytes: ${formatBytes(actual.totalBytes)}`,
    ];
  }, [preview]);

  async function handleExport(): Promise<void> {
    if (!hasCsrf) {
      setError("CSRF 토큰이 없어 export를 실행할 수 없습니다.");
      return;
    }
    setExporting(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    try {
      const response = await fetch("/api/ops/backup/export", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf, passphrase, mode: exportMode, gzip: exportGzip }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: OpsApiError } | null;
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(payload?.error?.message ?? "export에 실패했습니다.");
      }
      const blob = await response.blob();
      const fallbackName = `planning-data-vault-${Date.now()}.enc.json`;
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileNameMatch = /filename="?([^";]+)"?/i.exec(disposition);
      const fileName = fileNameMatch?.[1]?.trim() || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setNotice(`암호화 ${exportMode === "delta" ? "Delta" : "Full"} 백업 파일을 다운로드했습니다. (${fileName})`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "export에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!file) {
      setError("먼저 zip 파일을 선택해 주세요.");
      return;
    }
    if (!hasCsrf) {
      setError("CSRF 토큰이 없어 preview를 실행할 수 없습니다.");
      return;
    }
    setPreviewing(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    setRestoreResult(null);
    try {
      const formData = new FormData();
      formData.set("csrf", csrf);
      formData.set("passphrase", passphrase);
      formData.set("file", file);
      const response = await fetch("/api/ops/backup/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as BackupPreviewPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(payload?.error?.message ?? "preview에 실패했습니다.");
      }
      setPreview(payload.data);
      setNotice("preview 완료: 구조와 개수를 확인했습니다.");
    } catch (previewError) {
      setPreview(null);
      setError(previewError instanceof Error ? previewError.message : "preview에 실패했습니다.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleRestore(): Promise<void> {
    if (!file) {
      setError("먼저 zip 파일을 선택해 주세요.");
      return;
    }
    if (!hasCsrf) {
      setError("CSRF 토큰이 없어 restore를 실행할 수 없습니다.");
      return;
    }

    const confirmText = mode === "replace"
      ? "replace 모드는 기존 데이터를 삭제 후 복원합니다. 계속 진행할까요?"
      : "merge 모드로 복원할까요?";
    if (!window.confirm(confirmText)) return;

    setRestoring(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    setRestoreResult(null);
    try {
      const formData = new FormData();
      formData.set("csrf", csrf);
      formData.set("mode", mode);
      formData.set("passphrase", passphrase);
      formData.set("file", file);
      const response = await fetch("/api/ops/backup/restore", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as BackupRestorePayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(payload?.error?.message ?? "restore에 실패했습니다.");
      }
      setRestoreResult(payload.data);
      setNotice(payload.message ?? "restore를 완료했습니다.");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "restore에 실패했습니다.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops Backup Vault"
        description="로컬 planning 데이터를 암호화 백업(export/import) 합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button size="sm" variant="outline" type="button">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? (
        <ErrorState
          className="mb-4"
          message="Vault CSRF 토큰이 없어 실행할 수 없습니다."
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-black text-slate-900">1) Export</h2>
          <p className="mt-2 text-sm text-slate-600">
            profile/run(meta+blobs+index)/assumptions/action-progress를 암호화 아카이브로 내보냅니다.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="ops-backup-passphrase-export">백업 암호</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            id="ops-backup-passphrase-export"
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="백업 암호 입력"
            type="password"
            value={passphrase}
          />
          <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="ops-backup-export-mode">Export 모드</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            id="ops-backup-export-mode"
            onChange={(event) => setExportMode(event.target.value === "delta" ? "delta" : "full")}
            value={exportMode}
          >
            <option value="full">full (전체 백업)</option>
            <option value="delta">delta (마지막 export 이후 변경분)</option>
          </select>
          <div className="mt-4">
            <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                checked={exportGzip}
                onChange={(event) => setExportGzip(event.target.checked)}
                type="checkbox"
              />
              gzip 전송 사용(대용량 백업 권장)
            </label>
            <Button
              data-testid="ops-backup-export-button"
              disabled={!hasCsrf || exporting || previewing || restoring || passphrase.trim().length < 1}
              onClick={() => void handleExport()}
              size="sm"
              type="button"
              variant="primary"
            >
              {exporting ? "Export 중..." : "암호화 백업 다운로드"}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-black text-slate-900">2) Import Preview / Restore</h2>
          <p className="mt-2 text-sm text-slate-600">
            암호화 백업 파일 업로드 후 preview를 확인하고 merge/replace 모드로 복원하세요.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="ops-backup-passphrase-import">복구 암호</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              id="ops-backup-passphrase-import"
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="복구 암호 입력"
              type="password"
              value={passphrase}
            />
            <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              백업 파일 선택
              <input
                accept=".json,.enc,application/json,application/octet-stream"
                className="hidden"
                data-testid="ops-backup-file-input"
                disabled={!canUpload}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setPreview(null);
                  setRestoreResult(null);
                  setNotice("");
                  setError("");
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
                onClick={() => void handlePreview()}
                size="sm"
                type="button"
                variant="outline"
              >
                {previewing ? "Preview 중..." : "Preview"}
              </Button>
              <label className="text-xs text-slate-700">
                Restore mode
                <select
                  className="ml-2 rounded-md border border-slate-300 px-2 py-1"
                  data-testid="ops-backup-restore-mode"
                  disabled={restoring || previewing || !file}
                  onChange={(event) => {
                    setMode(event.target.value === "replace" ? "replace" : "merge");
                  }}
                  value={mode}
                >
                  <option value="merge">merge (default)</option>
                  <option value="replace">replace (위험)</option>
                </select>
              </label>
              <Button
                data-testid="ops-backup-restore-button"
                disabled={!file || restoring || previewing || !hasCsrf || passphrase.trim().length < 1}
                onClick={() => void handleRestore()}
                size="sm"
                type="button"
                variant="primary"
              >
                {restoring ? "Restore 중..." : "Restore 실행"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {previewing || restoring ? (
        <LoadingState className="mt-6" title={previewing ? "preview를 생성하는 중입니다" : "restore를 적용하는 중입니다"} />
      ) : null}

      {notice ? <p className="mt-6 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      {error ? (
        <p className="mt-2 text-sm font-semibold text-rose-700">
          {error}
          {errorFixHref ? (
            <>
              {" "}
              <Link className="underline" href={errorFixHref}>{errorFixHref}</Link>
            </>
          ) : null}
        </p>
      ) : null}

      {preview ? (
        <Card className="mt-6" data-testid="ops-backup-preview-card">
          <h3 className="text-base font-black text-slate-900">Preview 결과</h3>
          <p className="mt-2 text-xs text-slate-600">
            kind={preview.manifest?.kind ?? "-"} · mode={preview.manifest?.mode ?? "full"} · formatVersion={preview.manifest?.formatVersion ?? "-"} · appVersion={preview.manifest?.appVersion ?? "-"} · createdAt={formatDateTime(preview.manifest?.createdAt)}
          </p>
          {preview.manifest?.mode === "delta" ? (
            <p className="mt-1 text-xs text-slate-600">
              충돌 정책: runId={preview.manifest?.conflictPolicy?.runId ?? "skip"}, snapshotId={preview.manifest?.conflictPolicy?.snapshotId ?? "skip"}
            </p>
          ) : null}
          <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
            {summaryRows.map((row) => (
              <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1" key={row}>{row}</li>
            ))}
          </ul>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-800">profileIds</p>
              <div className="mt-1 max-h-36 overflow-auto rounded-md border border-slate-200 p-2 text-[11px] text-slate-700">
                {(preview.ids?.profileIds ?? []).length < 1 ? "-" : (preview.ids?.profileIds ?? []).join("\n")}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">runIds</p>
              <div className="mt-1 max-h-36 overflow-auto rounded-md border border-slate-200 p-2 text-[11px] text-slate-700">
                {(preview.ids?.runIds ?? []).length < 1 ? "-" : (preview.ids?.runIds ?? []).join("\n")}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">snapshotIds</p>
              <div className="mt-1 max-h-36 overflow-auto rounded-md border border-slate-200 p-2 text-[11px] text-slate-700">
                {(preview.ids?.snapshotIds ?? []).length < 1 ? "-" : (preview.ids?.snapshotIds ?? []).join("\n")}
              </div>
            </div>
          </div>
          {previewWarnings.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-amber-800">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                {previewWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {restoreResult ? (
        <Card className="mt-6" data-testid="ops-backup-restore-card">
          <h3 className="text-base font-black text-slate-900">Restore 결과</h3>
          <p className="mt-2 text-xs text-slate-600">mode: {restoreResult.mode ?? "-"}</p>
          <ul className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">profiles: {restoreResult.imported?.profiles ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">runs: {restoreResult.imported?.runs ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">runBlobs: {restoreResult.imported?.runBlobs ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">actionPlans: {restoreResult.imported?.actionPlans ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">actionProgress: {restoreResult.imported?.actionProgress ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">assumptionsHistory: {restoreResult.imported?.assumptionsHistory ?? 0}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">latestSnapshot: {restoreResult.imported?.latestSnapshot ? "yes" : "no"}</li>
            <li className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">policies: {restoreResult.imported?.policies ?? 0}</li>
          </ul>
          {restoreWarnings.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-amber-800">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                {restoreWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {restoreIssues.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-rose-700">Issues ({restoreIssues.length})</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-rose-700">
                {restoreIssues.slice(0, 50).map((issue, index) => (
                  <li key={`${issue.path ?? "-"}:${index}`}>
                    [{issue.entity ?? "-"}] {issue.id ? `${issue.id} / ` : ""}{issue.path ?? "-"} - {issue.message ?? "-"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {restoreNormalizationProfiles.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-800">Normalization disclosures ({restoreNormalizationProfiles.length})</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-700">
                {restoreNormalizationProfiles.map((entry, index) => {
                  const defaultsCount = entry.disclosure?.defaultsApplied?.length ?? 0;
                  const fixesCount = entry.disclosure?.fixesApplied?.length ?? 0;
                  return (
                    <li key={`${entry.id ?? "profile"}:${index}`}>
                      {entry.id ?? "-"}: defaultsApplied {defaultsCount}, fixesApplied {fixesCount}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </PageShell>
  );
}
