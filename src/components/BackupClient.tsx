"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildBundle,
  CLIENT_STORAGE_WHITELIST,
  isServerPathWhitelisted,
  validateBundle,
  type BackupBundle,
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
  localApplied: string[];
  localRemoved: string[];
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

function readClientStorageMap(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of CLIENT_STORAGE_WHITELIST) {
    try {
      out[key] = window.localStorage.getItem(key);
    } catch {
      out[key] = null;
    }
  }
  return out;
}

function applyClientStorageMap(map: Record<string, string | null>): { applied: string[]; removed: string[] } {
  const applied: string[] = [];
  const removed: string[] = [];
  for (const key of CLIENT_STORAGE_WHITELIST) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const value = map[key];
    try {
      if (value === null) {
        window.localStorage.removeItem(key);
        removed.push(key);
      } else {
        window.localStorage.setItem(key, value);
        applied.push(key);
      }
    } catch {
      // ignore local storage failures per key
    }
  }
  return { applied, removed };
}

export function BackupClient() {
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

  const whitelistPreview = useMemo(
    () => CLIENT_STORAGE_WHITELIST.slice(0, 5).join(", "),
    [],
  );
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
      const response = await fetch("/api/dev/backup/export", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ExportApiPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "백업 export API 호출에 실패했습니다.");
        return;
      }
      const serverFiles = payload.data?.serverFiles ?? {};
      const clientStorage = readClientStorageMap();
      const bundle = buildBundle({
        serverFilesMap: serverFiles,
        clientStorageMap: clientStorage,
      });
      downloadText(
        makeFilename("finance_backup_bundle"),
        JSON.stringify(bundle, null, 2),
        "application/json;charset=utf-8",
      );
      setNotice(`백업 파일을 다운로드했습니다. (serverFiles ${Object.keys(bundle.serverFiles).length}개, clientStorage ${Object.keys(bundle.clientStorage).length}개)`);
    } catch {
      setError("백업 파일 생성 중 오류가 발생했습니다.");
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
      setPendingBundle(bundle);
      setPendingFilename(file.name);
      setSelectedServerPaths(
        Object.keys(bundle.serverFiles)
          .map((entry) => String(entry).trim().replaceAll("\\", "/"))
          .filter((entry) => entry.length > 0 && isServerPathWhitelisted(entry))
          .sort((a, b) => a.localeCompare(b)),
      );
      await buildDiffPreview(bundle);
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
      const response = await fetch("/api/dev/backup/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bundle: pendingBundle,
          options: {
            restorePoint: true,
            applyServerFiles,
            includePaths: applyServerFiles ? selectedServerPaths : [],
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as ImportApiPayload | null;
      const payloadIssues = Array.isArray(payload?.issues)
        ? payload.issues.map((item) => String(item))
        : [];

      if (!response.ok || !payload?.ok) {
        setImportSummary({
          localApplied: [],
          localRemoved: [],
          serverWritten: Array.isArray(payload?.written) ? payload.written : [],
          serverSkipped: Array.isArray(payload?.skipped)
            ? payload.skipped.map((item) => ({
                path: String(item.path ?? "-"),
                reason: String(item.reason ?? "-"),
              }))
            : [],
          restorePointCreated: payload?.restorePointCreated === true,
          validated: payload?.validated === true,
          rolledBack: payload?.rolledBack === true,
          issues: payloadIssues,
        });
        setError(payload?.error?.message ?? "서버 파일 복원에 실패했습니다.");
        await refreshRestorePoint();
        await buildDiffPreview(pendingBundle);
        return;
      }

      const local = applyClientStorage
        ? applyClientStorageMap(pendingBundle.clientStorage)
        : { applied: [], removed: [] };
      const summary: ImportSummary = {
        localApplied: local.applied,
        localRemoved: local.removed,
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
      setNotice(payload.validated ? "백업 복원 및 검증 통과가 완료되었습니다." : "백업 복원이 완료되었습니다.");
      await refreshRestorePoint();
      await buildDiffPreview(pendingBundle);
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
        localApplied: [],
        localRemoved: [],
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
        description="로컬 상태와 서버 파일을 단일 JSON 번들로 내보내거나 선택 복원합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" className="rounded-xl font-black">설정 홈으로</Button>
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="데이터 내보내기 (Export)" description="서버 화이트리스트 파일과 클라이언트 저장소 키를 백업합니다." />
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 p-3 rounded-xl leading-relaxed">
            대상 키 예시: {whitelistPreview}
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Button type="button" variant="primary" className="h-12 px-8 rounded-2xl font-black shadow-md" disabled={exporting || importing} onClick={() => void handleExport()}>
              {exporting ? "백업 번들 생성 중..." : "백업 JSON 다운로드"}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="데이터 가져오기 (Import)" description="백업 파일을 업로드하여 상태를 복원합니다." />
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
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
              <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-2">
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
          error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
        )}>
          {error || notice}
        </div>
      )}

      {pendingBundle ? (
        <Card className="mt-8 rounded-[2rem] p-8 shadow-sm border-emerald-100">
          <SubSectionHeader title="복원 미리보기 및 설정" description={`파일명: ${pendingFilename ?? "-"}`} />
          
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Same</p>
              <p className="text-lg font-black text-slate-900 tabular-nums">{serverDiff?.same.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Changed</p>
              <p className="text-lg font-black text-amber-700 tabular-nums">{serverDiff?.changed.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Added</p>
              <p className="text-lg font-black text-emerald-700 tabular-nums">{serverDiff?.added.length ?? 0}</p>
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
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 cursor-pointer transition-all hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={applyServerFiles}
                    onChange={(event) => setApplyServerFiles(event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-800">서버 파일 복원</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">화이트리스트에 포함된 설정 및 데이터 파일을 덮어씁니다.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 cursor-pointer transition-all hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={applyClientStorage}
                    onChange={(event) => setApplyClientStorage(event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-black text-slate-800">클라이언트 저장소 복원</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">localStorage의 앱 설정을 복원합니다.</p>
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
                    <label key={pathValue} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer group">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={selectedServerPaths.includes(pathValue)}
                          onChange={() => togglePath(pathValue)}
                        />
                        <span className="truncate">{pathValue}</span>
                      </span>
                      <span className={cn(
                        "shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                        diffStatusByPath.get(pathValue) === "same" ? "text-slate-300" :
                        diffStatusByPath.get(pathValue) === "changed" ? "bg-amber-100 text-amber-700" :
                        diffStatusByPath.get(pathValue) === "added" ? "bg-emerald-100 text-emerald-700" :
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
              className="h-14 px-12 rounded-2xl font-black shadow-xl shadow-emerald-100 transition-all hover:-translate-y-0.5 active:scale-95"
              disabled={importing || rollingBack}
              onClick={() => void handleImportApply()}
            >
              {importing ? "복원 진행 중..." : "선택 항목 복원 실행 (Restore Point 자동 생성)"}
            </Button>
          </div>
        </Card>
      ) : null}

      {importSummary ? (
        <Card className="mt-8 rounded-[2rem] p-8 shadow-sm border-slate-900 bg-slate-900 text-white">
          <SubSectionHeader 
            title="복원 결과 요약" 
            className="mb-6"
            titleClassName="text-white"
            descriptionClassName="text-white/50"
            description={importSummary.validated ? "검증 통과 및 복원이 성공적으로 완료되었습니다." : "복원 처리가 완료되었습니다."} 
          />
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">localStorage</p>
              <p className="text-base font-black tabular-nums mt-1">+{importSummary.localApplied.length} / -{importSummary.localRemoved.length}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Server Files</p>
              <p className="text-base font-black tabular-nums mt-1">Written {importSummary.serverWritten.length}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Restore Point</p>
              <p className="text-base font-black mt-1">{importSummary.restorePointCreated ? "Created" : "N/A"}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Rollback Status</p>
              <p className={cn("text-base font-black mt-1", importSummary.rolledBack ? "text-amber-400" : "text-emerald-400")}>{importSummary.rolledBack ? "ROLLED BACK" : "CLEAN"}</p>
            </div>
          </div>

          {importSummary.issues.length > 0 && (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-5 mb-6">
              <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-3">검증 이슈 발견</p>
              <ul className="space-y-1.5 text-xs font-bold text-rose-200/80">
                {importSummary.issues.slice(0, 5).map((issue, idx) => (
                  <li key={idx} className="flex gap-2"><span className="text-rose-500">•</span> {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {importSummary.serverSkipped.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Skip Details</p>
              <ul className="grid gap-2">
                {importSummary.serverSkipped.slice(0, 10).map((item) => (
                  <li key={`${item.path}:${item.reason}`} className="text-[11px] font-bold text-white/60 bg-white/5 p-2 rounded-lg truncate">
                    <span className="text-white/80 mr-2">{item.path}</span> — {item.reason}
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
