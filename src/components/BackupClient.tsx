"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BROWSER_SETTINGS_STORAGE_WHITELIST,
  isServerPathWhitelisted,
  prepareBrowserSettingsBackup,
  restoreBrowserSettingsStorage,
  validateBundle,
  type BackupBundle,
  type BrowserSettingsRestoreResult,
} from "@/lib/backup/backupBundle";
import { diffServerFiles, type ServerFileDiffResult } from "@/lib/backup/backupDiff";
import { downloadText } from "@/lib/browser/download";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

type ExportApiPayload = {
  ok?: boolean;
  data?: {
    serverFiles?: Record<string, string | null>;
    readFailed?: string[];
  };
  error?: {
    message?: string;
  };
};

type ImportApiPayload = {
  ok?: boolean;
  written?: string[];
  skipped?: Array<{ path?: string; reason?: string }>;
  restorePointCreated?: boolean;
  validated?: boolean;
  issues?: string[];
  rolledBack?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

type RestorePointStatusPayload = {
  ok?: boolean;
  data?: {
    exists?: boolean;
    createdAt?: string | null;
  };
  error?: {
    message?: string;
  };
};

type ImportSummary = {
  localApplied: number;
  localRemoved: number;
  localIgnored: number;
  localFailed: number;
  serverWritten: string[];
  serverSkipped: Array<{ path: string; reason: string }>;
  restorePointCreated: boolean;
  validated: boolean;
  rolledBack: boolean;
  issues: string[];
};

function makeFilename(prefix: string): string {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `${prefix}_${stamp}.json`;
}

type BrowserSettingsDownload = (
  filename: string,
  content: string,
  contentType: string,
) => void;

export type BrowserSettingsDownloadResult =
  | { ok: true; notice: string; bundle: BackupBundle }
  | { ok: false; error: string; failedKeys: string[] };

export function downloadBrowserSettingsBackup(
  storage: Pick<Storage, "getItem">,
  download: BrowserSettingsDownload = downloadText,
): BrowserSettingsDownloadResult {
  const prepared = prepareBrowserSettingsBackup(storage, BROWSER_SETTINGS_STORAGE_WHITELIST);
  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
      failedKeys: prepared.failedKeys,
    };
  }
  download(
    makeFilename("finance_browser_settings"),
    JSON.stringify(prepared.bundle, null, 2),
    "application/json;charset=utf-8",
  );
  return {
    ok: true,
    notice: prepared.notice,
    bundle: prepared.bundle,
  };
}

export function formatBrowserSettingsRestoreResult(
  result: BrowserSettingsRestoreResult,
): { notice: string; error: string } {
  const summary = `적용 ${result.applied}개, 제거 ${result.removed}개, 무시 ${result.ignored}개, 실패 ${result.failed}개.`;
  if (result.failed > 0) {
    return {
      notice: "",
      error: `일부 브라우저 설정을 복원하지 못했습니다. ${summary}`,
    };
  }
  return {
    notice: `브라우저 설정을 복원했습니다. ${summary}`,
    error: "",
  };
}

