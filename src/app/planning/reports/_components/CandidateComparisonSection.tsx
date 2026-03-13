"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  reportHeroMetaChipClassName,
  reportSurfaceButtonClassName,
  reportSurfaceDetailClassName,
  reportSurfaceFieldClassName,
  reportSurfaceInsetClassName,
  reportSurfaceTableFrameClassName,
} from "@/components/ui/ReportTone";
import {
  computeCandidateComparison,
  type CandidateComparisonRow,
} from "@/lib/planning/candidates/comparison";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type CandidateRecommendationsPayload } from "../_lib/recommendationSignals";

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type Props = {
  runId: string;
  showEstimateEvidence?: boolean;
  payload?: CandidateRecommendationsPayload | null;
  payloadLoading?: boolean;
  payloadError?: string;
};

function asFiniteNumber(value: unknown, fallback: number): number {
  const normalized = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function formatGroupedIntegerInput(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.trunc(value)));
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return "후보 비교 데이터를 불러오지 못했습니다.";
}

function renderEvidenceInputValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("ko-KR");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return "-";
}

function sortRows(rows: CandidateComparisonRow[], mode: string): CandidateComparisonRow[] {
  const copied = [...rows];
  if (mode === "rate_desc") {
    copied.sort((a, b) => b.baseRatePct - a.baseRatePct);
    return copied;
  }
  if (mode === "net_interest_desc") {
    copied.sort((a, b) => b.estimate.netInterestKrw - a.estimate.netInterestKrw);
    return copied;
  }
  if (mode === "term_asc") {
    copied.sort((a, b) => a.appliedTermMonths - b.appliedTermMonths);
    return copied;
  }
  copied.sort((a, b) => a.providerName.localeCompare(b.providerName, "ko-KR"));
  return copied;
}

