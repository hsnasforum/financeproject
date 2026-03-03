"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type DraftDetail = {
  id: string;
  batchId: string;
  createdAt: string;
  draftPatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
    assumptions: string[];
    monthsConsidered: number;
  };
  evidence: {
    monthsUsed: string[];
    ymStats: Array<{
      ym: string;
      incomeKrw: number;
      expenseKrw: number;
      fixedExpenseKrw: number;
      variableExpenseKrw: number;
      debtExpenseKrw: number;
      transferKrw: number;
    }>;
    byCategoryStats: Array<{
      categoryId: string;
      totalKrw: number;
    }>;
    medians: {
      incomeKrw: number;
      expenseKrw: number;
      fixedExpenseKrw: number;
      variableExpenseKrw: number;
      debtExpenseKrw: number;
    };
    ruleCoverage: {
      total: number;
      override: number;
      rule: number;
      default: number;
      transfer: number;
    };
  };
  assumptions: string[];
  stats?: {
    months: number;
    transfersExcluded?: boolean;
    unassignedCount?: number;
  };
};

type DetailResponse = {
  ok: true;
  data: DraftDetail;
};

type ProfileOption = {
  profileId: string;
  name?: string;
  updatedAt?: string;
};

type ProfilesResponse = {
  ok: true;
  data: ProfileOption[];
};

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

type Props = {
  id: string;
  initialDraft?: DraftDetail | null;
  initialProfiles?: ProfileOption[];
  initialPreflight?: PreflightResult | null;
  disableAutoLoad?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatKrw(value: unknown): string {
  return `${asNumber(value).toLocaleString("ko-KR")}원`;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
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

function isDetailResponse(value: unknown): value is DetailResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return asString(value.data.id).length > 0 && asString(value.data.batchId).length > 0;
}

function isProfileOption(value: unknown): value is ProfileOption {
  if (!isRecord(value)) return false;
  return asString(value.profileId).length > 0;
}

function isProfilesResponse(value: unknown): value is ProfilesResponse {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) return false;
  return value.data.every(isProfileOption);
}

function isPreflightResponse(value: unknown): value is PreflightResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return Array.isArray(value.data.changes) && isRecord(value.data.summary);
}