export function BackupClient(_props: { ownerId?: string | null }) {
  void _props;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [pendingBundle, setPendingBundle] = useState<BackupBundle | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string | null>(null);
  const [serverDiff, setServerDiff] = useState<ServerFileDiffResult | null>(null);
  const [selectedServerPaths, setSelectedServerPaths] = useState<string[]>([]);
  const [applyServerFiles, setApplyServerFiles] = useState(true);
  const [applyClientStorage, setApplyClientStorage] = useState(true);
  const [restorePointInfo, setRestorePointInfo] = useState<{ exists: boolean; createdAt: string | null }>({
    exists: false,
    createdAt: null,
  });

  const whitelistPreview = BROWSER_SETTINGS_STORAGE_WHITELIST.join(", ");
  const selectablePaths = useMemo(() => {
    if (!pendingBundle) return [];
    return Object.keys(pendingBundle.serverFiles)
      .map((entry) => String(entry).trim().replaceAll("\\", "/"))
      .filter((entry) => entry.length > 0 && isServerPathWhitelisted(entry))
      .sort((a, b) => a.localeCompare(b));
  }, [pendingBundle]);
  const diffStatusByPath = useMemo(() => {
    const map = new Map<string, "same" | "changed" | "added" | "missing">();
    if (!serverDiff) return map;
    for (const item of serverDiff.same) map.set(item.path, "same");
    for (const item of serverDiff.changed) map.set(item.path, "changed");
    for (const item of serverDiff.added) map.set(item.path, "added");
    for (const item of serverDiff.missing) map.set(item.path, "missing");
    return map;
  }, [serverDiff]);

  useEffect(() => {
    void refreshRestorePoint();
  }, []);

  async function refreshRestorePoint() {
    try {
      const response = await fetch("/api/dev/backup/restore-point", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RestorePointStatusPayload | null;
      if (!response.ok || !payload?.ok) return;
      const exists = payload.data?.exists === true;
      const createdAt = typeof payload.data?.createdAt === "string" ? payload.data.createdAt : null;
      setRestorePointInfo({ exists, createdAt });
    } catch {
      // ignore restore point status read failures in UI
    }
  }

  async function loadCurrentServerFiles(): Promise<Record<string, string | null> | null> {
    try {
      const response = await fetch("/api/dev/backup/export", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ExportApiPayload | null;
      if (!response.ok || !payload?.ok) {
        return null;
      }
      return payload.data?.serverFiles ?? {};
    } catch {
      return null;
    }
  }

  async function buildDiffPreview(bundle: BackupBundle) {
    const current = await loadCurrentServerFiles();
    if (!current) {
      setServerDiff(null);
      return;
    }
    setServerDiff(diffServerFiles(current, bundle.serverFiles));
  }

  async function handleExport() {
    setExporting(true);
    setNotice("");
    setError("");
    setImportSummary(null);
    try {
      const result = downloadBrowserSettingsBackup(window.localStorage);
      if (!result.ok) {
        const failedKeys = result.failedKeys.length > 0
          ? ` (실패 키: ${result.failedKeys.join(", ")})`
          : "";
        setError(`${result.error}${failedKeys}`);
        return;
      }
      setNotice(result.notice);
    } catch {
      setError("브라우저 설정 백업 파일 생성 중 오류가 발생했습니다.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportPrepare(file: File) {
    setNotice("");
    setError("");
    setImportSummary(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const validation = validateBundle(parsed);
      if (!validation.ok) {
        setError(`유효하지 않은 번들입니다: ${validation.error}`);
        return;
      }
      const bundle = parsed as BackupBundle;
      const serverPaths = Object.keys(bundle.serverFiles)
        .map((entry) => String(entry).trim().replaceAll("\\", "/"))
        .filter((entry) => entry.length > 0 && isServerPathWhitelisted(entry))
        .sort((a, b) => a.localeCompare(b));
      setPendingBundle(bundle);
      setPendingFilename(file.name);
      setSelectedServerPaths(serverPaths);
      setApplyServerFiles(serverPaths.length > 0);
      setApplyClientStorage(Object.keys(bundle.clientStorage).length > 0);
      if (serverPaths.length > 0) {
        await buildDiffPreview(bundle);
      } else {
        setServerDiff(null);
      }
      setNotice("복원 미리보기를 불러왔습니다. 적용 옵션을 확인한 뒤 복원 버튼을 눌러주세요.");
    } catch {
      setError("백업 파일을 읽거나 미리보기를 생성하는 중 오류가 발생했습니다.");
    }
  }

  async function handleImportApply() {
    if (!pendingBundle) {
      setError("먼저 백업 파일을 선택해 주세요.");
      return;
    }
    if (!applyServerFiles && !applyClientStorage) {
      setError("서버 파일 또는 클라이언트 저장소 중 최소 한 가지를 선택해 주세요.");
      return;
    }
    if (applyServerFiles && selectedServerPaths.length < 1) {
      setError("복원할 서버 파일을 최소 1개 선택해 주세요.");
      return;
    }

    setImporting(true);
    setNotice("");
    setError("");
    setImportSummary(null);
    try {
      let payload: ImportApiPayload = {
        ok: true,
        written: [],
        skipped: [],
        restorePointCreated: false,
        validated: false,
        rolledBack: false,
        issues: [],
      };
      if (applyServerFiles) {
        const response = await fetch("/api/dev/backup/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bundle: pendingBundle,
            options: {
              restorePoint: true,
              applyServerFiles: true,
              includePaths: selectedServerPaths,
            },
          }),
        });
        const serverPayload = (await response.json().catch(() => null)) as ImportApiPayload | null;
        const serverIssues = Array.isArray(serverPayload?.issues)
          ? serverPayload.issues.map((item) => String(item))
          : [];

        if (!response.ok || !serverPayload?.ok) {
          setImportSummary({
            localApplied: 0,
            localRemoved: 0,
            localIgnored: 0,
            localFailed: 0,
            serverWritten: Array.isArray(serverPayload?.written) ? serverPayload.written : [],
            serverSkipped: Array.isArray(serverPayload?.skipped)
              ? serverPayload.skipped.map((item) => ({
                  path: String(item.path ?? "-"),
                  reason: String(item.reason ?? "-"),
                }))
              : [],
            restorePointCreated: serverPayload?.restorePointCreated === true,
            validated: serverPayload?.validated === true,
            rolledBack: serverPayload?.rolledBack === true,
            issues: serverIssues,
          });
          setError(serverPayload?.error?.message ?? "서버 파일 복원에 실패했습니다.");
          await refreshRestorePoint();
          await buildDiffPreview(pendingBundle);
          return;
        }
        payload = serverPayload;
      }
      const payloadIssues = Array.isArray(payload.issues)
        ? payload.issues.map((item) => String(item))
        : [];

      const local = applyClientStorage
        ? restoreBrowserSettingsStorage(window.localStorage, pendingBundle.clientStorage)
        : { applied: 0, removed: 0, ignored: 0, failed: 0 };
      const summary: ImportSummary = {
        localApplied: local.applied,
        localRemoved: local.removed,
        localIgnored: local.ignored,
        localFailed: local.failed,
        serverWritten: Array.isArray(payload.written) ? payload.written : [],
        serverSkipped: Array.isArray(payload.skipped)
          ? payload.skipped.map((item) => ({
              path: String(item.path ?? "-"),
              reason: String(item.reason ?? "-"),
            }))
          : [],
        restorePointCreated: payload.restorePointCreated === true,
        validated: payload.validated === true,
        rolledBack: payload.rolledBack === true,
        issues: payloadIssues,
      };
      setImportSummary(summary);
      const localMessage = formatBrowserSettingsRestoreResult(local);
      if (localMessage.error) {
        setNotice(localMessage.notice);
        setError(localMessage.error);
      } else {
        const completionMessage = payload.validated
          ? "서버 파일 검증과 브라우저 설정 복원이 완료되었습니다."
          : "브라우저 설정 복원이 완료되었습니다.";
        setNotice(`${completionMessage} ${localMessage.notice.replace(/^브라우저 설정을 복원했습니다\.\s*/, "")}`);
      }
      if (applyServerFiles) {
        await refreshRestorePoint();
        await buildDiffPreview(pendingBundle);
      }
    } catch {
      setError("백업 파일 import 중 오류가 발생했습니다.");
    } finally {
      setImporting(false);
    }
  }

  async function handleRollback() {
    setRollingBack(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/dev/backup/restore-point/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as ImportApiPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "restore point 롤백에 실패했습니다.");
        return;
      }
      setImportSummary({
        localApplied: 0,
        localRemoved: 0,
        localIgnored: 0,
        localFailed: 0,
        serverWritten: Array.isArray(payload.written) ? payload.written : [],
        serverSkipped: Array.isArray(payload.skipped)
          ? payload.skipped.map((item) => ({
              path: String(item.path ?? "-"),
              reason: String(item.reason ?? "-"),
            }))
          : [],
        restorePointCreated: false,
        validated: false,
        rolledBack: false,
        issues: [],
      });
      setNotice("restore point 기준으로 서버 파일을 되돌렸습니다.");
      await refreshRestorePoint();
      if (pendingBundle) {
        await buildDiffPreview(pendingBundle);
      }
    } catch {
      setError("restore point 롤백 중 오류가 발생했습니다.");
    } finally {
      setRollingBack(false);
    }
  }

  function togglePath(pathValue: string) {
    setSelectedServerPaths((prev) => {
      if (prev.includes(pathValue)) return prev.filter((item) => item !== pathValue);
      return [...prev, pathValue].sort((a, b) => a.localeCompare(b));
    });
  }

  function selectAllPaths(checked: boolean) {
    if (checked) {
      setSelectedServerPaths(selectablePaths);
      return;
    }
    setSelectedServerPaths([]);
  }

  return (
    <PageShell>
      <PageHeader
        title="백업 및 복원"
        description="브라우저 화면 설정은 민감 재무 정보 없이 JSON으로 내보내고, 기존 백업은 허용된 항목만 선택 복원합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" className="rounded-xl font-black">설정 홈으로</Button>
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="브라우저 화면 설정 내보내기" description="상품 보관함·비교 목록과 화면 열기 방식만 평문 JSON으로 백업합니다." />
          <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
            재무 프로필, 플래닝 기록, 추천 조건·결과·저장 실행과 서버 파일은 포함하지 않습니다.
          </p>
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-surface-muted p-3 rounded-xl leading-relaxed">
            대상 키 예시: {whitelistPreview}
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Button type="button" variant="primary" className="h-12 px-8 rounded-2xl font-black shadow-md" disabled={exporting || importing} onClick={() => void handleExport()}>
              {exporting ? "브라우저 설정 확인 중..." : "브라우저 설정 JSON 다운로드"}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="데이터 가져오기 (Import)" description="기존 백업도 읽을 수 있지만 브라우저에는 허용된 화면 설정만 적용합니다." />
          <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
            복원 결과는 적용·제거·무시·실패 건수를 나누어 표시하며, 실패가 있으면 전체 성공으로 표시하지 않습니다.
          </p>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-surface-muted active:scale-95">
                {importing ? "복원 처리 중..." : "백업 파일 선택"}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={importing || exporting || rollingBack}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void handleImportPrepare(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="flex-1 rounded-2xl border border-slate-100 bg-surface-muted/50 px-4 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Restore Point</p>
                <p className="text-xs font-bold text-slate-600 tabular-nums">
                  {restorePointInfo.exists ? `생성됨 (${new Date(restorePointInfo.createdAt!).toLocaleString("ko-KR", { hour12: false })})` : "생성된 시점 없음"}
                </p>
              </div>
            </div>
            
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl font-black"
              disabled={rollingBack || importing || !restorePointInfo.exists}
              onClick={() => void handleRollback()}
            >
              {rollingBack ? "롤백 진행 중..." : "Restore Point로 롤백 실행"}
            </Button>
          </div>
        </Card>
      </div>

      {(notice || error) && (
        <div className={cn(
          "mt-8 rounded-[1.5rem] p-5 text-sm font-black animate-in fade-in slide-in-from-bottom-2",
          error ? "bg-rose-50 text-rose-700" : "bg-primary/5 text-navy"
        )}>
          {error || notice}
        </div>
      )}

      {pendingBundle ? (
        <Card className="mt-8 rounded-[2rem] p-8 shadow-sm border-primary/10">
          <SubSectionHeader title="복원 미리보기 및 설정" description={`파일명: ${pendingFilename ?? "-"}`} />
          
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-surface-muted p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Same</p>
              <p className="text-lg font-black text-navy tabular-nums">{serverDiff?.same.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Changed</p>
              <p className="text-lg font-black text-amber-700 tabular-nums">{serverDiff?.changed.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-primary/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Added</p>
              <p className="text-lg font-black text-navy tabular-nums">{serverDiff?.added.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Missing</p>
              <p className="text-lg font-black text-rose-700 tabular-nums">{serverDiff?.missing.length ?? 0}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 border-t border-slate-100 pt-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">복원 옵션 선택</p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-surface-muted/50 p-4 cursor-pointer transition-all hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                    checked={applyServerFiles}
                    onChange={(event) => setApplyServerFiles(event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-800">서버 파일 복원</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">화이트리스트에 포함된 설정 및 데이터 파일을 덮어씁니다.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-surface-muted/50 p-4 cursor-pointer transition-all hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                    checked={applyClientStorage}
                    onChange={(event) => setApplyClientStorage(event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-800">클라이언트 저장소 복원</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">허용된 화면 설정만 복원하며 재무·추천 키는 무시합니다.</p>
                  </div>
                </label>
              </div>
            </div>

            {applyServerFiles && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">파일 상세 선택 ({selectedServerPaths.length}개)</p>
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={selectedServerPaths.length > 0 && selectedServerPaths.length === selectablePaths.length}
                      onChange={(event) => selectAllPaths(event.target.checked)}
                    />
                    Select All
                  </label>
                </div>
                <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {selectablePaths.map((pathValue) => (
                    <label key={pathValue} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-surface-muted transition-colors cursor-pointer group">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                          checked={selectedServerPaths.includes(pathValue)}
                          onChange={() => togglePath(pathValue)}
                        />
                        <span className="truncate">{pathValue}</span>
                      </span>
                      <span className={cn(
                        "shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                        diffStatusByPath.get(pathValue) === "same" ? "text-slate-300" :
                        diffStatusByPath.get(pathValue) === "changed" ? "bg-amber-100 text-amber-700" :
                        diffStatusByPath.get(pathValue) === "added" ? "bg-primary/10 text-navy" :
                        "bg-rose-100 text-rose-700"
                      )}>
                        {diffStatusByPath.get(pathValue) ?? "-"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex justify-center border-t border-slate-50 pt-8">
            <Button
              type="button"
              variant="primary"
              className="h-14 px-12 rounded-2xl font-black shadow-xl shadow-primary/10 transition-all hover:-translate-y-0.5 active:scale-95"
              disabled={importing || rollingBack}
              onClick={() => void handleImportApply()}
            >
              {importing ? "복원 진행 중..." : "선택 항목 복원 실행 (Restore Point 자동 생성)"}
            </Button>
          </div>
        </Card>
      ) : null}

      {importSummary ? (
        <Card className="mt-8 rounded-[2rem] p-8 shadow-sm border border-slate-100 bg-surface-muted">
          <SubSectionHeader 
            title="복원 결과 요약" 
            className="mb-6"
            description={importSummary.localFailed > 0
              ? "일부 브라우저 설정을 복원하지 못했습니다."
              : importSummary.validated
                ? "검증 통과 및 복원이 완료되었습니다."
                : "복원 처리가 완료되었습니다."}
          />
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">localStorage</p>
              <p className="text-base font-black tabular-nums mt-1 text-navy">
                적용 {importSummary.localApplied} · 제거 {importSummary.localRemoved} · 무시 {importSummary.localIgnored} · 실패 {importSummary.localFailed}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Server Files</p>
              <p className="text-base font-black tabular-nums mt-1 text-navy">Written {importSummary.serverWritten.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Restore Point</p>
              <p className="text-base font-black mt-1 text-navy">{importSummary.restorePointCreated ? "Created" : "N/A"}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rollback Status</p>
              <p className={cn("text-base font-black mt-1", importSummary.rolledBack ? "text-amber-600" : "text-primary")}>{importSummary.rolledBack ? "ROLLED BACK" : "CLEAN"}</p>
            </div>
          </div>

          {importSummary.issues.length > 0 && (
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-5 mb-6">
              <p className="text-xs font-black text-rose-600 uppercase tracking-widest mb-3">검증 이슈 발견</p>
              <ul className="space-y-1.5 text-xs font-bold text-rose-800/80">
                {importSummary.issues.slice(0, 5).map((issue, idx) => (
                  <li key={idx} className="flex gap-2"><span className="text-rose-500">•</span> {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {importSummary.serverSkipped.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Skip Details</p>
              <ul className="grid gap-2">
                {importSummary.serverSkipped.slice(0, 10).map((item) => (
                  <li key={`${item.path}:${item.reason}`} className="text-[11px] font-bold text-slate-600 bg-white border border-slate-100 p-3 rounded-xl truncate shadow-sm">
                    <span className="text-slate-400 font-black mr-2 uppercase tracking-tight">{item.path}</span>
                    <span className="text-slate-700">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : null}
    </PageShell>
  );
}
