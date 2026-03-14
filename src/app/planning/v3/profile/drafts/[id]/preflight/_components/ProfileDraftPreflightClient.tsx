"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  bodyActionLinkGroupClassName,
  BodyEmptyState,
  BodyStatusInset,
  BodySectionHeading,
  BodyTableFrame,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
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
  initialResult?: PreflightResult | null;
};

function createFailedPreflight(targetProfileId: string): PreflightResult {
  return {
    ok: false,
    ...(targetProfileId ? { targetProfileId } : {}),
    changes: [],
    warnings: [],
    errors: [],
    summary: {
      changedCount: 0,
      errorCount: 0,
      warningCount: 0,
    },
  };
}

export function ProfileDraftPreflightClient({ id, initialProfileId = "", initialResult = null }: Props) {
  const [profileId, setProfileId] = useState(initialProfileId);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PreflightResult | null>(initialResult);

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
        setResult(createFailedPreflight(profileId.trim()));
        setMessage("프리플라이트 실행에 실패했습니다.");
        return;
      }
      setResult(json.data);
      setMessage("");
    } catch {
      setResult(createFailedPreflight(profileId.trim()));
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
          <div className={bodyActionLinkGroupClassName}>
            <BodyActionLink href={`/planning/v3/profile/drafts/${encodeURIComponent(id)}`}>
              초안 상세
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/profile/drafts">
              초안 목록
            </BodyActionLink>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
              프로필 선택
              <input
                className={bodyFieldClassName}
                placeholder="profileId (선택)"
                value={profileId}
                onChange={(event) => {
                  setProfileId(event.target.value);
                  setResult(null);
                  setMessage("");
                }}
              />
            </label>
            <Button type="button" onClick={() => { void runPreflight(); }} disabled={running}>
              {running ? "실행 중..." : "프리플라이트 실행"}
            </Button>
            <BodyActionLink className="text-xs text-slate-600" href={queryHref}>
              URL 반영
            </BodyActionLink>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {result ? (
          <Card className="space-y-3" data-testid="v3-preflight-summary">
            <BodySectionHeading title="Summary" />
            {result.ok ? (
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
            ) : (
              <BodyEmptyState
                description="실행이 실패해 요약을 만들지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                title="프리플라이트 실행 실패"
              />
            )}
          </Card>
        ) : null}

        <Card className="space-y-3" data-testid="v3-preflight-errors">
          <BodySectionHeading
            description="적용을 막는 오류와, 적용 전에 확인만 하면 되는 경고를 같이 보여줍니다."
            title="Errors / Warnings"
          />
          {result ? (
            result.ok ? (
              <div className="space-y-3 text-xs">
                {result.errors.length > 0 ? (
                  <ul className="space-y-2 text-rose-700">
                    {result.errors.map((error, index) => (
                      <li key={`${error.path}:${index}`}>
                        <BodyStatusInset className="text-left" tone="danger">
                          <span className="font-mono">{error.path}</span>: {error.message}
                        </BodyStatusInset>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <BodyEmptyState description="현재 선택 기준으로는 적용을 막는 오류가 없습니다." title="에러 없음" />
                )}

                {result.warnings.length > 0 ? (
                  <ul className="space-y-2 text-amber-700">
                    {result.warnings.map((warning, index) => (
                      <li key={`${warning.code}:${index}`}>
                        <BodyStatusInset className="text-left" tone="warning">
                          [{warning.code}] {warning.message}
                        </BodyStatusInset>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <BodyEmptyState description="지금 기준에서는 따로 확인할 경고가 없습니다." title="경고 없음" />
                )}
              </div>
            ) : (
              <BodyEmptyState
                description="실행이 완료되지 않아 오류와 경고를 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                title="프리플라이트 실행 실패"
              />
            )
          ) : (
            <BodyEmptyState description="프리플라이트를 실행하면 오류와 경고가 이 영역에 정리됩니다." title="아직 실행되지 않았습니다." />
          )}
        </Card>

        <Card className="space-y-3" data-testid="v3-preflight-changes">
          <BodySectionHeading
            description="적용 시 바뀌는 항목을 before/after 기준으로 비교합니다."
            title="Changes"
          />
          {result ? (
            result.ok ? (
              result.changes.length > 0 ? (
                <BodyTableFrame>
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
                </BodyTableFrame>
              ) : (
                <BodyEmptyState description="이번 초안은 선택한 기준 프로필 대비 바뀌는 항목이 없습니다." title="변경 항목이 없습니다." />
              )
            ) : (
              <BodyEmptyState
                description="실행이 완료되지 않아 변경 항목을 계산하지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                title="프리플라이트 실행 실패"
              />
            )
          ) : (
            <BodyEmptyState description="프리플라이트를 실행하면 변경 후보가 표로 정리됩니다." title="아직 실행되지 않았습니다." />
          )}
        </Card>
      </div>
    </PageShell>
  );
}
