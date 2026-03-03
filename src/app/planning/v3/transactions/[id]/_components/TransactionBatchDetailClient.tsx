"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type Batch = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  sha256?: string;
  total: number;
  ok: number;
  failed: number;
};

type SampleRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

type DetailResponse = {
  ok: true;
  batch: Batch;
  sample: SampleRow[];
  stats: {
    total: number;
    ok: number;
    failed: number;
    inferredMonths?: number;
  };
  monthsSummary: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
};

type CashflowResponse = {
  ok: true;
  monthly: Array<{
    month: string;
    inflowKrw: number;
    outflowKrw: number;
    netKrw: number;
    fixedOutflowKrw: number;
    variableOutflowKrw: number;
    daysCovered?: number;
    notes?: string[];
  }>;
  draftPatch: {
    suggestedMonthlyIncomeKrw: number;
    suggestedMonthlyEssentialSpendKrw: number;
    suggestedMonthlyDiscretionarySpendKrw: number;
    confidence: "high" | "mid" | "low";
    evidence: Array<{
      rule: string;
      valueKrw: number;
    }>;
  };
  profilePatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
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

type ApplyDiffRow = {
  field: string;
  label: string;
  beforeKrw: number;
  afterKrw: number;
};

type ApplyPreviewResponse = {
  ok: true;
  currentProfileSummary: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
    monthlySurplusKrw: number;
  };
  proposedSummary: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
    monthlySurplusKrw: number;
  };
  diffRows: ApplyDiffRow[];
  profilePatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
  evidence: Array<{
    rule: string;
    valueKrw: number;
  }>;
};

type ApplySaveResponse = {
  ok: true;
  savedProfileId: string;
  savedAt: string;
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

function isDetailResponse(payload: unknown): payload is DetailResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!isRecord(payload.batch) || !Array.isArray(payload.sample) || !isRecord(payload.stats) || !Array.isArray(payload.monthsSummary)) return false;
  return true;
}

function isCashflowResponse(payload: unknown): payload is CashflowResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!Array.isArray(payload.monthly) || !isRecord(payload.draftPatch) || !isRecord(payload.profilePatch)) return false;
  return true;
}

function isProfileMeta(payload: unknown): payload is ProfileMeta {
  if (!isRecord(payload)) return false;
  return asString(payload.profileId).length > 0 && asString(payload.name).length > 0;
}

function isProfilesResponse(payload: unknown): payload is ProfilesResponse {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.data)) return false;
  return payload.data.every(isProfileMeta);
}

function isApplyDiffRow(payload: unknown): payload is ApplyDiffRow {
  if (!isRecord(payload)) return false;
  if (!asString(payload.field) || !asString(payload.label)) return false;
  return Number.isFinite(Number(payload.beforeKrw)) && Number.isFinite(Number(payload.afterKrw));
}

function isApplyPreviewResponse(payload: unknown): payload is ApplyPreviewResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!isRecord(payload.currentProfileSummary) || !isRecord(payload.proposedSummary) || !isRecord(payload.profilePatch)) return false;
  if (!Array.isArray(payload.diffRows) || !payload.diffRows.every(isApplyDiffRow)) return false;
  if (!Array.isArray(payload.evidence)) return false;
  return true;
}

