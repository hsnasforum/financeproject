"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type DraftDetail = {
  id: string;
  createdAt: string;
  source: {
    kind: "csv";
    filename?: string;
    rows?: number;
    months?: number;
  };
  summary: {
    medianIncomeKrw?: number;
    medianExpenseKrw?: number;
    avgNetKrw?: number;
    notes?: string[];
  };
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: Record<string, unknown>;
};

type DraftDetailResponse = {
  ok: true;
  draft: DraftDetail;
};

type ProfileMeta = {
  profileId: string;
  name: string;
  isDefault?: boolean;
};

type ProfilesResponse = {
  ok: true;
  data: ProfileMeta[];
  meta?: {
    defaultProfileId?: string;
  };
};

type ApplyPreviewSummary = {
  changedFields: string[];
  notes: string[];
};

type ApplyPreviewResponse = {
  ok: true;
  summary: ApplyPreviewSummary;
  mergedProfile: Record<string, unknown>;
};

type CreateProfileResponse = {
  ok: true;
  profileId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asString(row))
    .filter((row) => row.length > 0);
}

function isDraftDetail(payload: unknown): payload is DraftDetail {
  if (!isRecord(payload)) return false;
  if (!asString(payload.id) || !asString(payload.createdAt)) return false;
  if (!isRecord(payload.source) || payload.source.kind !== "csv") return false;
  if (!isRecord(payload.summary) || !Array.isArray(payload.cashflow) || !isRecord(payload.draftPatch)) return false;
  return true;
}

function isDraftDetailResponse(payload: unknown): payload is DraftDetailResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  return isDraftDetail(payload.draft);
}

function isProfileMeta(payload: unknown): payload is ProfileMeta {
  if (!isRecord(payload)) return false;
  if (!asString(payload.profileId) || !asString(payload.name)) return false;
  return true;
}

function isProfilesResponse(payload: unknown): payload is ProfilesResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true || !Array.isArray(payload.data)) return false;
  return payload.data.every(isProfileMeta);
}

function isApplyPreviewResponse(payload: unknown): payload is ApplyPreviewResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  if (!isRecord(payload.summary) || !isRecord(payload.mergedProfile)) return false;
  return Array.isArray(payload.summary.changedFields) && Array.isArray(payload.summary.notes);
}

