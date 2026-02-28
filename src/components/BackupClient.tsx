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
        title="백업 / 복원"
        description="로컬 상태와 서버 파일을 단일 JSON 번들로 내보내거나 복원합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" size="sm">설정 홈</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-black text-slate-900">Export</h2>
          <p className="mt-2 text-sm text-slate-600">
            서버 whitelist 파일과 clientStorage whitelist 키를 한 파일로 내려받습니다.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            clientStorage keys 예시: {whitelistPreview}
          </p>
          <div className="mt-5">
            <Button type="button" variant="primary" size="sm" disabled={exporting || importing} onClick={() => void handleExport()}>
              {exporting ? "생성 중..." : "백업 파일 다운로드"}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-black text-slate-900">Import</h2>
          <p className="mt-2 text-sm text-slate-600">
            백업 JSON을 업로드하면 diff 미리보기 후 선택 복원을 실행할 수 있습니다.
          </p>
          <div className="mt-5">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {importing ? "복원 중..." : "백업 파일 선택"}
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
          </div>
          <p className="mt-3 text-xs text-slate-500">
            restore point: {restorePointInfo.exists ? "있음" : "없음"}
            {restorePointInfo.createdAt ? ` (${new Date(restorePointInfo.createdAt).toLocaleString()})` : ""}
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rollingBack || importing || !restorePointInfo.exists}
              onClick={() => void handleRollback()}
            >
              {rollingBack ? "롤백 중..." : "restore point로 되돌리기"}
            </Button>
          </div>
        </Card>
      </div>

      {notice ? <p className="mt-6 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      {pendingBundle ? (
        <Card className="mt-6">
          <h3 className="text-base font-black text-slate-900">복원 미리보기</h3>
          <p className="mt-1 text-xs text-slate-600">
            파일: {pendingFilename ?? "-"}
          </p>
          <div className="mt-4 grid gap-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              same {serverDiff?.same.length ?? 0}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              changed {serverDiff?.changed.length ?? 0}
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              added {serverDiff?.added.length ?? 0}
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              missing {serverDiff?.missing.length ?? 0}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={applyServerFiles}
                onChange={(event) => setApplyServerFiles(event.target.checked)}
              />
              서버 파일 복원 적용
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={applyClientStorage}
                onChange={(event) => setApplyClientStorage(event.target.checked)}
              />
              clientStorage 복원 적용
            </label>
          </div>

          {applyServerFiles ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-3 text-xs text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedServerPaths.length > 0 && selectedServerPaths.length === selectablePaths.length}
                    onChange={(event) => selectAllPaths(event.target.checked)}
                  />
                  전체 선택
                </label>
                <span>{selectedServerPaths.length}개 선택됨</span>
              </div>
              <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                {selectablePaths.map((pathValue) => (
                  <label key={pathValue} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedServerPaths.includes(pathValue)}
                        onChange={() => togglePath(pathValue)}
                      />
                      <span className="font-medium">{pathValue}</span>
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      {diffStatusByPath.get(pathValue) ?? "-"}
                    </span>
                  </label>
                ))}
                {selectablePaths.length < 1 ? (
                  <p className="px-2 py-2 text-xs text-slate-500">선택 가능한 server path가 없습니다.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={importing || rollingBack}
              onClick={() => void handleImportApply()}
            >
              {importing ? "복원 중..." : "복원 실행(restore point 생성)"}
            </Button>
          </div>
        </Card>
      ) : null}

      {importSummary ? (
        <Card className="mt-6">
          <h3 className="text-base font-black text-slate-900">복원 결과</h3>
          <p className="mt-2 text-xs text-slate-600">
            localStorage 적용 {importSummary.localApplied.length}건, 제거 {importSummary.localRemoved.length}건
          </p>
          <p className="mt-1 text-xs text-slate-600">
            서버 파일 작성 {importSummary.serverWritten.length}건, skip {importSummary.serverSkipped.length}건
          </p>
          <p className="mt-1 text-xs text-slate-600">
            restore point 생성: {importSummary.restorePointCreated ? "예" : "아니오"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            검증 결과: {importSummary.validated ? "검증 통과" : "검증 실패/미실행"}
          </p>
          {importSummary.rolledBack ? (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              롤백 완료
            </p>
          ) : null}
          {importSummary.issues.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-rose-700">검증 이슈</p>
              <ul className="mt-1 space-y-1 text-xs text-rose-700">
                {importSummary.issues.slice(0, 10).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {importSummary.serverSkipped.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {importSummary.serverSkipped.slice(0, 10).map((item) => (
                <li key={`${item.path}:${item.reason}`}>
                  {item.path} - {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </PageShell>
  );
}
