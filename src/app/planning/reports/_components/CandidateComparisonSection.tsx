"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "string") return value;
  if (value === null) return "없음";
  return "-";
}

function formatCandidateSourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (normalized === "finlife") return "금융상품 한눈에";
  if (normalized === "mock") return "예시 데이터";
  if (normalized === "manual") return "수기 입력";
  if (normalized === "internal") return "내부 계산";
  return source;
}

function CandidateEvidencePanel({ row, onClose }: { row: CandidateComparisonRow; onClose: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-slate-900/35 backdrop-blur-sm p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50 px-6 py-6 sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">계산 근거</p>
                <h3 className="mt-2 text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
                  {row.providerName}
                </h3>
                <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">{row.productName}</p>
                <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
                  현재 비교표는 그대로 두고, 이 오버레이에서만 계산 공식과 입력값을 확인할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">조건 요약</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{row.conditionsSummary}</p>
            </div>
          </div>

          <div className="max-h-[min(80vh,920px)] overflow-y-auto px-6 py-6 sm:px-8">
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">공식</p>
              <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] font-bold leading-relaxed text-slate-700">
                {row.estimateEvidence.formula}
              </p>
            </section>

            <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">입력값</p>
              <dl className="mt-4 grid gap-3">
                {Object.entries(row.estimateEvidence.inputs).map(([key, value]) => (
                  <div key={`${row.id}:${key}`} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <dt className="text-xs font-black text-slate-500">{key}</dt>
                    <dd className="text-right text-xs font-black tabular-nums text-slate-900">{renderEvidenceInputValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">가정</p>
              <ul className="mt-4 space-y-2 pl-5 text-sm font-bold leading-relaxed text-slate-600">
                {row.estimateEvidence.assumptions.map((assumption, index) => (
                  <li key={`${row.id}:assumption:${index}`} className="list-disc">{assumption}</li>
                ))}
              </ul>
            </section>

            <p className="mt-5 text-xs font-bold leading-relaxed text-slate-500">
              이 내용은 비교 계산의 참고 근거입니다. 실제 가입 전에는 상품 설명서와 최신 금리·우대 조건을 함께 확인해 주세요.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
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
  const [activeEvidenceRow, setActiveEvidenceRow] = useState<CandidateComparisonRow | null>(null);
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

  useEffect(() => {
    if (!activeEvidenceRow) return;
    const exists = comparedRows.some((row) => row.id === activeEvidenceRow.id);
    if (!exists) setActiveEvidenceRow(null);
  }, [activeEvidenceRow, comparedRows]);

  useEffect(() => {
    if (!activeEvidenceRow || typeof window === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveEvidenceRow(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeEvidenceRow]);

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
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="candidate-comparison-section" id="candidate-comparison-section">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">후보 비교</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">상품 후보 비교</h2>
          <p className="mt-2 text-sm font-bold text-slate-500 leading-relaxed">추천이 아닌 비교용 표입니다. 정렬/필터는 사용자가 직접 선택합니다.</p>
        </div>
        {effectivePayload?.fetchedAt ? (
          <Badge variant="secondary" className="rounded-full px-4 py-1 font-black bg-slate-50 text-slate-400 border-slate-100 tabular-nums">
            기준 시각: {formatDateTime(effectivePayload.fetchedAt)}
          </Badge>
        ) : null}
      </div>

      {effectiveLoading ? <LoadingState title="상품 후보를 불러오는 중입니다" /> : null}
      {!effectiveLoading && effectiveError ? (
        <div className="py-12 rounded-[2rem] bg-rose-50 border border-rose-100 text-center">
          <p className="text-sm font-black text-rose-700">{effectiveError}</p>
        </div>
      ) : null}
      {!effectiveLoading && !effectiveError && effectivePayload && effectivePayload.candidates.length < 1 ? (
        <EmptyState
          title="비교 가능한 후보가 없습니다"
          description="현재 소스에서 조건에 맞는 예금/적금 후보를 찾지 못했습니다."
          icon="data"
        />
      ) : null}

      {!effectiveLoading && !effectiveError && effectivePayload && effectivePayload.candidates.length > 0 ? (
        <div className="space-y-8">
          <div className="rounded-[2rem] bg-slate-50 p-8 border border-slate-100/50 shadow-inner">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">비교 설정</p>
            <p className="mt-3 text-lg font-black tracking-tight text-slate-900 leading-snug">비교 기준을 바꾸면 표 결과가 실시간으로 반영됩니다.</p>
            <p className="mt-2 text-sm font-bold text-slate-500">금액, 만기, 금리 조건을 먼저 정하고 후보를 좁히는 흐름으로 보시면 됩니다.</p>
          </div>

          <div className="grid gap-4 rounded-3xl border border-slate-100 bg-slate-50/30 p-6 shadow-sm md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">종류</span>
              <select
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as "all" | "deposit" | "saving")}
              >
                <option value="all">전체 상품</option>
                <option value="deposit">예금 전용</option>
                <option value="saving">적금 전용</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">기준 목표</span>
              <select className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                <option value="">선택 안 함</option>
                {effectivePayload.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">비교 금액</span>
              <div className="relative">
                <input
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 tabular-nums"
                  inputMode="numeric"
                  min={100000}
                  type="text"
                  value={amountKrw}
                  onChange={(event) => setAmountKrw(formatGroupedIntegerInput(asFiniteNumber(event.target.value, 0)))}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">원</span>
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">세율(%)</span>
              <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 tabular-nums" type="number" min={0} max={100} step="0.1" value={taxRatePct} onChange={(event) => setTaxRatePct(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">최소 금리</span>
              <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 tabular-nums" type="number" min={0} step="0.1" value={minRatePct} onChange={(event) => setMinRatePct(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">정렬 기준</span>
              <select className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="rate_desc">기본금리 높은 순</option>
                <option value="net_interest_desc">세후 추정이자 높은 순</option>
                <option value="term_asc">기간 짧은 순</option>
                <option value="provider_asc">기관명 가나다순</option>
              </select>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">기관 및 상품명</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">종류</th>
                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">기간</th>
                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">기본금리</th>
                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">우대금리</th>
                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">세후 이자</th>
                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">만기 금액</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">출처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {pageRows.length < 1 ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-400 text-center font-bold" colSpan={8}>필터 조건에 맞는 후보가 없습니다.</td>
                  </tr>
                ) : pageRows.map((row) => (
                  <tr className="group transition-colors hover:bg-slate-50/50" key={row.id}>
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900">{row.providerName}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500 leading-snug">{row.productName}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-400 uppercase tracking-tight">{row.conditionsSummary}</p>
                      {showEstimateEvidence ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-3 h-auto rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-[10px] font-black tracking-widest text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 hover:scale-100 active:scale-100"
                          onClick={() => setActiveEvidenceRow(row)}
                          title="현재 비교표는 유지한 채 가운데 오버레이에서 계산 근거를 엽니다"
                        >
                          계산 근거 보기
                        </Button>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none font-black text-[10px]">
                        {row.kind === "deposit" ? "예금" : "적금"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right font-black text-slate-400 tabular-nums">{formatMonths("ko-KR", row.appliedTermMonths)}</td>
                    <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums">{formatPct("ko-KR", row.baseRatePct)}</td>
                    <td className="px-4 py-4 text-right font-black text-emerald-600 tabular-nums">{typeof row.bonusRatePct === "number" ? formatPct("ko-KR", row.bonusRatePct) : "-"}</td>
                    <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums">{formatKrw("ko-KR", row.estimate.netInterestKrw)}</td>
                    <td className="px-4 py-4 text-right font-black text-emerald-600 tabular-nums text-lg tracking-tight">{formatKrw("ko-KR", row.estimate.maturityAmountKrw)}</td>
                    <td className="px-4 py-4">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{formatCandidateSourceLabel(row.source)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-8" data-testid="candidate-comparison-pagination">
            <p className="text-xs font-bold text-slate-400">
              전체 <span className="text-slate-900 font-black">{comparedRows.length}</span>개 중 <span className="text-slate-900 font-black">{pageStart}-{pageEnd}</span>번째 후보 표시
              {" · "}
              페이지 <span className="text-slate-900 font-black">{currentPage}</span> / {totalPages}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-full px-6 font-black h-9"
              >
                이전 5개
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-full px-6 font-black h-9"
              >
                다음 5개
              </Button>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-emerald-50/30 p-6 border border-emerald-100/50" data-testid="candidate-comparison-assumptions">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">계산 가정</p>
            </div>
            <p className="text-xs font-bold text-emerald-900/70 leading-relaxed">모든 금액은 추정치입니다. 단리 계산(기간/12)과 입력 세율을 적용해 세후 이자 및 만기 수령액을 산출합니다.</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-black uppercase tracking-widest text-emerald-600">
              <p>기준 금액: <span className="text-slate-900 ml-1">{formatKrw("ko-KR", Math.max(100_000, asFiniteNumber(amountKrw, effectivePayload.defaults.amountKrw)))}</span></p>
              <p>세율: <span className="text-slate-900 ml-1">{formatPct("ko-KR", Math.max(0, Math.min(100, asFiniteNumber(taxRatePct, effectivePayload.defaults.taxRatePct))))}</span></p>
              <p>기간: <span className="text-slate-900 ml-1">{formatMonths("ko-KR", effectivePayload.defaults.termMonths)}</span></p>
            </div>
          </div>
        </div>
      ) : null}

      {activeEvidenceRow ? (
        <CandidateEvidencePanel row={activeEvidenceRow} onClose={() => setActiveEvidenceRow(null)} />
      ) : null}
    </Card>
  );
}
