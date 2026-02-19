"use client";

import { useEffect, useMemo, useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { extractBaseUrlFromSample } from "@/lib/dev/urlWizard";

type StatusResponse = {
  ok: boolean;
  env?: Record<string, boolean>;
  apis?: Array<{ apiName: string; label: string; required: string[]; ready: boolean; missing: string[] }>;
  envFile?: {
    envLocalExists: boolean;
    presentKeysInEnvLocal: string[];
    missingKeysInEnvLocal: string[];
  };
  restartHint?: {
    needed: boolean;
    reason?: string;
    keysNotLoadedYet?: string[];
  };
  urlValidation?: Array<{ apiName: string; ok: boolean; warnings: string[] }>;
  cache?: { mode: string; cacheDir: string; memoryEntries: number; fileEntries: number; fileBytes: number };
  fetchedAt?: string;
};

type SampleResponse = {
  ok: boolean;
  apiName: string;
  cache?: "hit" | "miss";
  payload?: unknown;
  sampleFile?: string;
  meta?: { key?: string; fetchedAt?: string; expiresAt?: string };
  message?: string;
  error?: string;
  missing?: string[];
};

type WizardState = {
  sanitizedPreview: string;
  baseUrl?: string;
  warnings: string[];
  error?: string;
};

function prettyJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? "";
  const lines = text.split("\n");
  if (lines.length <= 50) return text;
  return `${lines.slice(0, 50).join("\n")}\n...(${lines.length - 50} lines truncated)`;
}

