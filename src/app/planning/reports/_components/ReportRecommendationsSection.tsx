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

  return (
    <Card className="space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl" data-testid="report-recommendations-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Product Match</p>
          <h2 className="mt-1 text-base font-bold text-white">지금 내 상황에서 먼저 볼 상품 후보</h2>
          <p className="mt-1 text-xs text-white/72">
            플래닝 결과를 바탕으로 예금/적금 후보를 비교용으로 정렬했습니다. 확정 추천이 아니라 다음 확인 순서를 제안합니다.
          </p>
        </div>
        {effectivePayload?.fetchedAt ? (
          <p className={`${reportHeroMetaChipClassName} text-[11px]`}>fetchedAt: {asDateTime(effectivePayload.fetchedAt)}</p>
        ) : null}
      </div>

      {effectiveLoading ? <LoadingState title="추천 후보를 불러오는 중입니다" /> : null}
      {!effectiveLoading && effectiveError ? <ErrorState message={effectiveError} /> : null}
      {!effectiveLoading && !effectiveError && recommendation ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Why These Products</p>
            <p className="mt-2 text-lg font-black tracking-tight text-white">{recommendation.signals.headline}</p>
            <p className="mt-2 text-sm text-white/75">{recommendation.signals.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                비교 금액 {formatKrw("ko-KR", recommendation.signals.comparisonAmountKrw)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                선호 만기 {recommendation.signals.preferredTermMonths.map((term) => formatMonths("ko-KR", term)).join(" / ")}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                우선 종류 {recommendation.signals.recommendedKinds.map((kind) => kind === "deposit" ? "예금" : "적금").join(" → ")}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/75">
              {recommendation.signals.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {recommendation.signals.cautions.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/15 px-3 py-2 text-xs text-amber-100">
                {recommendation.signals.cautions.join(" ")}
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
            <div className="grid gap-3 xl:grid-cols-3" data-testid="report-recommendation-cards">
              {recommendation.rows.map((row, index) => (
                <article
                  key={row.id}
                  className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-4 shadow-sm backdrop-blur"
                  data-testid="report-recommendation-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        Top {index + 1} · {row.kind === "deposit" ? "예금" : "적금"}
                      </p>
                      <h3 className="mt-1 text-sm font-bold text-white">{row.productName}</h3>
                      <p className="mt-1 text-xs text-white/70">{row.providerName}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">Fit Score</p>
                      <p className="text-lg font-black text-emerald-50">{row.fitScore.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.fitBadges.map((badge) => (
                      <span key={`${row.id}:${badge}`} className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">
                    <div>
                      <p className="text-[11px] text-white/55">기본금리</p>
                      <p className="font-semibold text-white">{formatPct("ko-KR", row.baseRatePct)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/55">우대금리</p>
                      <p className="font-semibold text-white">{typeof row.bonusRatePct === "number" ? formatPct("ko-KR", row.bonusRatePct) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/55">세후 추정이자</p>
                      <p className="font-semibold text-white">{formatKrw("ko-KR", row.estimate.netInterestKrw)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/55">만기 추정금액</p>
                      <p className="font-semibold text-white">{formatKrw("ko-KR", row.estimate.maturityAmountKrw)}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-white/82">{row.fitSummary}</p>
                  <p className="mt-2 text-xs leading-5 text-white/62">{row.conditionsSummary}</p>
                  <p className="mt-2 text-[11px] text-white/55">비교 가정: {formatKrw("ko-KR", row.assumptionsUsed.amountKrw)} · {formatMonths("ko-KR", row.appliedTermMonths)}</p>
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              className={`inline-flex items-center text-xs no-underline ${reportHeroActionLinkClassName}`}
              href="#candidate-comparison-section"
            >
              후보 비교표로 이동
            </a>
            <Link
              className={`inline-flex items-center text-xs no-underline ${reportHeroPrimaryActionClassName}`}
              href="/recommend"
            >
              전체 추천 보기
            </Link>
          </div>
        </>
      ) : null}
    </Card>
  );
}