export default function CandidateComparisonSection({
  runId,
  showEstimateEvidence = true,
  payload: sharedPayload,
  payloadLoading,
  payloadError,
}: Props) {
  const PAGE_SIZE = 5;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<CandidateRecommendationsPayload | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "deposit" | "saving">("all");
  const [goalId, setGoalId] = useState("");
  const [sortBy, setSortBy] = useState("rate_desc");
  const [minRatePct, setMinRatePct] = useState("0");
  const [amountKrw, setAmountKrw] = useState("10000000");
  const [taxRatePct, setTaxRatePct] = useState("15.4");
  const [page, setPage] = useState(1);
  const usesSharedPayload = payloadLoading !== undefined || payloadError !== undefined || sharedPayload !== undefined;
  const effectiveLoading = usesSharedPayload ? Boolean(payloadLoading) : loading;
  const effectiveError = usesSharedPayload ? payloadError ?? "" : error;
  const effectivePayload = usesSharedPayload ? sharedPayload ?? null : payload;

  useEffect(() => {
    if (usesSharedPayload) return;
    let active = true;

    async function loadCandidates(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/candidates?runId=${encodeURIComponent(runId)}&kind=all&limit=80`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as ApiResponse<CandidateRecommendationsPayload> | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? "후보 비교 데이터를 불러오지 못했습니다.");
        }
        setPayload(body.data);
        setAmountKrw(formatGroupedIntegerInput(body.data.defaults.amountKrw));
        setTaxRatePct(String(body.data.defaults.taxRatePct));
      } catch (loadError) {
        if (!active) return;
        setPayload(null);
        setError(normalizeErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCandidates();
    return () => {
      active = false;
    };
  }, [runId, usesSharedPayload]);

  const selectedGoal = useMemo(() => {
    if (!effectivePayload) return undefined;
    if (!goalId) return undefined;
    return effectivePayload.goals.find((goal) => goal.id === goalId);
  }, [effectivePayload, goalId]);

  const comparedRows = useMemo(() => {
    if (!effectivePayload) return [];
    const minRate = Math.max(0, asFiniteNumber(minRatePct, 0));
    const filtered = effectivePayload.candidates.filter((candidate) => {
      if (kindFilter !== "all" && candidate.kind !== kindFilter) return false;
      if (candidate.baseRatePct < minRate) return false;
      return true;
    });
    const compared = computeCandidateComparison(
      effectivePayload.profileContext,
      selectedGoal,
      filtered,
      {
        amountKrw: Math.max(100_000, asFiniteNumber(amountKrw, effectivePayload.defaults.amountKrw)),
        taxRatePct: Math.max(0, Math.min(100, asFiniteNumber(taxRatePct, effectivePayload.defaults.taxRatePct))),
        fallbackTermMonths: effectivePayload.defaults.termMonths,
      },
    );
    return sortRows(compared, sortBy);
  }, [amountKrw, effectivePayload, kindFilter, minRatePct, selectedGoal, sortBy, taxRatePct]);

  useEffect(() => {
    setPage(1);
  }, [amountKrw, goalId, kindFilter, minRatePct, sortBy, taxRatePct, runId]);

  const totalPages = Math.max(1, Math.ceil(comparedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return comparedRows.slice(start, start + PAGE_SIZE);
  }, [comparedRows, currentPage, PAGE_SIZE]);
  const pageStart = comparedRows.length < 1 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = comparedRows.length < 1 ? 0 : Math.min(comparedRows.length, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!effectivePayload) return;
    setAmountKrw(formatGroupedIntegerInput(effectivePayload.defaults.amountKrw));
    setTaxRatePct(String(effectivePayload.defaults.taxRatePct));
  }, [effectivePayload]);

  return (
    <Card className="space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-xl" data-testid="candidate-comparison-section" id="candidate-comparison-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Candidate Compare</p>
          <h2 className="mt-1 text-base font-bold text-white">상품 후보 비교</h2>
          <p className="mt-1 text-xs text-white/72">추천이 아닌 비교용 표입니다. 정렬/필터는 사용자가 직접 선택합니다.</p>
        </div>
        {effectivePayload?.fetchedAt ? (
          <p className={`${reportHeroMetaChipClassName} text-[11px]`}>fetchedAt: {formatDateTime(effectivePayload.fetchedAt)}</p>
        ) : null}
      </div>

      {effectiveLoading ? <LoadingState title="상품 후보를 불러오는 중입니다" /> : null}
      {!effectiveLoading && effectiveError ? <ErrorState message={effectiveError} /> : null}
      {!effectiveLoading && !effectiveError && effectivePayload && effectivePayload.candidates.length < 1 ? (
        <EmptyState
          title="비교 가능한 후보가 없습니다"
          description="현재 소스에서 조건에 맞는 예금/적금 후보를 찾지 못했습니다."
          icon="data"
        />
      ) : null}

      {!effectiveLoading && !effectiveError && effectivePayload && effectivePayload.candidates.length > 0 ? (
        <>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Comparison Setup</p>
            <p className="mt-2 text-base font-black tracking-tight">비교 기준을 바꾸면 표 아래 결과가 바로 달라집니다.</p>
            <p className="mt-1 text-sm text-white/70">금액, 만기, 금리 조건을 먼저 정하고 후보를 좁히는 흐름으로 보시면 됩니다.</p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs font-semibold text-white/75">
              종류
              <select
                className={reportSurfaceFieldClassName}
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as "all" | "deposit" | "saving")}
              >
                <option value="all">전체</option>
                <option value="deposit">예금</option>
                <option value="saving">적금</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-white/75">
              기준 목표
              <select className={reportSurfaceFieldClassName} value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                <option value="">선택 안 함</option>
                {effectivePayload.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-white/75">
              비교 금액(KRW)
              <input
                className={reportSurfaceFieldClassName}
                inputMode="numeric"
                min={100000}
                type="text"
                value={amountKrw}
                onChange={(event) => setAmountKrw(formatGroupedIntegerInput(asFiniteNumber(event.target.value, 0)))}
              />
            </label>
            <label className="text-xs font-semibold text-white/75">
              세율(%)
              <input className={reportSurfaceFieldClassName} type="number" min={0} max={100} step="0.1" value={taxRatePct} onChange={(event) => setTaxRatePct(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-white/75">
              최소 기본금리(%)
              <input className={reportSurfaceFieldClassName} type="number" min={0} step="0.1" value={minRatePct} onChange={(event) => setMinRatePct(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-white/75">
              정렬
              <select className={reportSurfaceFieldClassName} value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="rate_desc">기본금리 높은 순</option>
                <option value="net_interest_desc">세후 추정이자 높은 순</option>
                <option value="term_asc">기간 짧은 순</option>
                <option value="provider_asc">기관명 가나다순</option>
              </select>
            </label>
          </div>

          <div className={reportSurfaceTableFrameClassName}>
            <table className="min-w-full divide-y divide-white/10 text-sm text-white">
              <thead className="bg-white/10">
                <tr>
                  <th className="px-3 py-2 text-left">기관/상품</th>
                  <th className="px-3 py-2 text-left">종류</th>
                  <th className="px-3 py-2 text-right">기간</th>
                  <th className="px-3 py-2 text-right">기본금리</th>
                  <th className="px-3 py-2 text-right">우대금리</th>
                  <th className="px-3 py-2 text-right">세후 추정이자</th>
                  <th className="px-3 py-2 text-right">만기 추정금액</th>
                  <th className="px-3 py-2 text-left">출처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {pageRows.length < 1 ? (
                  <tr>
                    <td className="px-3 py-3 text-white/70" colSpan={8}>필터 조건에 맞는 후보가 없습니다.</td>
                  </tr>
                ) : pageRows.map((row) => (
                  <tr className="hover:bg-white/5" key={row.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-white">{row.providerName}</p>
                      <p className="text-[11px] text-white/80">{row.productName}</p>
                      <p className="text-[11px] text-white/60">{row.conditionsSummary}</p>
                      {showEstimateEvidence ? (
                        <details className={`mt-1 ${reportSurfaceDetailClassName}`}>
                          <summary className="cursor-pointer font-semibold text-white/90">이자 추정 근거</summary>
                          <p className="mt-1">공식: {row.estimateEvidence.formula}</p>
                          <p className="mt-1">입력:</p>
                          <ul className="list-disc pl-4">
                            {Object.entries(row.estimateEvidence.inputs).map(([key, value]) => (
                              <li key={`${row.id}:${key}`}>{key}: {renderEvidenceInputValue(value)}</li>
                            ))}
                          </ul>
                          <p className="mt-1">가정:</p>
                          <ul className="list-disc pl-4">
                            {row.estimateEvidence.assumptions.map((assumption, index) => (
                              <li key={`${row.id}:assumption:${index}`}>{assumption}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.kind === "deposit" ? "예금" : "적금"}</td>
                    <td className="px-3 py-2 text-right">{formatMonths("ko-KR", row.appliedTermMonths)}</td>
                    <td className="px-3 py-2 text-right">{formatPct("ko-KR", row.baseRatePct)}</td>
                    <td className="px-3 py-2 text-right">{typeof row.bonusRatePct === "number" ? formatPct("ko-KR", row.bonusRatePct) : "-"}</td>
                    <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.estimate.netInterestKrw)}</td>
                    <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.estimate.maturityAmountKrw)}</td>
                    <td className="px-3 py-2 text-xs text-white/70">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/80" data-testid="candidate-comparison-pagination">
            <p>
              총 <span className="font-semibold">{comparedRows.length}</span>개 중
              {" "}
              <span className="font-semibold">{pageStart}-{pageEnd}</span>개 표시
              {" · "}
              페이지 <span className="font-semibold">{currentPage}</span>/<span className="font-semibold">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                className={reportSurfaceButtonClassName}
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                type="button"
              >
                이전 5개
              </button>
              <button
                className={reportSurfaceButtonClassName}
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                type="button"
              >
                다음 5개
              </button>
            </div>
          </div>

          <div className={reportSurfaceInsetClassName} data-testid="candidate-comparison-assumptions">
            <p className="font-semibold text-white">Assumptions used</p>
            <p className="mt-1">모든 금액은 추정치입니다. 단리 계산(기간/12)과 입력 세율을 적용해 세후 이자/만기금액을 산출합니다.</p>
            <p className="mt-1">
              기준 금액: <span className="font-semibold">{formatKrw("ko-KR", Math.max(100_000, asFiniteNumber(amountKrw, effectivePayload.defaults.amountKrw)))}</span>
              {" · "}
              세율: <span className="font-semibold">{formatPct("ko-KR", Math.max(0, Math.min(100, asFiniteNumber(taxRatePct, effectivePayload.defaults.taxRatePct))))}</span>
              {" · "}
              기본 만기: <span className="font-semibold">{formatMonths("ko-KR", effectivePayload.defaults.termMonths)}</span>
            </p>
          </div>
        </>
      ) : null}
    </Card>
  );
}