function isApplySaveResponse(payload: unknown): payload is ApplySaveResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  return asString(payload.savedProfileId).length > 0 && asString(payload.savedAt).length > 0;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function TransactionBatchDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [cashflowMessage, setCashflowMessage] = useState("");
  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [applyPreview, setApplyPreview] = useState<ApplyPreviewResponse | null>(null);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const batchMonthRange = useMemo(() => {
    const months = (detail?.monthsSummary ?? [])
      .map((row) => asString(row.ym))
      .filter((month) => /^\d{4}-\d{2}$/.test(month));
    if (months.length < 1) return "-";
    return `${months[0]} ~ ${months[months.length - 1]}`;
  }, [detail?.monthsSummary]);

  useEffect(() => {
    let disposed = false;

    async function loadDetail() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch(`/api/planning/v3/transactions/batches/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !isDetailResponse(payload)) {
          if (!disposed) {
            setDetail(null);
            setMessage("배치 상세를 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setDetail(payload);
        }
      } catch {
        if (!disposed) {
          setDetail(null);
          setMessage("배치 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    async function loadCashflow() {
      setCashflowLoading(true);
      setCashflowMessage("");

      try {
        const response = await fetch(`/api/planning/v3/transactions/batches/${encodeURIComponent(id)}/cashflow${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !isCashflowResponse(payload)) {
          if (!disposed) {
            setCashflow(null);
            setCashflowMessage("캐시플로우 집계를 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setCashflow(payload);
        }
      } catch {
        if (!disposed) {
          setCashflow(null);
          setCashflowMessage("캐시플로우 집계를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setCashflowLoading(false);
      }
    }

    async function loadProfiles() {
      try {
        const response = await fetch("/api/planning/profiles", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isProfilesResponse(payload)) {
          if (!disposed) {
            setProfiles([]);
            setApplyMessage("프로필 목록을 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setProfiles(payload.data);
          const defaultId = asString(payload.meta?.defaultProfileId);
          setSelectedProfileId(defaultId || payload.data[0]?.profileId || "");
        }
      } catch {
        if (!disposed) {
          setProfiles([]);
          setApplyMessage("프로필 목록을 불러오지 못했습니다.");
        }
      }
    }

    void loadDetail();
    void loadCashflow();
    void loadProfiles();

    return () => {
      disposed = true;
    };
  }, [id]);

  async function requestApplyPreview() {
    if (!selectedProfileId) {
      setApplyMessage("적용 대상 프로필을 선택해 주세요.");
      return;
    }

    setApplyPreviewLoading(true);
    setApplyMessage("");
    setApplyPreview(null);

    try {
      const response = await fetch("/api/planning/v3/draft/apply", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          batchId: id,
          mode: "preview",
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isApplyPreviewResponse(payload)) {
        setApplyPreview(null);
        setApplyMessage("적용 미리보기에 실패했습니다.");
        return;
      }

      setApplyPreview(payload);
      setApplyMessage("적용 미리보기를 생성했습니다.");
    } catch {
      setApplyPreview(null);
      setApplyMessage("적용 미리보기에 실패했습니다.");
    } finally {
      setApplyPreviewLoading(false);
    }
  }

  async function applyDraftToProfile() {
    if (!selectedProfileId || !applyPreview) {
      setApplyMessage("먼저 적용 미리보기를 실행해 주세요.");
      return;
    }

    setApplyLoading(true);
    setApplyMessage("");

    try {
      const response = await fetch("/api/planning/v3/draft/apply", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          profileId: selectedProfileId,
          batchId: id,
          mode: "apply",
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isApplySaveResponse(payload)) {
        setApplyMessage("프로필 저장에 실패했습니다.");
        return;
      }

      setConfirmOpen(false);
      setApplyMessage(`프로필 저장 완료: ${payload.savedProfileId} (${formatDateTime(payload.savedAt)})`);
      await requestApplyPreview();
    } catch {
      setApplyMessage("프로필 저장에 실패했습니다.");
    } finally {
      setApplyLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-batch-detail">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Batch Detail</h1>
          <p className="text-sm text-slate-600">id: <span className="font-mono">{id}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/transactions">
              배치 목록
            </Link>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/import">
              CSV Import
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">상세를 불러오는 중...</p>
          </Card>
        ) : null}

        {detail ? (
          <>
            <Card className="space-y-2" data-testid="v3-batch-meta">
              <h2 className="text-sm font-bold text-slate-900">업로드/집계 상태</h2>
              <p className="text-sm text-slate-700">
                총 거래 {asNumber(detail.stats.total).toLocaleString("ko-KR")}건 / 파싱 성공 {asNumber(detail.stats.ok).toLocaleString("ko-KR")}건 / 파싱 실패 {asNumber(detail.stats.failed).toLocaleString("ko-KR")}건
              </p>
              <p className="text-sm text-slate-700" data-testid="v3-batch-range">
                기간 {batchMonthRange}
              </p>
              {asNumber(detail.stats.failed) > 0 ? (
                <p className="text-xs font-semibold text-amber-700">
                  일부 행은 형식 불일치로 제외되었습니다. 컬럼 매핑/금액 형식을 확인해 주세요.
                </p>
              ) : (
                <p className="text-xs font-semibold text-emerald-700">
                  파싱 실패 없이 집계되었습니다.
                </p>
              )}
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Batch</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">createdAt</dt><dd>{formatDateTime(detail.batch.createdAt)}</dd></div>
                <div><dt className="font-semibold">file</dt><dd>{detail.batch.fileName ?? "-"}</dd></div>
                <div><dt className="font-semibold">sha256</dt><dd className="font-mono text-xs">{detail.batch.sha256 ?? "-"}</dd></div>
                <div><dt className="font-semibold">total</dt><dd>{asNumber(detail.batch.total).toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">ok</dt><dd>{asNumber(detail.batch.ok).toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">failed</dt><dd>{asNumber(detail.batch.failed).toLocaleString("ko-KR")}</dd></div>
              </dl>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Sample (Redacted)</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">line</th>
                      <th className="px-3 py-2 text-left">date</th>
                      <th className="px-3 py-2 text-right">amount</th>
                      <th className="px-3 py-2 text-left">desc(masked)</th>
                      <th className="px-3 py-2 text-left">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.sample.length > 0 ? detail.sample.map((row, index) => (
                      <tr key={`sample-${index}-${row.line}`}>
                        <td className="px-3 py-2 text-slate-800">{asNumber(row.line)}</td>
                        <td className="px-3 py-2 text-slate-800">{asString(row.dateIso) || "-"}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{Number.isFinite(Number(row.amountKrw)) ? formatKrw(asNumber(row.amountKrw)) : "-"}</td>
                        <td className="px-3 py-2 text-slate-700">{asString(row.descMasked) || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.ok ? "success" : "destructive"}>{row.ok ? "OK" : "FAIL"}</Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={5}>샘플이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">월별 요약</h2>
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
                    {detail.monthsSummary.length > 0 ? detail.monthsSummary.map((row) => (
                      <tr key={row.ym}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.ym}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.incomeKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.expenseKrw))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={5}>월별 요약이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {cashflowLoading ? (
              <Card>
                <p className="text-sm text-slate-600">재집계 캐시플로우를 계산하는 중...</p>
              </Card>
            ) : null}

            {cashflowMessage ? (
              <Card>
                <p className="text-sm font-semibold text-rose-700">{cashflowMessage}</p>
              </Card>
            ) : null}

            {cashflow ? (
              <>
                <Card className="space-y-3" data-testid="v3-cashflow-table">
                  <h2 className="text-sm font-bold text-slate-900">월별 캐시플로우 v2</h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">YYYY-MM</th>
                          <th className="px-3 py-2 text-right">inflow</th>
                          <th className="px-3 py-2 text-right">outflow</th>
                          <th className="px-3 py-2 text-right">net</th>
                          <th className="px-3 py-2 text-right">fixed</th>
                          <th className="px-3 py-2 text-right">variable</th>
                          <th className="px-3 py-2 text-right">days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cashflow.monthly.length > 0 ? cashflow.monthly.map((row) => (
                          <tr key={row.month}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.month}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.inflowKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.outflowKrw))}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.fixedOutflowKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.variableOutflowKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{typeof row.daysCovered === "number" ? row.daysCovered : "-"}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td className="px-3 py-2 text-slate-500" colSpan={7}>월별 캐시플로우가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="space-y-3" data-testid="v3-draftpatch-summary">
                  <h2 className="text-sm font-bold text-slate-900">초안 패치 요약</h2>
                  <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div><dt className="font-semibold">추천 월 소득</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyIncomeKrw))}</dd></div>
                    <div><dt className="font-semibold">추천 필수지출</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyEssentialSpendKrw))}</dd></div>
                    <div><dt className="font-semibold">추천 재량지출</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyDiscretionarySpendKrw))}</dd></div>
                    <div><dt className="font-semibold">confidence</dt><dd className="uppercase">{asString(cashflow.draftPatch.confidence) || "-"}</dd></div>
                  </dl>

                  <div className="space-y-2" data-testid="v3-draftpatch-evidence">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">evidence</h3>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {cashflow.draftPatch.evidence.length > 0 ? cashflow.draftPatch.evidence.map((item, index) => (
                        <li key={`evidence-${index}-${item.rule}`}>
                          {item.rule} = {formatKrw(asNumber(item.valueKrw))}
                        </li>
                      )) : (
                        <li>근거가 없습니다.</li>
                      )}
                    </ul>
                  </div>
                </Card>

                <Card className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">드래프트 적용</h2>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="v3-applydraft-profile-select">
                      적용 대상 프로필
                    </label>
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      data-testid="v3-applydraft-profile-select"
                      id="v3-applydraft-profile-select"
                      onChange={(event) => {
                        setSelectedProfileId(event.target.value);
                        setApplyPreview(null);
                      }}
                      value={selectedProfileId}
                    >
                      {profiles.length > 0 ? profiles.map((profile) => (
                        <option key={profile.profileId} value={profile.profileId}>
                          {profile.name}{profile.isDefault ? " (default)" : ""}
                        </option>
                      )) : (
                        <option value="">프로필 없음</option>
                      )}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      data-testid="v3-applydraft-preview"
                      disabled={!selectedProfileId || applyPreviewLoading}
                      onClick={() => {
                        void requestApplyPreview();
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {applyPreviewLoading ? "미리보기 생성 중..." : "미리보기"}
                    </Button>

                    <Button
                      data-testid="v3-applydraft-apply"
                      disabled={!applyPreview || applyLoading}
                      onClick={() => {
                        setConfirmOpen(true);
                      }}
                      size="sm"
                      type="button"
                    >
                      {applyLoading ? "적용 중..." : "적용"}
                    </Button>
                  </div>

                  {applyMessage ? <p className="text-sm font-semibold text-slate-700">{applyMessage}</p> : null}

                  {applyPreview ? (
                    <>
                      <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                        <Card className="space-y-1 border border-slate-200 p-3">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">현재 요약</h3>
                          <p>월소득: {formatKrw(asNumber(applyPreview.currentProfileSummary.monthlyIncomeNet))}</p>
                          <p>필수지출: {formatKrw(asNumber(applyPreview.currentProfileSummary.monthlyEssentialExpenses))}</p>
                          <p>재량지출: {formatKrw(asNumber(applyPreview.currentProfileSummary.monthlyDiscretionaryExpenses))}</p>
                          <p>월잉여: {formatKrw(asNumber(applyPreview.currentProfileSummary.monthlySurplusKrw))}</p>
                        </Card>
                        <Card className="space-y-1 border border-slate-200 p-3">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">적용 후 요약</h3>
                          <p>월소득: {formatKrw(asNumber(applyPreview.proposedSummary.monthlyIncomeNet))}</p>
                          <p>필수지출: {formatKrw(asNumber(applyPreview.proposedSummary.monthlyEssentialExpenses))}</p>
                          <p>재량지출: {formatKrw(asNumber(applyPreview.proposedSummary.monthlyDiscretionaryExpenses))}</p>
                          <p>월잉여: {formatKrw(asNumber(applyPreview.proposedSummary.monthlySurplusKrw))}</p>
                        </Card>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-applydraft-diff-table">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">항목</th>
                              <th className="px-3 py-2 text-right">변경 전</th>
                              <th className="px-3 py-2 text-right">변경 후</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {applyPreview.diffRows.length > 0 ? applyPreview.diffRows.map((row) => (
                              <tr key={`${row.field}-${row.label}`}>
                                <td className="px-3 py-2 text-slate-800">{row.label}</td>
                                <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.beforeKrw))}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.afterKrw))}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td className="px-3 py-2 text-slate-500" colSpan={3}>변경 항목이 없습니다.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">evidence</h3>
                        <ul className="space-y-1 text-sm text-slate-700">
                          {applyPreview.evidence.length > 0 ? applyPreview.evidence.map((item, index) => (
                            <li key={`apply-evidence-${index}-${item.rule}`}>
                              {item.rule} = {formatKrw(asNumber(item.valueKrw))}
                            </li>
                          )) : (
                            <li>근거가 없습니다.</li>
                          )}
                        </ul>
                      </div>

                      <details className="rounded-xl border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: profilePatch JSON</summary>
                        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                          {JSON.stringify(applyPreview.profilePatch, null, 2)}
                        </pre>
                      </details>
                    </>
                  ) : null}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-md space-y-4">
            <h2 className="text-base font-bold text-slate-900">프로필 변경 확인</h2>
            <p className="text-sm text-slate-700">이 작업은 v2 프로필을 변경합니다. 계속할까요?</p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setConfirmOpen(false);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                취소
              </Button>
              <Button
                data-testid="v3-applydraft-confirm"
                disabled={applyLoading}
                onClick={() => {
                  void applyDraftToProfile();
                }}
                size="sm"
                type="button"
              >
                확인 후 적용
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