function isCreateProfileResponse(payload: unknown): payload is CreateProfileResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  return asString(payload.profileId).length > 0;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function readCsrfToken(): string {
  return readDevCsrfToken();
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function downloadJson(filename: string, payload: unknown): void {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DraftDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [applySummary, setApplySummary] = useState<ApplyPreviewSummary | null>(null);
  const [mergedProfile, setMergedProfile] = useState<Record<string, unknown> | null>(null);

  const mergedProfileJson = useMemo(
    () => (mergedProfile ? JSON.stringify(mergedProfile, null, 2) : ""),
    [mergedProfile],
  );

  useEffect(() => {
    let disposed = false;

    async function load() {
      setLoading(true);
      setMessage("");

      try {
        const [draftResponse, profilesResponse] = await Promise.all([
          fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/planning/profiles", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

        const draftJson = await draftResponse.json().catch(() => null);
        const profilesJson = await profilesResponse.json().catch(() => null);

        if (!draftResponse.ok || !isDraftDetailResponse(draftJson)) {
          if (!disposed) {
            setDraft(null);
            setMessage("초안 상세를 불러오지 못했습니다.");
          }
          return;
        }

        if (!profilesResponse.ok || !isProfilesResponse(profilesJson)) {
          if (!disposed) {
            setDraft(draftJson.draft);
            setProfiles([]);
            setMessage("프로필 목록을 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setDraft(draftJson.draft);
          setProfiles(profilesJson.data);
          const defaultId = asString(profilesJson.meta?.defaultProfileId);
          const firstId = profilesJson.data[0]?.profileId ?? "";
          setSelectedProfileId(defaultId || firstId);
        }
      } catch {
        if (!disposed) {
          setDraft(null);
          setProfiles([]);
          setMessage("초안 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [id]);

  async function requestPreview(): Promise<ApplyPreviewResponse | null> {
    if (!selectedProfileId) {
      setMessage("적용 대상 프로필을 선택해 주세요.");
      return null;
    }

    setPreviewLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams();
      params.set("profileId", selectedProfileId);
      const csrf = readCsrfToken();
      if (csrf) params.set("csrf", csrf);

      const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}/preview-apply?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isApplyPreviewResponse(json)) {
        setApplySummary(null);
        setMergedProfile(null);
        setMessage("적용 미리보기에 실패했습니다.");
        return null;
      }

      setApplySummary({
        changedFields: asStringArray(json.summary.changedFields),
        notes: asStringArray(json.summary.notes),
      });
      setMergedProfile(json.mergedProfile);
      setMessage("적용 미리보기를 생성했습니다.");
      return json;
    } catch {
      setApplySummary(null);
      setMergedProfile(null);
      setMessage("적용 미리보기에 실패했습니다.");
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSaveAsNewProfile() {
    if (!selectedProfileId) {
      setMessage("적용 대상 프로필을 선택해 주세요.");
      return;
    }

    if (!window.confirm("선택한 프로필 기준으로 새 프로필을 생성할까요?")) return;

    setSaveLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}/create-profile`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          baseProfileId: selectedProfileId,
        })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isCreateProfileResponse(json)) {
        setMessage("새 프로필 저장에 실패했습니다.");
        return;
      }
      window.location.href = `/planning?profileId=${encodeURIComponent(json.profileId)}`;
    } catch {
      setMessage("새 프로필 저장에 실패했습니다.");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDownloadMergedProfile() {
    if (!draft) return;

    let payload = mergedProfile;
    if (!payload) {
      const preview = await requestPreview();
      if (!preview) return;
      payload = preview.mergedProfile;
    }

    downloadJson(`profile-v2-merged-${draft.id}.json`, payload);
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-draft-detail">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Draft Detail</h1>
          <div className="text-sm text-slate-600">id: <span className="font-mono">{id}</span></div>
          <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/drafts">
            목록으로 돌아가기
          </Link>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">초안을 불러오는 중...</p>
          </Card>
        ) : null}

        {draft ? (
          <>
            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Summary</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">createdAt</dt><dd>{formatDateTime(draft.createdAt)}</dd></div>
                <div><dt className="font-semibold">months</dt><dd>{draft.source.months ?? "-"}</dd></div>
                <div><dt className="font-semibold">rows</dt><dd>{draft.source.rows ?? "-"}</dd></div>
                <div><dt className="font-semibold">medianIncome</dt><dd>{formatKrw(asNumber(draft.summary.medianIncomeKrw))}</dd></div>
                <div><dt className="font-semibold">medianExpense</dt><dd>{formatKrw(asNumber(draft.summary.medianExpenseKrw))}</dd></div>
                <div><dt className="font-semibold">avgNet</dt><dd>{formatKrw(asNumber(draft.summary.avgNetKrw))}</dd></div>
              </dl>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">ProfileV2 수동 적용</h2>

              <label className="block text-sm font-semibold text-slate-700">
                적용 대상 프로필
                <select
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  data-testid="v3-apply-profile-select"
                  onChange={(event) => {
                    setSelectedProfileId(event.currentTarget.value);
                    setApplySummary(null);
                    setMergedProfile(null);
                  }}
                  value={selectedProfileId}
                >
                  <option value="">선택</option>
                  {profiles.map((profile) => (
                    <option key={profile.profileId} value={profile.profileId}>
                      {profile.name}{profile.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  data-testid="v3-apply-preview"
                  disabled={previewLoading || !selectedProfileId}
                  onClick={() => {
                    void requestPreview();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {previewLoading ? "미리보기 생성 중..." : "적용 미리보기"}
                </Button>

                <Button
                  data-testid="v3-apply-save-new"
                  disabled={saveLoading || !selectedProfileId}
                  onClick={() => {
                    void handleSaveAsNewProfile();
                  }}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  {saveLoading ? "저장 중..." : "새 프로필로 저장"}
                </Button>

                <Button
                  data-testid="v3-apply-download"
                  disabled={!selectedProfileId}
                  onClick={() => {
                    void handleDownloadMergedProfile();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  다운로드(merged ProfileV2.json)
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 p-3" data-testid="v3-apply-summary">
                {applySummary ? (
                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="font-semibold text-slate-900">changedFields</p>
                      {applySummary.changedFields.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {applySummary.changedFields.map((field) => (
                            <li key={field}>{field}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-600">변경된 필드가 없습니다.</p>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">notes</p>
                      {applySummary.notes.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {applySummary.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-600">노트가 없습니다.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">적용 미리보기를 실행하면 요약이 표시됩니다.</p>
                )}
              </div>

              {mergedProfileJson ? (
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: merged ProfileV2 JSON</summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {mergedProfileJson}
                  </pre>
                </details>
              ) : null}
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Cashflow</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">YYYY-MM</th>
                      <th className="px-3 py-2 text-right">income</th>
                      <th className="px-3 py-2 text-right">expense</th>
                      <th className="px-3 py-2 text-right">net</th>
                      <th className="px-3 py-2 text-right">txCount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.cashflow.map((row) => (
                      <tr key={row.ym}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.ym}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.incomeKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.expenseKrw))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
