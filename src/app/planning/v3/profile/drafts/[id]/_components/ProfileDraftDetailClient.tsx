"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type ApplyProfileResponse = {
  ok: true;
  data: {
    profileId: string;
  };
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

function isApplyProfileResponse(value: unknown): value is ApplyProfileResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return asString(value.data.profileId).length > 0;
}

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
  const [applyRunning, setApplyRunning] = useState(false);
  const [applyResult, setApplyResult] = useState("");
  const normalizedSelectedProfileId = asString(selectedProfileId);
  const normalizedPreflightTargetProfileId = asString(preflight?.targetProfileId);
  const preflightFailed = preflight?.ok === false;
  const preflightMatchesSelection = Boolean(preflight) && normalizedPreflightTargetProfileId === normalizedSelectedProfileId;
  const preflightHasErrors = (preflight?.errors.length ?? 0) > 0;
  const applyBlocked = applyRunning || preflightRunning || !preflight || preflightFailed || !preflightMatchesSelection || preflightHasErrors;
  const applyGuidance = !preflight
    ? "프리플라이트를 먼저 실행하면 이 기준으로 적용 가능 여부가 정리됩니다."
    : preflightFailed
      ? "프리플라이트 실행이 실패했습니다. 같은 기준으로 다시 실행해 주세요."
      : !preflightMatchesSelection
      ? "기준 프로필이 바뀌어 프리플라이트를 다시 실행해야 합니다."
      : preflightHasErrors
        ? "오류가 있어 아직 적용할 수 없습니다."
        : preflight.summary.changedCount < 1
          ? "변경 항목이 없어도 새 프로필은 생성됩니다. 그대로 적용할지 다시 확인해 주세요."
          : preflight.summary.warningCount > 0
            ? "경고를 확인한 뒤 적용할 수 있습니다."
            : "오류 없음. 이 기준으로 프로필 생성(초안 적용)을 진행할 수 있습니다.";

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
      setApplyResult("");

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
    setApplyResult("");
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
        setPreflight(createFailedPreflight(normalizedSelectedProfileId));
        setMessage("프리플라이트 실행에 실패했습니다.");
        return;
      }
      setPreflight(json.data);
    } catch {
      setPreflight(createFailedPreflight(normalizedSelectedProfileId));
      setMessage("프리플라이트 실행에 실패했습니다.");
    } finally {
      setPreflightRunning(false);
    }
  }

  async function applyProfileDraft() {
    if (!draft || applyRunning) return;
    setApplyRunning(true);
    setApplyResult("");
    setMessage("");

    try {
      const csrf = readDevCsrfToken();
      const response = await fetch(`/api/planning/v3/profile/drafts/${encodeURIComponent(id)}/apply`, {
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
      if (!response.ok || !isApplyProfileResponse(json)) {
        const serverMessage = isRecord(json) && isRecord(json.error)
          ? asString(json.error.message)
          : "";
        setApplyResult(serverMessage || "프로필 생성에 실패했습니다.");
        return;
      }

      const newProfileId = json.data.profileId;
      setApplyResult("프로필 생성이 완료되어 planning 화면으로 이동합니다.");
      window.location.href = `/planning?profileId=${encodeURIComponent(newProfileId)}`;
    } catch {
      setApplyResult("프로필 생성에 실패했습니다.");
    } finally {
      setApplyRunning(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Profile Draft Detail</h1>
          <div className={bodyActionLinkGroupClassName}>
            <BodyActionLink href="/planning/v3/profile/drafts">
              초안 목록
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/batches">
              배치 센터
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/import/csv">
              CSV 업로드
            </BodyActionLink>
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
              <BodySectionHeading title="Draft 메타" />
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
              <BodySectionHeading
                description="기준 프로필을 선택해 적용 전에 오류, 경고, 변경 항목을 먼저 확인합니다."
                title="Preflight (Diff Only)"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
                  기준 프로필 선택(읽기 전용)
                  <select
                    className={bodyFieldClassName}
                    data-testid="v3-draft-base-profile-picker"
                    onChange={(event) => {
                      setSelectedProfileId(event.currentTarget.value);
                      setPreflight(null);
                      setApplyResult("");
                      setMessage("");
                    }}
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
                <Button
                  data-testid="v3-draft-apply-profile"
                  disabled={applyBlocked}
                  onClick={() => {
                    void applyProfileDraft();
                  }}
                  type="button"
                >
                  {applyRunning ? "프로필 생성 중..." : "프로필 생성(초안 적용)"}
                </Button>
              </div>
              <p
                className={`text-xs font-semibold ${preflightMatchesSelection && !preflightHasErrors ? "text-slate-600" : "text-amber-700"}`}
                data-testid="v3-draft-apply-guidance"
              >
                {applyGuidance}
              </p>
              {applyResult ? (
                <p
                  className={`text-sm font-semibold ${applyResult.includes("실패") ? "text-rose-700" : "text-emerald-700"}`}
                  data-testid="v3-draft-apply-result"
                >
                  {applyResult}
                </p>
              ) : null}
            </Card>

            <Card className="space-y-3" data-testid="v3-preflight-summary">
              <BodySectionHeading title="Summary" />
              {preflight ? (
                preflight.ok ? (
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
                  <BodyEmptyState
                    description="실행이 실패해 요약을 만들지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                    title="프리플라이트 실행 실패"
                  />
                )
              ) : (
                <BodyEmptyState
                  description="프리플라이트를 실행하면 변경 수와 경고 수가 먼저 요약됩니다."
                  title="아직 프리플라이트를 실행하지 않았습니다."
                />
              )}
            </Card>

            <Card className="space-y-3" data-testid="v3-preflight-errors">
              <BodySectionHeading title="Errors" />
              {preflight ? (
                preflight.ok ? (
                  preflight.errors.length > 0 ? (
                    <ul className="space-y-2 text-xs text-rose-700">
                      {preflight.errors.map((error, index) => (
                        <li key={`${error.path}:${index}`}>
                          <BodyStatusInset className="text-left" tone="danger">
                            <span className="font-mono">{error.path}</span>: {error.message}
                          </BodyStatusInset>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <BodyEmptyState description="현재 선택 기준으로는 적용을 막는 오류가 없습니다." title="에러 없음" />
                  )
                ) : (
                  <BodyEmptyState
                    description="실행이 완료되지 않아 오류 목록을 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                    title="프리플라이트 실행 실패"
                  />
                )
              ) : (
                <BodyEmptyState description="프리플라이트를 실행하면 적용을 막는 오류가 이 영역에 정리됩니다." title="아직 프리플라이트를 실행하지 않았습니다." />
              )}
            </Card>

            <Card className="space-y-3" data-testid="v3-preflight-warnings">
              <BodySectionHeading title="Warnings" />
              {preflight ? (
                preflight.ok ? (
                  preflight.warnings.length > 0 ? (
                    <ul className="space-y-2 text-xs text-amber-700">
                      {preflight.warnings.map((warning, index) => (
                        <li key={`${warning.code}:${index}`}>
                          <BodyStatusInset className="text-left" tone="warning">
                            [{warning.code}] {warning.message}
                          </BodyStatusInset>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <BodyEmptyState description="현재 기준에서는 별도 확인이 필요한 경고가 없습니다." title="경고 없음" />
                  )
                ) : (
                  <BodyEmptyState
                    description="실행이 완료되지 않아 경고 목록을 보여주지 못했습니다. 메시지를 확인한 뒤 다시 실행해 주세요."
                    title="프리플라이트 실행 실패"
                  />
                )
              ) : (
                <BodyEmptyState description="프리플라이트를 실행하면 검토가 필요한 경고가 이 영역에 정리됩니다." title="아직 프리플라이트를 실행하지 않았습니다." />
              )}
            </Card>

            <Card className="space-y-3" data-testid="v3-preflight-changes">
              <BodySectionHeading title="Changes" />
              {preflight ? (
                preflight.ok ? (
                  preflight.changes.length > 0 ? (
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
                <BodyEmptyState description="프리플라이트를 실행하면 적용 시 바뀌는 항목이 이 영역에 정리됩니다." title="아직 프리플라이트를 실행하지 않았습니다." />
              )}
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
