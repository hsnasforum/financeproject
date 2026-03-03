"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
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

type EvidenceRow = {
  key: string;
  title: string;
  formula?: string;
  inputs: Record<string, number | string>;
  assumption?: string;
  note?: string;
};

type PreviewResponse = {
  ok: true;
  mergedProfile: Record<string, unknown>;
  diffSummary: {
    changedKeys: string[];
    notes: string[];
  };
  evidence?: EvidenceRow[];
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
  return value.map((row) => asString(row)).filter((row) => row.length > 0);
}

function isDraftDetail(payload: unknown): payload is DraftDetail {
  if (!isRecord(payload)) return false;
  if (!asString(payload.id) || !asString(payload.createdAt)) return false;
  if (!isRecord(payload.source) || payload.source.kind !== "csv") return false;
  if (!isRecord(payload.summary) || !Array.isArray(payload.cashflow) || !isRecord(payload.draftPatch)) return false;
  return true;
}

function isDraftDetailResponse(payload: unknown): payload is DraftDetailResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  return isDraftDetail(payload.draft);
}

function isProfileMeta(payload: unknown): payload is ProfileMeta {
  if (!isRecord(payload)) return false;
  return asString(payload.profileId).length > 0 && asString(payload.name).length > 0;
}

function isProfilesResponse(payload: unknown): payload is ProfilesResponse {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.data)) return false;
  return payload.data.every(isProfileMeta);
}

function isEvidenceRow(payload: unknown): payload is EvidenceRow {
  if (!isRecord(payload)) return false;
  if (!asString(payload.key) || !asString(payload.title)) return false;
  return isRecord(payload.inputs);
}

function isPreviewResponse(payload: unknown): payload is PreviewResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!isRecord(payload.mergedProfile) || !isRecord(payload.diffSummary)) return false;
  if (!Array.isArray(payload.diffSummary.changedKeys) || !Array.isArray(payload.diffSummary.notes)) return false;
  if (payload.evidence !== undefined) {
    if (!Array.isArray(payload.evidence) || !payload.evidence.every(isEvidenceRow)) return false;
  }
  return true;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
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

function mapChangedKeyLabel(key: string): string {
  const table: Record<string, string> = {
    monthlyIncomeNet: "월 소득",
    monthlyEssentialExpenses: "월 필수지출",
    monthlyDiscretionaryExpenses: "월 재량지출",
  };
  return table[key] ?? key;
}