export function ProfileDraftDetailClient({
  id,
  initialDraft = null,
  initialProfiles = [],
  initialPreflight = null,
  disableAutoLoad = false,
}: Props) {
  const [loading, setLoading] = useState(initialDraft === null && !disableAutoLoad);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftDetail | null>(initialDraft);
  const [profiles, setProfiles] = useState<ProfileOption[]>(initialProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(initialPreflight);

  const loadDetail = useCallback(async () => {
    if (disableAutoLoad) return;
    setLoading(true);
    setMessage("");
    try {
      const [detailResponse, profilesResponse] = await Promise.all([
        fetch(`/api/planning/v3/profile/drafts/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/planning/v3/profiles${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      const detailJson = await detailResponse.json().catch(() => null);
      const profilesJson = await profilesResponse.json().catch(() => null);

      if (!detailResponse.ok || !isDetailResponse(detailJson)) {
        setDraft(null);
        setMessage("초안 상세를 불러오지 못했습니다.");
        return;
      }

      setDraft(detailJson.data);
      setPreflight(null);

      if (profilesResponse.ok && isProfilesResponse(profilesJson)) {
        setProfiles(profilesJson.data);
      } else {
        setProfiles([]);
      }
    } catch {
      setDraft(null);
      setProfiles([]);
      setMessage("초안 상세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [disableAutoLoad, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const downloadPayload = useMemo(() => {
    if (!draft) return "";
    return JSON.stringify({
      id: draft.id,
      batchId: draft.batchId,
      createdAt: draft.createdAt,
      draftPatch: draft.draftPatch,
      evidence: draft.evidence,
      assumptions: draft.assumptions,
      ...(draft.stats ? { stats: draft.stats } : {}),
    }, null, 2);
  }, [draft]);

  function handleDownload() {
    if (!draft || !downloadPayload) return;
    const blob = new Blob([downloadPayload], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `profile-draft-${draft.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function handleCopy() {
    if (!downloadPayload) return;
    try {
      await navigator.clipboard.writeText(downloadPayload);
      setCopyMessage("JSON이 클립보드에 복사되었습니다.");
    } catch {
      setCopyMessage("복사에 실패했습니다.");
    }
  }

  async function runPreflight() {
    if (!draft || preflightRunning) return;
    setPreflightRunning(true);
    setMessage("");
    try {
      const csrf = readDevCsrfToken();
      const response = await fetch(`/api/planning/v3/profile/drafts/${encodeURIComponent(id)}/preflight`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
          ...(csrf ? { csrf } : {}),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isPreflightResponse(json)) {
        setPreflight(null);
        setMessage("프리플라이트 실행에 실패했습니다.");
        return;
      }
      setPreflight(json.data);
    } catch {
      setPreflight(null);
      setMessage("프리플라이트 실행에 실패했습니다.");
    } finally {
      setPreflightRunning(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Profile Draft Detail</h1>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href="/planning/v3/profile/drafts">
              Draft Center
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/batches">
              Batches
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/import/csv">
              CSV 업로드
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">초안 상세를 불러오는 중...</p>
          </Card>
        ) : null}

        {draft ? (
          <>
            <Card className="space-y-3" data-testid="v3-draft-meta">
              <h2 className="text-sm font-bold text-slate-900">Draft 메타</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">draftId</dt>
                  <dd className="font-mono text-xs">{draft.id}</dd>
                </div>
                <div>
                  <dt className="font-semibold">batchId</dt>
                  <dd className="font-mono text-xs">{draft.batchId}</dd>
                </div>
                <div>
                  <dt className="font-semibold">createdAt</dt>
                  <dd className="font-mono text-xs">{draft.createdAt}</dd>
                </div>
                <div>
                  <dt className="font-semibold">months</dt>
                  <dd>{draft.stats?.months ?? draft.draftPatch.monthsConsidered}</dd>
                </div>
                <div>
                  <dt className="font-semibold">월 소득</dt>
                  <dd>{formatKrw(draft.draftPatch.monthlyIncomeNet)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">월 필수지출</dt>
                  <dd>{formatKrw(draft.draftPatch.monthlyEssentialExpenses)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">월 재량지출</dt>
                  <dd>{formatKrw(draft.draftPatch.monthlyDiscretionaryExpenses)}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                <Button data-testid="v3-draft-download" onClick={handleDownload} size="sm" type="button">
                  초안 JSON 다운로드
                </Button>
                <Button data-testid="v3-draft-copy" onClick={() => { void handleCopy(); }} size="sm" type="button" variant="outline">
                  JSON 복사
                </Button>
                <Button onClick={() => { void loadDetail(); }} size="sm" type="button" variant="outline">
                  새로고침
                </Button>
              </div>
              {copyMessage ? <p className="text-xs font-semibold text-slate-600">{copyMessage}</p> : null}
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Preflight (Diff Only)</h2>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
                  기준 프로필 선택(읽기 전용)
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    data-testid="v3-draft-base-profile-picker"
                    onChange={(event) => setSelectedProfileId(event.currentTarget.value)}
                    value={selectedProfileId}
                  >
                    <option value="">선택 없음 (after-only)</option>
                    {profiles.map((profile) => (
                      <option key={profile.profileId} value={profile.profileId}>
                        {profile.name ? `${profile.name} (${profile.profileId})` : profile.profileId}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  data-testid="v3-draft-run-preflight"
                  disabled={preflightRunning}
                  onClick={() => {
                    void runPreflight();
                  }}
                  type="button"
                  variant="outline"
                >
                  {preflightRunning ? "프리플라이트 실행 중..." : "프리플라이트 실행"}
                </Button>
              </div>
            </Card>

            <Card data-testid="v3-preflight-summary">
              <h2 className="text-sm font-bold text-slate-900">Summary</h2>
              {preflight ? (
                <dl className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">targetProfileId</dt>
                    <dd className="font-mono text-xs">{preflight.targetProfileId ?? "(없음)"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">변경 수</dt>
                    <dd>{preflight.summary.changedCount}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">오류 수</dt>
                    <dd>{preflight.summary.errorCount}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">경고 수</dt>
                    <dd>{preflight.summary.warningCount}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-slate-600">아직 프리플라이트를 실행하지 않았습니다.</p>
              )}
            </Card>

            <Card data-testid="v3-preflight-errors">
              <h2 className="text-sm font-bold text-slate-900">Errors</h2>
              {preflight && preflight.errors.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-rose-700">
                  {preflight.errors.map((error, index) => (
                    <li className="rounded border border-rose-200 bg-rose-50 px-2 py-1" key={`${error.path}:${index}`}>
                      <span className="font-mono">{error.path}</span>: {error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600">에러 없음</p>
              )}
            </Card>

            <Card data-testid="v3-preflight-warnings">
              <h2 className="text-sm font-bold text-slate-900">Warnings</h2>
              {preflight && preflight.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  {preflight.warnings.map((warning, index) => (
                    <li className="rounded border border-amber-200 bg-amber-50 px-2 py-1" key={`${warning.code}:${index}`}>
                      [{warning.code}] {warning.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600">경고 없음</p>
              )}
            </Card>

            <Card data-testid="v3-preflight-changes">
              <h2 className="text-sm font-bold text-slate-900">Changes</h2>
              {preflight && preflight.changes.length > 0 ? (
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
                      {preflight.changes.map((change, index) => (
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
                <p className="mt-2 text-sm text-slate-600">변경 항목이 없습니다.</p>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
