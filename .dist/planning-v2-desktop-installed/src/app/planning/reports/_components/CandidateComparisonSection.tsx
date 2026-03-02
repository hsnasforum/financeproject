"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  computeCandidateComparison,
  type CandidateComparisonRow,
  type CandidateGoalContext,
  type CandidateProfileContext,
  type CandidateVM,
} from "@/lib/planning/candidates/comparison";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";

type CandidatesPayload = {
  runId: string;
  profileId: string;
  kind: "all" | "deposit" | "saving";
  candidates: CandidateVM[];
  profileContext: CandidateProfileContext;
  goals: CandidateGoalContext[];
  defaults: {
    amountKrw: number;
    termMonths: number;
    taxRatePct: number;
  };
  fetchedAt: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type Props = {
  runId: string;
};

function asFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
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

export default function CandidateComparisonSection({ runId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<CandidatesPayload | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "deposit" | "saving">("all");
  const [goalId, setGoalId] = useState("");
  const [sortBy, setSortBy] = useState("rate_desc");
  const [minRatePct, setMinRatePct] = useState("0");
  const [amountKrw, setAmountKrw] = useState("10000000");
  const [taxRatePct, setTaxRatePct] = useState("15.4");

  useEffect(() => {
    let active = true;

    async function loadCandidates(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/candidates?runId=${encodeURIComponent(runId)}&kind=all&limit=80`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as ApiResponse<CandidatesPayload> | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? "후보 비교 데이터를 불러오지 못했습니다.");
        }
        setPayload(body.data);
        setAmountKrw(String(body.data.defaults.amountKrw));
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
  }, [runId]);

  const selectedGoal = useMemo(() => {
    if (!payload) return undefined;
    if (!goalId) return undefined;
    return payload.goals.find((goal) => goal.id === goalId);
  }, [goalId, payload]);

  const comparedRows = useMemo(() => {
    if (!payload) return [];
    const minRate = Math.max(0, asFiniteNumber(minRatePct, 0));
    const filtered = payload.candidates.filter((candidate) => {
      if (kindFilter !== "all" && candidate.kind !== kindFilter) return false;
      if (candidate.baseRatePct < minRate) return false;
      return true;
    });
    const compared = computeCandidateComparison(
      payload.profileContext,
      selectedGoal,
      filtered,
      {
        amountKrw: Math.max(100_000, asFiniteNumber(amountKrw, payload.defaults.amountKrw)),
        taxRatePct: Math.max(0, Math.min(100, asFiniteNumber(taxRatePct, payload.defaults.taxRatePct))),
        fallbackTermMonths: payload.defaults.termMonths,
      },
    );
    return sortRows(compared, sortBy);
  }, [amountKrw, goalId, kindFilter, minRatePct, payload, selectedGoal, sortBy, taxRatePct]);

  return (
    <Card className="space-y-4 p-5" data-testid="candidate-comparison-section" id="candidate-comparison-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">상품 후보 비교</h2>
          <p className="mt-1 text-xs text-slate-600">추천이 아닌 비교용 표입니다. 정렬/필터는 사용자가 직접 선택합니다.</p>
        </div>
        {payload?.fetchedAt ? (
          <p className="text-[11px] text-slate-500">fetchedAt: {formatDateTime(payload.fetchedAt)}</p>
        ) : null}
      </div>

      {loading ? <LoadingState title="상품 후보를 불러오는 중입니다" /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && payload && payload.candidates.length < 1 ? (
        <EmptyState
          title="비교 가능한 후보가 없습니다"
          description="현재 소스에서 조건에 맞는 예금/적금 후보를 찾지 못했습니다."
          icon="data"
        />
      ) : null}

      {!loading && !error && payload && payload.candidates.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs font-semibold text-slate-600">
              종류
              <select
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as "all" | "deposit" | "saving")}
              >
                <option value="all">전체</option>
                <option value="deposit">예금</option>
                <option value="saving">적금</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              기준 목표
              <select className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                <option value="">선택 안 함</option>
                {payload.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              비교 금액(KRW)
              <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" type="number" min={100000} value={amountKrw} onChange={(event) => setAmountKrw(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              세율(%)
              <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" type="number" min={0} max={100} step="0.1" value={taxRatePct} onChange={(event) => setTaxRatePct(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              최소 기본금리(%)
              <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" type="number" min={0} step="0.1" value={minRatePct} onChange={(event) => setMinRatePct(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              정렬
              <select className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="rate_desc">기본금리 높은 순</option>
                <option value="net_interest_desc">세후 추정이자 높은 순</option>
                <option value="term_asc">기간 짧은 순</option>
                <option value="provider_asc">기관명 가나다순</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
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
              <tbody className="divide-y divide-slate-100 bg-white">
                {comparedRows.length < 1 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-600" colSpan={8}>필터 조건에 맞는 후보가 없습니다.</td>
                  </tr>
                ) : comparedRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{row.providerName}</p>
                      <p className="text-[11px] text-slate-600">{row.productName}</p>
                      <p className="text-[11px] text-slate-500">{row.conditionsSummary}</p>
                    </td>
                    <td className="px-3 py-2">{row.kind === "deposit" ? "예금" : "적금"}</td>
                    <td className="px-3 py-2 text-right">{formatMonths("ko-KR", row.appliedTermMonths)}</td>
                    <td className="px-3 py-2 text-right">{formatPct("ko-KR", row.baseRatePct)}</td>
                    <td className="px-3 py-2 text-right">{typeof row.bonusRatePct === "number" ? formatPct("ko-KR", row.bonusRatePct) : "-"}</td>
                    <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.estimate.netInterestKrw)}</td>
                    <td className="px-3 py-2 text-right">{formatKrw("ko-KR", row.estimate.maturityAmountKrw)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="candidate-comparison-assumptions">
            <p className="font-semibold text-slate-900">Assumptions used</p>
            <p className="mt-1">모든 금액은 추정치입니다. 단리 계산(기간/12)과 입력 세율을 적용해 세후 이자/만기금액을 산출합니다.</p>
            <p className="mt-1">
              기준 금액: <span className="font-semibold">{formatKrw("ko-KR", Math.max(100_000, asFiniteNumber(amountKrw, payload.defaults.amountKrw)))}</span>
              {" · "}
              세율: <span className="font-semibold">{formatPct("ko-KR", Math.max(0, Math.min(100, asFiniteNumber(taxRatePct, payload.defaults.taxRatePct))))}</span>
              {" · "}
              기본 만기: <span className="font-semibold">{formatMonths("ko-KR", payload.defaults.termMonths)}</span>
            </p>
          </div>

          <p className="text-xs text-slate-500">부채 대환 후보 비교(placeholder)는 이후 단계에서 확장 예정입니다.</p>
        </>
      ) : null}
    </Card>
  );
}