function estimateDsrPct(profile: Record<string, unknown> | null): number | null {
  if (!profile) return null;
  const income = asNumber(profile.monthlyIncomeNet);
  if (income <= 0) return null;
  const debts = Array.isArray(profile.debts) ? profile.debts : [];
  const debtPayment = debts
    .map((row) => (isRecord(row) ? asNumber(row.minimumPayment) : 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
  return Math.round((debtPayment / income) * 10_000) / 100;
}

function pickPatchNumber(draftPatch: Record<string, unknown>, key: string): number {
  return asNumber(draftPatch[key]);
}

function renderEvidenceInputs(inputs: Record<string, number | string>): string {
  const entries = Object.entries(inputs)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 8)
    .map(([k, v]) => `${k}=${String(v)}`);
  return entries.join(", ") || "-";
}

export function DraftDetailClient({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mergedProfile, setMergedProfile] = useState<Record<string, unknown> | null>(null);
  const [diffSummary, setDiffSummary] = useState<{ changedKeys: string[]; notes: string[] } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);

  const mergedProfileJson = useMemo(
    () => (mergedProfile ? JSON.stringify(mergedProfile, null, 2) : ""),
    [mergedProfile],
  );

  const patchJson = useMemo(
    () => (draft ? JSON.stringify(draft.draftPatch, null, 2) : ""),
    [draft],
  );

  const patchIncome = draft ? pickPatchNumber(draft.draftPatch, "monthlyIncomeNet") : 0;
  const patchEssential = draft ? pickPatchNumber(draft.draftPatch, "monthlyEssentialExpenses") : 0;
  const patchDiscretionary = draft ? pickPatchNumber(draft.draftPatch, "monthlyDiscretionaryExpenses") : 0;
  const patchExpense = patchEssential + patchDiscretionary;
  const patchSurplus = patchIncome - patchExpense;
  const dsrEstimate = estimateDsrPct(mergedProfile);
  const createdFlag = searchParams.get("created") === "1";

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

        if (!disposed) {
          setDraft(draftJson.draft);
        }

        if (!profilesResponse.ok || !isProfilesResponse(profilesJson)) {
          if (!disposed) {
            setProfiles([]);
          }
          return;
        }

        if (!disposed) {
          setProfiles(profilesJson.data);
          const defaultId = asString(profilesJson.meta?.defaultProfileId);
          setSelectedProfileId(defaultId);
        }
      } catch {
        if (!disposed) {
          setDraft(null);
          setProfiles([]);
          setMessage("초안 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [id]);

  async function requestMergedPreview(): Promise<PreviewResponse | null> {
    setPreviewLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/planning/v3/draft/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          draftId: id,
          ...(selectedProfileId ? { baseProfileId: selectedProfileId } : {}),
          ...(evidence.length > 0 ? { evidence } : {}),
        })),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !isPreviewResponse(json)) {
        setMergedProfile(null);
        setDiffSummary(null);
        setMessage("적용 결과 미리보기에 실패했습니다.");
        return null;
      }

      setMergedProfile(json.mergedProfile);
      setDiffSummary({
        changedKeys: asStringArray(json.diffSummary.changedKeys),
        notes: asStringArray(json.diffSummary.notes),
      });
      setEvidence(Array.isArray(json.evidence) ? json.evidence : []);
      setMessage("적용 결과 미리보기를 생성했습니다.");
      return json;
    } catch {
      setMergedProfile(null);
      setDiffSummary(null);
      setMessage("적용 결과 미리보기에 실패했습니다.");
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExportMergedJson() {
    if (!draft) return;

    let previewPayload = mergedProfile;
    if (!previewPayload) {
      const created = await requestMergedPreview();
      if (!created) return;
      previewPayload = created.mergedProfile;
    }

    downloadJson(`profile-v2-draft-${draft.id}.json`, previewPayload);
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-draft-review-root">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Draft Review</h1>
          <div className="text-sm text-slate-600">id: <span className="font-mono">{id}</span></div>
          {createdFlag ? (
            <Badge data-testid="v3-draft-created-badge" variant="success">Draft created</Badge>
          ) : null}
          <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/drafts">
            목록으로 돌아가기
          </Link>
          {message ? <p className="text-sm font-semibold text-slate-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">초안을 불러오는 중...</p>
          </Card>
        ) : null}

        {draft ? (
          <>
            <Card className="space-y-3" data-testid="v3-draft-summary">
              <h2 className="text-sm font-bold text-slate-900">초안 요약</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">createdAt</dt><dd>{formatDateTime(draft.createdAt)}</dd></div>
                <div><dt className="font-semibold">months</dt><dd>{draft.source.months ?? "-"}</dd></div>
                <div><dt className="font-semibold">rows</dt><dd>{draft.source.rows ?? "-"}</dd></div>
                <div><dt className="font-semibold">월 소득(초안)</dt><dd>{formatKrw(patchIncome)}</dd></div>
                <div><dt className="font-semibold">월 지출(초안)</dt><dd>{formatKrw(patchExpense)}</dd></div>
                <div><dt className="font-semibold">월 잉여(초안)</dt><dd>{formatKrw(patchSurplus)}</dd></div>
                <div><dt className="font-semibold">DSR 추정</dt><dd>{dsrEstimate !== null ? `${dsrEstimate.toFixed(2)}%` : "-"}</dd></div>
                <div><dt className="font-semibold">medianIncome</dt><dd>{formatKrw(asNumber(draft.summary.medianIncomeKrw))}</dd></div>
                <div><dt className="font-semibold">avgNet</dt><dd>{formatKrw(asNumber(draft.summary.avgNetKrw))}</dd></div>
              </dl>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Merged Profile 미리보기</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  기준 프로필(선택)
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    onChange={(event) => {
                      setSelectedProfileId(event.currentTarget.value);
                      setMergedProfile(null);
                      setDiffSummary(null);
                    }}
                    value={selectedProfileId}
                  >
                    <option value="">기본 템플릿</option>
                    {profiles.map((profile) => (
                      <option key={profile.profileId} value={profile.profileId}>
                        {profile.name}{profile.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <Button
                    disabled={previewLoading}
                    onClick={() => {
                      void requestMergedPreview();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {previewLoading ? "미리보기 생성 중..." : "적용 결과 미리보기"}
                  </Button>
                  <Button
                    data-testid="v3-export-merged-json"
                    onClick={() => {
                      void handleExportMergedJson();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Export merged profile JSON
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3" data-testid="v3-draft-diff">
                {diffSummary ? (
                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="font-semibold text-slate-900">변경 요약</p>
                      {diffSummary.changedKeys.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {diffSummary.changedKeys.map((key) => (
                            <li key={key}>{mapChangedKeyLabel(key)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1">변경된 항목이 없습니다.</p>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">노트</p>
                      {diffSummary.notes.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {diffSummary.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1">노트가 없습니다.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">미리보기를 실행하면 변경 요약이 표시됩니다.</p>
                )}
              </div>

              {evidence.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Evidence</h3>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {evidence.map((row) => (
                      <li key={row.key}>
                        <p className="font-semibold">{row.title}</p>
                        {asString(row.formula) ? <p className="text-xs text-slate-600">{row.formula}</p> : null}
                        <p className="text-xs text-slate-600">{renderEvidenceInputs(row.inputs)}</p>
                        {asString(row.assumption) ? <p className="text-xs text-slate-500">assumption: {row.assumption}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {mergedProfileJson ? (
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: merged ProfileV2 JSON</summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {mergedProfileJson}
                  </pre>
                </details>
              ) : null}
            </Card>

            <details className="rounded-xl border border-slate-200 p-3" data-testid="v3-toggle-raw-patch">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: draft patch JSON</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {patchJson}
              </pre>
            </details>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
