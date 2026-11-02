"use client";

import { useState } from "react";
import { OpsBackupClient } from "@/components/OpsBackupClient";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  BROWSER_SETTINGS_STORAGE_WHITELIST,
  prepareBrowserSettingsBackup,
  restoreBrowserSettingsStorage,
  validateBundle,
  type BackupBundle,
  type BrowserSettingsRestoreResult,
} from "@/lib/backup/backupBundle";
import { downloadText } from "@/lib/browser/download";

function makeFilename(): string {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `finance_browser_settings_${stamp}.json`;
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
    makeFilename(),
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

function BrowserSettingsBackup() {
  const [pendingBundle, setPendingBundle] = useState<BackupBundle | null>(null);
  const [pendingFilename, setPendingFilename] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function handleExport(): void {
    setError("");
    setNotice("");
    try {
      const result = downloadBrowserSettingsBackup(window.localStorage);
      if (!result.ok) {
        const failedKeys = result.failedKeys.length > 0 ? ` (실패 키: ${result.failedKeys.join(", ")})` : "";
        setError(`${result.error}${failedKeys}`);
        return;
      }
      setNotice(result.notice);
    } catch {
      setError("브라우저 설정 백업 파일 생성 중 오류가 발생했습니다.");
    }
  }

  async function handleSelect(file: File): Promise<void> {
    setNotice("");
    setError("");
    setPendingBundle(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validation = validateBundle(parsed);
      if (!validation.ok) {
        setError(`지원하지 않는 설정 파일입니다: ${validation.error}`);
        return;
      }
      setPendingBundle(parsed as BackupBundle);
      setPendingFilename(file.name);
      setNotice("복원할 브라우저 설정 파일을 확인했습니다. 아래 복원 버튼을 눌러 적용해 주세요.");
    } catch {
      setError("브라우저 설정 파일을 읽을 수 없습니다.");
    }
  }

  function handleRestore(): void {
    if (!pendingBundle) {
      setError("먼저 브라우저 설정 파일을 선택해 주세요.");
      return;
    }
    const result = restoreBrowserSettingsStorage(window.localStorage, pendingBundle.clientStorage);
    const ignoredServerFiles = Object.keys(pendingBundle.serverFiles).length;
    const ignored = result.ignored + ignoredServerFiles;
    const outcome = formatBrowserSettingsRestoreResult({ ...result, ignored });
    setNotice(outcome.notice);
    setError(outcome.error);
  }

  return (
    <Card className="mt-6">
      <h2 className="text-base font-black text-navy">3) 브라우저 화면 설정 내보내기</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        상품 보관함·비교 목록과 화면 열기 방식처럼 이 브라우저에만 저장된 표시 설정을 별도 JSON 파일로 보관합니다.
        재무 프로필, 플래닝 기록, 추천 조건·결과·저장 실행과 서버 파일은 포함하지 않습니다.
        기존 백업도 읽을 수 있지만 브라우저에는 허용된 화면 설정만 적용합니다.
        복원 결과는 적용·제거·무시·실패 개수로 구분하며 실패가 있으면 전체 성공으로 표시하지 않습니다.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleExport}>
          브라우저 설정 다운로드
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-surface-muted">
          설정 파일 선택
          <input
            accept="application/json,.json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleSelect(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <Button type="button" size="sm" variant="primary" disabled={!pendingBundle} onClick={handleRestore}>
          브라우저 설정 복원
        </Button>
      </div>
      {pendingFilename ? <p className="mt-3 text-xs text-slate-500">선택 파일: {pendingFilename}</p> : null}
      {notice ? <p className="mt-3 text-sm font-semibold text-navy" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
    </Card>
  );
}

export function BackupClient({ ownerId }: { ownerId: string }) {
  return (
    <OpsBackupClient
      surface="settings"
      afterContent={<BrowserSettingsBackup key={ownerId} />}
    />
  );
}
