"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  reportHeroActionLinkClassName,
  reportHeroMetaChipClassName,
  reportHeroPrimaryActionClassName,
} from "@/components/ui/ReportTone";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type Stage } from "@/lib/planning/engine";
import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import {
  rankPlanningProductRecommendations,
  type CandidateRecommendationsPayload,
} from "../_lib/recommendationSignals";
import { type ReportVM } from "../_lib/reportViewModel";

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  runId: string;
  vm: ReportVM;
  payload?: CandidateRecommendationsPayload | null;
  payloadLoading?: boolean;
  payloadError?: string;
};

function asDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asStage(value: unknown): Stage | undefined {
  return value === "DEFICIT" || value === "DEBT" || value === "EMERGENCY" || value === "INVEST" ? value : undefined;
}

function resolvePlanningStage(vm: ReportVM): Stage | undefined {
  const raw = asRecord(vm.raw);
  const run = asRecord(raw?.runJson);
  const outputs = asRecord(run?.outputs);
  const engine = asRecord(outputs?.engine);
  const engineFinancialStatus = asRecord(engine?.financialStatus);
  const simulate = asRecord(outputs?.simulate);
  const simulateFinancialStatus = asRecord(simulate?.financialStatus);

  return (
    asStage(engineFinancialStatus?.stage)
    ?? asStage(engine?.stage)
    ?? asStage(simulateFinancialStatus?.stage)
    ?? asStage(simulate?.stage)
  );
}

function buildRecommendHref(runId: string, stage: Stage | undefined, overallStatus?: PlanningRunOverallStatus): string {
  if (!runId || !stage) return "/recommend";
  const params = new URLSearchParams();
  params.set("from", "planning-report");
  params.set("planning.runId", runId);
  params.set("planning.summary.stage", stage);
  if (overallStatus) {
    params.set("planning.summary.overallStatus", overallStatus);
  }
  return `/recommend?${params.toString()}`;
}

