"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type PreflightChange = {
  path: string;
  before?: unknown;
  after?: unknown;
  kind: "set" | "add" | "remove";
};

type PreflightMessage = {
  code: string;
  message: string;
};

type PreflightError = {
  path: string;
  message: string;
};

type PreflightResult = {
  ok: boolean;
  targetProfileId?: string;
  changes: PreflightChange[];
  warnings: PreflightMessage[];
  errors: PreflightError[];
  summary: {
    changedCount: number;
    errorCount: number;
    warningCount: number;
  };
};

type PreflightResponse = {
  ok: true;
  data: PreflightResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPreflightResponse(value: unknown): value is PreflightResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return Array.isArray(value.data.changes) && isRecord(value.data.summary);
}

function stringifyValue(value: unknown): string {
  if (value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type Props = {
  id: string;
  initialProfileId?: string;
};

export function ProfileDraftPreflightClient({ id, initialProfileId = "" }: Props) {
  const [profileId, setProfileId] = useState(initialProfileId);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PreflightResult | null>(null);

  const queryHref = useMemo(() => {
    const normalized = profileId.trim();
    if (!normalized) return `/planning/v3/profile/drafts/${encodeURIComponent(id)}/preflight`;
    return `/planning/v3/profile/drafts/${encodeURIComponent(id)}/preflight?profileId=${encodeURIComponent(normalized)}`;
  }, [id, profileId]);

  async function runPreflight() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/profile/drafts/${encodeURIComponent(id)}/preflight`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(profileId.trim() ? { profileId: profileId.trim() } : {}),
          ...(readDevCsrfToken() ? { csrf: readDevCsrfToken() } : {}),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isPreflightResponse(json)) {
        setResult(null);
        setMessage("프리플라이트 실행에 실패했습니다.");
        return;
      }
      setResult(json.data);
      setMessage("");
    } catch {
      setResult(null);
      setMessage("프리플라이트 실행에 실패했습니다.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Draft Preflight (Diff Only)</h1>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href={`/planning/v3/profile/drafts/${encodeURIComponent(id)}`}>
              초안 상세
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/profile/drafts">
              초안 목록
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
              프로필 선택
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                placeholder="profileId (선택)"
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
              />
            </label>
            <Button type="button" onClick={() => { void runPreflight(); }} disabled={running}>
              {running ? "실행 중..." : "프리플라이트 실행"}
            </Button>
            <Link className="text-xs font-semibold text-slate-600 underline underline-offset-2" href={queryHref}>
              URL 반영
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {result ? (
          <Card data-testid="v3-preflight-summary">
            <h2 className="text-sm font-bold text-slate-900">Summary</h2>
            <dl className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">targetProfileId</dt>
                <dd className="font-mono text-xs">{result.targetProfileId ?? "(없음: 기본 템플릿 비교)"}</dd>
              </div>
              <div>
                <dt className="font-semibold">결과</dt>
                <dd>{result.ok ? "OK" : "ERROR"}</dd>
              </div>
              <div>
                <dt className="font-semibold">변경 수</dt>
                <dd>{result.summary.changedCount}</dd>
              </div>
              <div>
                <dt className="font-semibold">경고 수</dt>
                <dd>{result.summary.warningCount}</dd>
              </div>
              <div>
                <dt className="font-semibold">오류 수</dt>
                <dd>{result.summary.errorCount}</dd>
              </div>
            </dl>
          </Card>
        ) : null}

        <Card data-testid="v3-preflight-errors">
          <h2 className="text-sm font-bold text-slate-900">Errors / Warnings</h2>
          {result ? (
            <div className="mt-2 space-y-3 text-xs">
              {result.errors.length > 0 ? (
                <ul className="space-y-1 text-rose-700">
                  {result.errors.map((error, index) => (
                    <li key={`${error.path}:${index}`} className="rounded border border-rose-200 bg-rose-50 px-2 py-1">
                      <span className="font-mono">{error.path}</span>: {error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">에러 없음</p>
              )}

              {result.warnings.length > 0 ? (
                <ul className="space-y-1 text-amber-700">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning.code}:${index}`} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                      [{warning.code}] {warning.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">경고 없음</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">아직 실행되지 않았습니다.</p>
          )}
        </Card>

        <Card data-testid="v3-preflight-changes">
          <h2 className="text-sm font-bold text-slate-900">Changes</h2>
          {result ? (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1 text-left">path</th>
                    <th className="px-2 py-1 text-left">kind</th>
                    <th className="px-2 py-1 text-left">before</th>
                    <th className="px-2 py-1 text-left">after</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.changes.map((change, index) => (
                    <tr key={`${change.path}:${index}`}>
                      <td className="px-2 py-1 font-mono">{change.path}</td>
                      <td className="px-2 py-1">{change.kind}</td>
                      <td className="px-2 py-1 font-mono">{stringifyValue(change.before)}</td>
                      <td className="px-2 py-1 font-mono">{stringifyValue(change.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">아직 실행되지 않았습니다.</p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

