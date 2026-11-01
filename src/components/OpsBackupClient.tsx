"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BackupExportCard } from "@/components/ops/backup/BackupExportCard";
import { BackupPreviewCard } from "@/components/ops/backup/BackupPreviewCard";
import { BackupRestoreConfirmDialog } from "@/components/ops/backup/BackupRestoreConfirmDialog";
import { BackupRestoreControlsCard } from "@/components/ops/backup/BackupRestoreControlsCard";
import { BackupRestoreResultCard } from "@/components/ops/backup/BackupRestoreResultCard";
import {
  formatBytes,
  getOpsApiErrorCode,
  toBackupActionError,
  type BackupExportFinalizePayload,
  type BackupPreviewPayload,
  type BackupRestorePayload,
  type OpsApiErrorPayload,
  type PendingExportConfirmation,
  type VaultStatusPayload,
} from "@/components/ops/backup/contracts";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

const SAVED_FILE_CONFIRMATION_LABEL = "파일 저장을 확인했습니다";

type OpsBackupClientProps = {
  surface?: "ops" | "settings";
  afterContent?: ReactNode;
};

export function OpsBackupClient({ surface = "ops", afterContent }: OpsBackupClientProps = {}) {
  const isSettingsSurface = surface === "settings";
  const backupApiBase = isSettingsSurface ? "/api/settings/backup" : "/api/ops/backup";
  const securityStatusPath = isSettingsSurface ? "/api/settings/backup/status" : "/api/ops/security/status";
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportMode, setExportMode] = useState<"full" | "delta">("full");
  const [exportGzip, setExportGzip] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [csrf, setCsrf] = useState("");
  const [exporting, setExporting] = useState(false);
  const [finalizingExport, setFinalizingExport] = useState(false);
  const [pendingExportConfirmation, setPendingExportConfirmation] = useState<PendingExportConfirmation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<BackupPreviewPayload["data"] | null>(null);
  const [previewToken, setPreviewToken] = useState("");
  const [restoreResult, setRestoreResult] = useState<BackupRestorePayload["data"] | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [errorFixHref, setErrorFixHref] = useState("");
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch(securityStatusPath, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
        if (!mounted) return;
        if (!response.ok || !payload?.ok) {
          const apiError = payload?.error;
          setErrorFixHref(typeof apiError?.fixHref === "string" ? apiError.fixHref : "");
          throw new Error(apiError?.message ?? "보안 확인 정보를 불러오지 못했습니다.");
        }
        setCsrf(typeof payload.csrfToken === "string" ? payload.csrfToken : "");
        setErrorFixHref("");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "보안 확인 정보를 불러오지 못했습니다.");
      }
    })();
    return () => { mounted = false; };
  }, [securityStatusPath]);

  async function refreshCsrfToken(): Promise<string> {
    const response = await fetch(securityStatusPath, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
    if (!response.ok || !payload?.ok) {
      const apiError = payload?.error;
      setErrorFixHref(typeof apiError?.fixHref === "string" ? apiError.fixHref : "");
      throw new Error(apiError?.message ?? "보안 확인 정보를 다시 불러오지 못했습니다.");
    }
    const nextToken = typeof payload.csrfToken === "string" ? payload.csrfToken : "";
    setCsrf(nextToken);
    setErrorFixHref("");
    return nextToken;
  }

  const hasCsrf = csrf.trim().length > 0;
  const canUpload = hasCsrf && !previewing && !restoring && !exporting;
  const selectedName = file?.name ?? "";
  const selectedSize = file?.size ?? 0;
  const previewWarnings = preview?.warnings ?? [];
  const restoreWarnings = restoreResult?.warnings ?? [];
  const restoreIssues = restoreResult?.issues ?? [];
  const restoreNormalizationProfiles = restoreResult?.normalization?.profiles ?? [];
  const previewIncludesPlanningV3 = preview?.manifest?.planningV3?.included === true;
  const restoreConfirmUsesDetailCopy = isSettingsSurface && previewIncludesPlanningV3;

  const summaryRows = useMemo(() => {
    const actual = preview?.actual;
    if (!actual) return [];
    if (isSettingsSurface) {
      return [
        `재무 프로필: ${actual.profiles ?? 0}개`,
        `실행 기록: ${actual.runs ?? 0}개`,
        `후속 행동 계획: ${actual.actionPlans ?? 0}개`,
        `후속 행동 상태: ${actual.actionProgress ?? 0}개`,
        `Planning v3 영역: ${actual.planningV3Owners ?? 0}개`,
        `Planning v3 파일: ${actual.planningV3Files ?? 0}개 (${formatBytes(actual.planningV3Bytes)})`,
        `전체 파일: ${actual.totalFiles ?? 0}개`,
        `전체 크기: ${formatBytes(actual.totalBytes)}`,
      ];
    }
    return [
      `profiles: ${actual.profiles ?? 0}`,
      `runs: ${actual.runs ?? 0}`,
      `runBlobs: ${actual.runBlobs ?? 0}`,
      `actionPlans: ${actual.actionPlans ?? 0}`,
      `actionProgress: ${actual.actionProgress ?? 0}`,
      `assumptionsHistory: ${actual.assumptionsHistory ?? 0}`,
      `policies: ${actual.policies ?? 0}`,
      `planningV3Owners: ${actual.planningV3Owners ?? 0}`,
      `planningV3Files: ${actual.planningV3Files ?? 0}`,
      `totalFiles: ${actual.totalFiles ?? 0}`,
      `totalBytes: ${formatBytes(actual.totalBytes)}`,
    ];
  }, [isSettingsSurface, preview]);

  async function handleExport(): Promise<void> {
    if (!hasCsrf) {
      setError("보안 확인 토큰이 없어 백업 파일을 만들 수 없습니다.");
      return;
    }
    setExporting(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    try {
      let activeCsrf = csrf;
      let response = await fetch(`${backupApiBase}/export`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: activeCsrf, passphrase, mode: exportMode, gzip: exportGzip }),
      });
      if (!response.ok && response.status === 403) {
        const firstPayload = (await response.json().catch(() => null)) as OpsApiErrorPayload | null;
        const firstCode = (firstPayload?.error?.code ?? "").trim().toUpperCase();
        if (firstCode === "CSRF") {
          activeCsrf = await refreshCsrfToken();
          response = await fetch(`${backupApiBase}/export`, {
            method: "POST",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ csrf: activeCsrf, passphrase, mode: exportMode, gzip: exportGzip }),
          });
        } else {
          setErrorFixHref(typeof firstPayload?.error?.fixHref === "string" ? firstPayload.error.fixHref : "");
          throw new Error(toBackupActionError(firstPayload, "백업 파일을 만들지 못했습니다."));
        }
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as OpsApiErrorPayload | null;
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(toBackupActionError(payload, "백업 파일을 만들지 못했습니다."));
      }
      const receipt = response.headers.get("x-planning-backup-export-receipt")?.trim() ?? "";
      if (!receipt) {
        throw new Error("백업 저장 확인 정보를 받지 못했습니다. 파일을 다시 내려받아 주세요.");
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
      setPendingExportConfirmation({ fileName, receipt });
      setNotice(`암호화 백업 파일의 다운로드를 시작했습니다. 파일이 실제로 저장되었는지 확인해 주세요. (${fileName})`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "백업 파일을 만들지 못했습니다.");
    } finally {
      setExporting(false);
    }
  }

  async function handleFinalizeExport(): Promise<void> {
    if (!pendingExportConfirmation) return;
    if (!hasCsrf) {
      setError("보안 확인 토큰이 없어 저장 완료를 확인할 수 없습니다.");
      return;
    }
    setFinalizingExport(true);
    setError("");
    setErrorFixHref("");
    try {
      let activeCsrf = csrf;
      const finalizeRequest = (csrfToken: string) => fetch(`${backupApiBase}/export/finalize`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: csrfToken, receipt: pendingExportConfirmation.receipt }),
      });
      let response = await finalizeRequest(activeCsrf);
      if (!response.ok && response.status === 403) {
        const firstPayload = (await response.json().catch(() => null)) as BackupExportFinalizePayload | null;
        if (getOpsApiErrorCode(firstPayload) === "CSRF") {
          activeCsrf = await refreshCsrfToken();
          response = await finalizeRequest(activeCsrf);
        } else {
          setErrorFixHref(typeof firstPayload?.error?.fixHref === "string" ? firstPayload.error.fixHref : "");
          throw new Error(toBackupActionError(firstPayload, "백업 저장 완료를 확인하지 못했습니다."));
        }
      }
      const payload = (await response.json().catch(() => null)) as BackupExportFinalizePayload | null;
      if (!response.ok || !payload?.ok) {
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(toBackupActionError(payload, "백업 저장 완료를 확인하지 못했습니다."));
      }
      const fileName = pendingExportConfirmation.fileName;
      const status = payload.data?.status;
      setPendingExportConfirmation(null);
      setNotice(status === "superseded"
        ? `더 최근에 저장 확인한 백업이 있어 현재 확인은 추가 반영하지 않았습니다. (${fileName})`
        : `파일 저장 확인을 완료했습니다. 다음 변경분 백업은 이 시점 이후의 변경부터 만듭니다. (${fileName})`);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : "백업 저장 완료를 확인하지 못했습니다.");
    } finally {
      setFinalizingExport(false);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!file) {
      setError("먼저 zip 파일을 선택해 주세요.");
      return;
    }
    if (!hasCsrf) {
      setError("보안 확인 정보가 없어 백업 내용을 확인할 수 없습니다.");
      return;
    }
    setPreviewing(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    setRestoreResult(null);
    try {
      let activeCsrf = csrf;
      const buildPreviewFormData = (csrfToken: string): FormData => {
        const formData = new FormData();
        formData.set("csrf", csrfToken);
        formData.set("passphrase", passphrase);
        formData.set("file", file);
        return formData;
      };

      let response = await fetch(`${backupApiBase}/preview`, {
        method: "POST",
        body: buildPreviewFormData(activeCsrf),
      });

      if (!response.ok && response.status === 403) {
        const firstPayload = (await response.json().catch(() => null)) as OpsApiErrorPayload | null;
        const firstCode = getOpsApiErrorCode(firstPayload);
        if (firstCode === "CSRF") {
          activeCsrf = await refreshCsrfToken();
          response = await fetch(`${backupApiBase}/preview`, {
            method: "POST",
            body: buildPreviewFormData(activeCsrf),
          });
        } else {
          setErrorFixHref(typeof firstPayload?.error?.fixHref === "string" ? firstPayload.error.fixHref : "");
          throw new Error(toBackupActionError(firstPayload, "백업 내용을 확인하지 못했습니다."));
        }
      }

      const payload = (await response.json().catch(() => null)) as BackupPreviewPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(toBackupActionError(payload, "백업 내용을 확인하지 못했습니다."));
      }
      setPreview(payload.data);
      setPreviewToken(typeof payload.previewToken === "string" ? payload.previewToken : "");
      setNotice("preview 완료: 구조와 개수를 확인했습니다.");
    } catch (previewError) {
      setPreview(null);
      setPreviewToken("");
      setError(previewError instanceof Error ? previewError.message : "preview에 실패했습니다.");
    } finally {
      setPreviewing(false);
    }
  }

  async function executeRestore(): Promise<void> {
    if (!file) {
      setError("먼저 zip 파일을 선택해 주세요.");
      return;
    }
    if (!hasCsrf) {
      setError("보안 확인 정보가 없어 복원을 실행할 수 없습니다.");
      return;
    }
    if (!preview || !previewToken) {
      setError("복원 전에 같은 파일과 암호로 미리보기를 완료해 주세요.");
      return;
    }

    setRestoring(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    setRestoreResult(null);
    try {
      let activeCsrf = csrf;
      const buildRestoreFormData = (csrfToken: string): FormData => {
        const formData = new FormData();
        formData.set("csrf", csrfToken);
        formData.set("mode", mode);
        formData.set("passphrase", passphrase);
        formData.set("previewToken", previewToken);
        formData.set("file", file);
        return formData;
      };

      let response = await fetch(`${backupApiBase}/restore`, {
        method: "POST",
        body: buildRestoreFormData(activeCsrf),
      });

      if (!response.ok && response.status === 403) {
        const firstPayload = (await response.json().catch(() => null)) as OpsApiErrorPayload | null;
        const firstCode = getOpsApiErrorCode(firstPayload);
        if (firstCode === "CSRF") {
          activeCsrf = await refreshCsrfToken();
          response = await fetch(`${backupApiBase}/restore`, {
            method: "POST",
            body: buildRestoreFormData(activeCsrf),
          });
        } else {
          setErrorFixHref(typeof firstPayload?.error?.fixHref === "string" ? firstPayload.error.fixHref : "");
          throw new Error(toBackupActionError(firstPayload, "복원하지 못했습니다."));
        }
      }

      const payload = (await response.json().catch(() => null)) as BackupRestorePayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        if ((payload?.error?.code ?? "").trim().toUpperCase() === "PREVIEW_REQUIRED") {
          setPreviewToken("");
        }
        setErrorFixHref(typeof payload?.error?.fixHref === "string" ? payload.error.fixHref : "");
        throw new Error(toBackupActionError(payload, "복원하지 못했습니다."));
      }
      setRestoreResult(payload.data);
      setPreviewToken("");
      setNotice(payload.message ?? "restore를 완료했습니다.");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "restore에 실패했습니다.");
    } finally {
      setRestoring(false);
    }
  }

  function handleRestore(): void {
    if (!file) {
      setError("먼저 zip 파일을 선택해 주세요.");
      return;
    }
    if (!hasCsrf) {
      setError("보안 확인 정보가 없어 복원을 실행할 수 없습니다.");
      return;
    }
    if (!preview || !previewToken) {
      setError("복원 전에 같은 파일과 암호로 미리보기를 완료해 주세요.");
      return;
    }
    setConfirmRestoreOpen(true);
  }

  function handlePassphraseChange(value: string): void {
    setPassphrase(value);
    setPreview(null);
    setPreviewToken("");
    setRestoreResult(null);
  }

  function handleFileChange(nextFile: File | null): void {
    setFile(nextFile);
    setPreview(null);
    setPreviewToken("");
    setRestoreResult(null);
    setNotice("");
    setError("");
  }

  return (
    <PageShell>
      <PageHeader
        title={isSettingsSurface ? "백업 및 복원" : "운영 백업 및 복원"}
        description={isSettingsSurface
          ? "현재 사용자의 재무설계 기록을 암호화 파일로 내보내고, 미리보기 확인 후 안전하게 복원합니다."
          : "로컬 재무설계 데이터를 암호화 파일로 백업하고, 내용을 확인한 뒤 복원합니다."}
        action={(
          <div className="flex items-center gap-2">
            <ButtonLink href={isSettingsSurface ? "/settings" : "/ops"} size="sm" variant="outline">
              {isSettingsSurface ? "설정 홈" : "운영 허브"}
            </ButtonLink>
          </div>
        )}
      />

      {isSettingsSurface ? (
        <p className="mb-6 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700">
          백업에는 로그인한 사용자의 프로필·실행 기록이 포함됩니다. 상세 계좌·거래·분류 데이터는 사용자별 저장을 쓰는 실행 방식에서만 함께 포함되니, 미리보기에서 포함 여부를 확인해 주세요. 공용 가정과 운영 정책, 이 브라우저의 화면 설정은 포함되지 않습니다. 암호와 백업 파일은 서로 다른 안전한 곳에 보관해 주세요.
        </p>
      ) : null}

      {!hasCsrf ? (
        <ErrorState
          className="mb-4"
          message="보안 확인 정보가 없어 실행할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <BackupExportCard
          exportGzip={exportGzip}
          exportMode={exportMode}
          exporting={exporting}
          finalizingExport={finalizingExport}
          hasCsrf={hasCsrf}
          isSettingsSurface={isSettingsSurface}
          passphrase={passphrase}
          pendingExportConfirmation={pendingExportConfirmation}
          previewing={previewing}
          restoring={restoring}
          savedFileConfirmationLabel={SAVED_FILE_CONFIRMATION_LABEL}
          onExport={() => void handleExport()}
          onExportGzipChange={setExportGzip}
          onExportModeChange={setExportMode}
          onFinalizeExport={() => void handleFinalizeExport()}
          onPassphraseChange={handlePassphraseChange}
        />
        <BackupRestoreControlsCard
          canUpload={canUpload}
          file={file}
          hasCsrf={hasCsrf}
          isSettingsSurface={isSettingsSurface}
          mode={mode}
          passphrase={passphrase}
          previewIncludesPlanningV3={previewIncludesPlanningV3}
          previewToken={previewToken}
          previewing={previewing}
          restoring={restoring}
          selectedName={selectedName}
          selectedSize={selectedSize}
          onFileChange={handleFileChange}
          onModeChange={setMode}
          onPassphraseChange={handlePassphraseChange}
          onPreview={() => void handlePreview()}
          onRestore={handleRestore}
        />
      </div>

      {previewing || restoring ? (
        <LoadingState className="mt-6" title={previewing ? "백업 내용을 확인하는 중입니다" : "백업을 복원하는 중입니다"} />
      ) : null}

      {notice ? <p className="mt-6 text-sm font-semibold text-navy" role="status" aria-live="polite">{notice}</p> : null}
      {error ? (
        <p className="mt-2 text-sm font-semibold text-rose-700" role="alert">
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
        <BackupPreviewCard preview={preview} summaryRows={summaryRows} warnings={previewWarnings} />
      ) : null}

      {restoreResult ? (
        <BackupRestoreResultCard
          issues={restoreIssues}
          normalizationProfiles={restoreNormalizationProfiles}
          restoreResult={restoreResult}
          warnings={restoreWarnings}
        />
      ) : null}
      {afterContent}
      {confirmRestoreOpen ? (
        <BackupRestoreConfirmDialog
          isSettingsSurface={restoreConfirmUsesDetailCopy}
          mode={mode}
          restoring={restoring}
          selectedName={selectedName}
          onClose={() => {
            if (!restoring) setConfirmRestoreOpen(false);
          }}
          onConfirm={() => {
            setConfirmRestoreOpen(false);
            void executeRestore();
          }}
        />
      ) : null}
    </PageShell>
  );
}