export default function ReportRecommendationsSection({
  runId,
  vm,
  payload: sharedPayload,
  payloadLoading,
  payloadError,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<CandidateRecommendationsPayload | null>(null);
  const usesSharedPayload = payloadLoading !== undefined || payloadError !== undefined || sharedPayload !== undefined;
  const effectiveLoading = usesSharedPayload ? Boolean(payloadLoading) : loading;
  const effectiveError = usesSharedPayload ? payloadError ?? "" : error;
  const effectivePayload = usesSharedPayload ? sharedPayload ?? null : payload;

  useEffect(() => {
    if (usesSharedPayload) return;
    let active = true;

    async function load(): Promise<void> {
      if (!runId) {
        setPayload(null);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/candidates?runId=${encodeURIComponent(runId)}&kind=all&limit=60`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as ApiResponse<CandidateRecommendationsPayload> | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? "추천 후보를 불러오지 못했습니다.");
        }
        setPayload(body.data);
      } catch (loadError) {
        if (!active) return;
        setPayload(null);
        setError(loadError instanceof Error ? loadError.message : "추천 후보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [runId, usesSharedPayload]);

  const recommendation = useMemo(() => {
    if (!effectivePayload) return null;
    return rankPlanningProductRecommendations(vm, effectivePayload, 3);
  }, [effectivePayload, vm]);
  const recommendHref = useMemo(
    () => buildRecommendHref(runId, resolvePlanningStage(vm), vm.stage.overallStatus),
    [runId, vm],
  );

  return (
    <Card className="space-y-6 border border-slate-100 bg-white p-8 text-slate-900 shadow-sm rounded-[2.5rem]" data-testid="report-recommendations-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">상품 후보 비교</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">지금 내 상황에서 먼저 볼 상품 후보</h2>
          <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed max-w-2xl">
            플래닝 결과를 바탕으로 예금/적금 후보를 비교용으로 정렬했습니다. 확정 추천이 아니라 다음 확인 순서를 제안합니다.
          </p>
        </div>
        {effectivePayload?.fetchedAt ? (
          <p className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest tabular-nums">기준 시각: {asDateTime(effectivePayload.fetchedAt)}</p>
        ) : null}
      </div>

      {effectiveLoading ? <LoadingState title="추천 후보를 불러오는 중입니다" /> : null}
      {!effectiveLoading && effectiveError ? <ErrorState message={effectiveError} /> : null}
      {!effectiveLoading && !effectiveError && recommendation ? (
        <>
          <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/30 p-6 shadow-inner">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">왜 이 상품을 먼저 보나요</p>
            <p className="mt-3 text-xl font-black tracking-tight text-slate-900 leading-tight">{recommendation.signals.headline}</p>
            <p className="mt-3 text-sm font-bold text-slate-600 leading-relaxed">{recommendation.signals.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
                비교 금액 {formatKrw("ko-KR", recommendation.signals.comparisonAmountKrw)}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
                선호 만기 {recommendation.signals.preferredTermMonths.map((term) => formatMonths("ko-KR", term)).join(" / ")}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
                우선 종류 {recommendation.signals.recommendedKinds.map((kind) => kind === "deposit" ? "예금" : "적금").join(" → ")}
              </span>
            </div>
            <ul className="mt-4 space-y-2 text-sm font-bold text-slate-700">
              {recommendation.signals.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {reason}
                </li>
              ))}
            </ul>
            {recommendation.signals.cautions.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm font-bold text-amber-800 flex items-center gap-3">
                 <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-black shrink-0">!</span>
                 <p>{recommendation.signals.cautions.join(" ")}</p>
              </div>
            ) : null}
          </div>

          {recommendation.rows.length < 1 ? (
            <EmptyState
              title="보여줄 후보가 없습니다"
              description="현재 조건에 맞는 예금/적금 후보를 찾지 못했습니다."
              icon="data"
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-3" data-testid="report-recommendation-cards">
              {recommendation.rows.map((row, index) => (
                <article
                  key={row.id}
                  className="group flex flex-col rounded-[2.5rem] border border-slate-100 bg-slate-50/30 p-6 transition-all hover:bg-white hover:shadow-lg shadow-sm"
                  data-testid="report-recommendation-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        상위 {index + 1} · {row.kind === "deposit" ? "예금" : "적금"}
                      </p>
                      <h3 className="mt-2 text-lg font-black text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-1">{row.productName}</h3>
                      <p className="mt-1 text-[11px] font-black text-emerald-600 uppercase tracking-widest">{row.providerName}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right shrink-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">적합도</p>
                      <p className="text-xl font-black text-emerald-700 tabular-nums">{row.fitScore.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.fitBadges.map((badge) => (
                      <span key={`${row.id}:${badge}`} className="rounded-lg bg-white border border-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider shadow-sm">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-inner">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">기본금리</p>
                      <p className="text-sm font-black text-slate-900 tabular-nums">{formatPct("ko-KR", row.baseRatePct)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">우대금리</p>
                      <p className="text-sm font-black text-slate-900 tabular-nums">{typeof row.bonusRatePct === "number" ? formatPct("ko-KR", row.bonusRatePct) : "-"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">세후 추정이자</p>
                      <p className="text-sm font-black text-emerald-600 tabular-nums">{formatKrw("ko-KR", row.estimate.netInterestKrw)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">만기 추정금액</p>
                      <p className="text-sm font-black text-emerald-600 tabular-nums">{formatKrw("ko-KR", row.estimate.maturityAmountKrw)}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex-1 space-y-3">
                    <p className="text-sm font-bold text-slate-700 leading-relaxed border-l-4 border-emerald-500 pl-3 bg-white/50 py-2 rounded-r-lg shadow-sm">{row.fitSummary}</p>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-2">{row.conditionsSummary}</p>
                  </div>
                  <p className="mt-4 text-[10px] font-bold text-slate-400 italic tabular-nums">비교 가정: {formatKrw("ko-KR", row.assumptionsUsed.amountKrw)} · {formatMonths("ko-KR", row.appliedTermMonths)}</p>
                </article>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 shadow-sm"
              href="#candidate-comparison-section"
            >
              후보 비교표로 이동
            </a>
            <Link
              className="inline-flex items-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-700 active:scale-95"
              href={recommendHref}
            >
              전체 추천 보기
            </Link>
          </div>
        </>
      ) : null}
    </Card>
  );
}