function formatDuration(expiresAt?: string): string {
  if (!expiresAt) return "-";
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms)) return "-";
  if (ms <= 0) return "만료";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  if (hour > 0) return `${hour}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

export function PublicApisDiagnosticsClient() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [runningApi, setRunningApi] = useState("");
  const [sampleResults, setSampleResults] = useState<Record<string, SampleResponse>>({});
  const [wizardByApi, setWizardByApi] = useState<Record<string, WizardState>>({});

  const apis = useMemo(() => status?.apis ?? [], [status?.apis]);
  const urlValidationByApi = useMemo(() => {
    const rows = status?.urlValidation ?? [];
    return Object.fromEntries(rows.map((row) => [row.apiName, row]));
  }, [status?.urlValidation]);

  async function copyRequiredKeys(keys: string[]) {
    const text = keys.map((key) => `${key}=`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("필수 env 키 템플릿을 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 수동으로 복사해 주세요.");
    }
  }

  async function copyWizardSnippet(apiName: string, keys: string[]) {
    const wizard = wizardByApi[apiName];
    if (!wizard?.baseUrl) return;
    const text = keys.map((key) => `${key}=${key.endsWith("_API_URL") ? wizard.baseUrl : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("URL 기반 env 스니펫을 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 수동으로 복사해 주세요.");
    }
  }

  function handleWizardInput(apiName: string, raw: string) {
    const parsed = extractBaseUrlFromSample(raw);
    setWizardByApi((prev) => ({ ...prev, [apiName]: parsed }));
  }

  async function loadStatus() {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const res = await fetch("/api/dev/public-apis/status", { cache: "no-store" });
      const json = (await res.json()) as StatusResponse;
      if (!res.ok || !json.ok) {
        setStatusError("진단 상태를 불러오지 못했습니다.");
        return;
      }
      setStatus(json);
    } catch {
      setStatusError("진단 상태를 불러오지 못했습니다.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function runSample(apiName: string) {
    setRunningApi(apiName);
    try {
      const res = await fetch("/api/dev/public-apis/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiName }),
      });
      const json = (await res.json()) as SampleResponse;
      setSampleResults((prev) => ({ ...prev, [apiName]: json }));
      await loadStatus();
    } catch {
      setSampleResults((prev) => ({
        ...prev,
        [apiName]: { ok: false, apiName, error: "NETWORK", message: "샘플 호출에 실패했습니다." },
      }));
    } finally {
      setRunningApi("");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="Public APIs 진단(Dev)" subtitle="키 설정 상태, 샘플 호출, 캐시 동작을 한 화면에서 확인합니다." />
        <Card>
          <p className="text-sm font-medium">환경변수 설정 가이드</p>
          <p className="mt-1 text-xs text-slate-600">1) `pnpm env:setup` 실행</p>
          <p className="text-xs text-slate-600">2) `.env.local`에 키/URL 입력</p>
          <p className="text-xs text-slate-600">3) `pnpm dev` 재시작</p>
          <p className="text-xs text-slate-600">키는 `.env.local` 서버 환경변수로만 설정하고 절대 커밋하지 마세요.</p>
          <p className="mt-1 text-xs text-slate-600">샘플 호출은 트래픽 정책에 영향을 줄 수 있으므로 필요할 때만 실행하세요.</p>
          <Button className="mt-3" size="sm" onClick={() => void loadStatus()} disabled={loadingStatus}>
            {loadingStatus ? "상태 갱신 중..." : "상태 새로고침"}
          </Button>
          {statusError ? <p className="mt-2 text-sm text-red-700">{statusError}</p> : null}
          {status?.cache ? (
            <div className="mt-3 text-xs text-slate-600">
              <p>cache mode: {status.cache.mode}</p>
              <p>cache dir: {status.cache.cacheDir}</p>
              <p>memory/file entries: {status.cache.memoryEntries} / {status.cache.fileEntries}</p>
              <p>file size: {status.cache.fileBytes.toLocaleString()} bytes</p>
            </div>
          ) : null}
          {status?.envFile ? (
            <div className="mt-3 text-xs">
              <p className={status.envFile.envLocalExists ? "text-green-700" : "text-red-700"}>
                .env.local: {status.envFile.envLocalExists ? "존재" : "없음 (pnpm env:setup 필요)"}
              </p>
              {status.envFile.missingKeysInEnvLocal.length > 0 ? (
                <p className="text-amber-700">.env.local missing: {status.envFile.missingKeysInEnvLocal.join(", ")}</p>
              ) : (
                <p className="text-green-700">.env.local 필수 키가 모두 존재합니다.</p>
              )}
            </div>
          ) : null}
          {status?.restartHint?.needed ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              <p>dev 서버 재시작 필요: {status.restartHint.reason ?? "환경변수가 아직 로드되지 않았습니다."}</p>
              <p>미로딩 키: {(status.restartHint.keysNotLoadedYet ?? []).join(", ")}</p>
            </div>
          ) : null}
        </Card>

        <div className="mt-4 grid gap-4">
          {apis.map((api) => {
            const sample = sampleResults[api.apiName];
            return (
              <Card key={api.apiName}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{api.label}</h2>
                    <p className="text-xs text-slate-500">{api.apiName}</p>
                    <p className={`text-xs ${api.ready ? "text-green-700" : "text-amber-700"}`}>
                      env: {api.ready ? "present" : `missing (${api.missing.join(", ")})`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void runSample(api.apiName)} disabled={runningApi === api.apiName}>
                    {runningApi === api.apiName ? "샘플 호출 중..." : "샘플 호출 실행"}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void copyRequiredKeys(api.required)}>
                    필수 env 키 복사
                  </Button>
                  <p className="text-xs text-slate-500">required: {api.required.join(", ")}</p>
                </div>
                {urlValidationByApi[api.apiName] && urlValidationByApi[api.apiName].warnings.length > 0 ? (
                  <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                    {urlValidationByApi[api.apiName].warnings.map((warning) => (
                      <p key={`${api.apiName}-${warning}`}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                {api.required.some((key) => key.endsWith("_API_URL")) ? (
                  <div className="mt-3 rounded border border-border bg-surface-muted p-2">
                    <p className="text-xs font-medium text-slate-700">URL Wizard(샘플 URL 붙여넣기)</p>
                    <textarea
                      className="mt-1 h-20 w-full rounded border border-border bg-surface p-2 text-xs"
                      placeholder="포털의 샘플 요청 URL을 붙여넣으세요."
                      value={wizardByApi[api.apiName]?.sanitizedPreview ?? ""}
                      onPaste={(event) => {
                        event.preventDefault();
                        const pasted = event.clipboardData.getData("text");
                        handleWizardInput(api.apiName, pasted);
                      }}
                      onChange={(event) => {
                        handleWizardInput(api.apiName, event.target.value);
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-600">base URL: {wizardByApi[api.apiName]?.baseUrl ?? "-"}</p>
                    {wizardByApi[api.apiName]?.error ? <p className="text-xs text-red-700">{wizardByApi[api.apiName]?.error}</p> : null}
                    {(wizardByApi[api.apiName]?.warnings ?? []).map((warning) => (
                      <p key={`${api.apiName}-wizard-${warning}`} className="text-xs text-amber-700">{warning}</p>
                    ))}
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      disabled={!wizardByApi[api.apiName]?.baseUrl}
                      onClick={() => void copyWizardSnippet(api.apiName, api.required)}
                    >
                      .env.local 스니펫 복사
                    </Button>
                  </div>
                ) : null}

                {sample ? (
                  <details className="mt-3 text-xs text-slate-600">
                    <summary>결과 보기</summary>
                    <p>ok: {String(sample.ok)}</p>
                    <p>cache: {sample.cache ?? "-"}</p>
                    <p>sampleFile: {sample.sampleFile ?? "-"}</p>
                    <p>fetchedAt: {sample.meta?.fetchedAt ?? "-"}</p>
                    <p>expiresAt: {sample.meta?.expiresAt ?? "-"} (남은 {formatDuration(sample.meta?.expiresAt)})</p>
                    {!sample.ok ? <p className="text-red-700">error: {sample.error ?? "-"} / {sample.message ?? "-"}</p> : null}
                    <pre className="mt-2 overflow-auto rounded border border-border bg-surface-muted p-2">{prettyJson(sample.payload ?? sample)}</pre>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      </Container>
    </main>
  );
}
