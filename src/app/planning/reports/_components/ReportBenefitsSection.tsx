"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Gov24ServiceDetailModal,
  type Gov24ServiceDetailData,
} from "@/components/Gov24ServiceDetailModal";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  reportHeroPrimaryActionClassName,
} from "@/components/ui/ReportTone";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";
import { BENEFIT_TOPICS } from "@/lib/publicApis/benefitsTopics";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import {
  rankPlanningBenefitRecommendations,
  type PlanningBenefitSignals,
  type PlanningBenefitProfileContext,
} from "../_lib/recommendationSignals";
import { type ReportVM } from "../_lib/reportViewModel";

type BenefitsPayload = {
  items: BenefitCandidate[];
};

type PlanningProfilePayload = {
  profile?: {
    currentAge?: unknown;
    birthYear?: unknown;
    gender?: unknown;
    sido?: unknown;
    sigungu?: unknown;
  };
};

type BenefitDetailPayload = Gov24ServiceDetailData;

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  vm: ReportVM;
  profileId?: string;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function regionLabel(item: BenefitCandidate): string {
  if (item.region.scope === "REGIONAL") {
    if (item.region.sido && item.region.sigungu) return `${item.region.sido} ${item.region.sigungu}`;
    if (item.region.sido) return item.region.sido;
    return "지역형";
  }
  if (item.region.scope === "NATIONWIDE") return "전국";
  return "지역 미상";
}

function resolveBenefitCtas(item: BenefitCandidate): {
  applyUrl: string | null;
} {
  const { links } = extractApplyLinks({
    serviceId: item.id,
    applyHow: item.applyHow,
    link: item.link,
    title: item.title,
    orgName: item.org,
  });
  const applyLink = links.find((entry) => entry.label.includes("온라인신청"));
  return {
    applyUrl: applyLink?.url ?? null,
  };
}

function parseBenefitProfileContext(payload: PlanningProfilePayload | null): PlanningBenefitProfileContext | undefined {
  const profile = payload?.profile;
  if (!profile) return undefined;
  const currentAge = asNumber(profile.currentAge);
  const birthYear = asNumber(profile.birthYear);
  const gender = asString(profile.gender);
  const sido = asString(profile.sido);
  const sigungu = asString(profile.sigungu);

  const context: PlanningBenefitProfileContext = {
    ...(typeof currentAge === "number" ? { currentAge } : {}),
    ...(typeof birthYear === "number" ? { birthYear } : {}),
    ...(gender === "M" || gender === "F" ? { gender } : {}),
    ...(sido ? { sido } : {}),
    ...(sigungu ? { sigungu } : {}),
  };

  return Object.keys(context).length > 0 ? context : undefined;
}

function buildBenefitsSearchHref(signals: PlanningBenefitSignals): string {
  const params = new URLSearchParams();

  if (signals.query?.trim()) {
    params.set("query", signals.query.trim());
  }
  if (signals.topics.length > 0) {
    params.set("topics", signals.topics.join(","));
  }
  if (signals.profileContext?.sido?.trim()) {
    params.set("sido", signals.profileContext.sido.trim());
  }
  if (signals.profileContext?.sido?.trim() && signals.profileContext?.sigungu?.trim()) {
    params.set("sigungu", signals.profileContext.sigungu.trim());
  }

  const queryString = params.toString();
  return queryString ? `/benefits?${queryString}` : "/benefits";
}

export default function ReportBenefitsSection({ vm, profileId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<BenefitCandidate[]>([]);
  const [profileContext, setProfileContext] = useState<PlanningBenefitProfileContext | undefined>(undefined);
  const [detailData, setDetailData] = useState<Gov24ServiceDetailData | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [detailError, setDetailError] = useState("");

  const recommendation = useMemo(
    () => rankPlanningBenefitRecommendations(vm, items, 5, profileContext),
    [items, profileContext, vm],
  );
  const benefitsSearchHref = useMemo(
    () => buildBenefitsSearchHref(recommendation.signals),
    [recommendation.signals],
  );

  useEffect(() => {
    let active = true;

    async function loadProfileContext(): Promise<void> {
      const safeProfileId = (profileId ?? "").trim();
      if (!safeProfileId) {
        setProfileContext(undefined);
        return;
      }
      try {
        const response = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(safeProfileId)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as ApiResponse<PlanningProfilePayload> | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          setProfileContext(undefined);
          return;
        }
        setProfileContext(parseBenefitProfileContext(body.data));
      } catch {
        if (!active) return;
        setProfileContext(undefined);
      }
    }

    void loadProfileContext();
    return () => {
      active = false;
    };
  }, [profileId]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      const signals = rankPlanningBenefitRecommendations(vm, [], 5, profileContext).signals;
      const params = new URLSearchParams();
      params.set("pageSize", "5");
      params.set("includeFacets", "0");
      params.set("includeNationwide", "1");
      params.set("includeUnknown", "1");
      if (signals.topics.length > 0) {
        params.set("topics", signals.topics.join(","));
      }
      if (signals.query) {
        params.set("query", signals.query);
      }
      if (signals.profileContext?.sido) {
        params.set("sido", signals.profileContext.sido);
      }
      if (signals.profileContext?.sigungu) {
        params.set("sigungu", signals.profileContext.sigungu);
      }

      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/public/benefits/search?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as ApiResponse<BenefitsPayload> | null;
        if (!active) return;
        if (!response.ok || !body?.ok || !body.data) {
          throw new Error(body?.error?.message ?? "혜택 후보를 불러오지 못했습니다.");
        }
        setItems(Array.isArray(body.data.items) ? body.data.items : []);
      } catch (loadError) {
        if (!active) return;
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "혜택 후보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [profileContext, vm]);

  async function openDetail(serviceId: string): Promise<void> {
    const safeServiceId = serviceId.trim();
    if (!safeServiceId) return;
    setDetailLoadingId(safeServiceId);
    setDetailError("");
    try {
      const response = await fetch(`/api/gov24/detail?svcId=${encodeURIComponent(safeServiceId)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as ApiResponse<BenefitDetailPayload> | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error?.message ?? "혜택 상세를 불러오지 못했습니다.");
      }
      setDetailData(body.data);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "혜택 상세를 불러오지 못했습니다.");
    } finally {
      setDetailLoadingId("");
    }
  }

  return (
    <Card className="space-y-6 border border-slate-100 bg-white p-8 text-slate-900 shadow-sm rounded-[2.5rem]" data-testid="report-benefits-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">혜택 탐색 보조</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">플래닝 기준 혜택 후보 좁히기</h2>
          <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">
            여기서는 현재 플래닝 결과 기준으로 먼저 볼 만한 혜택 후보를 좁혀 드립니다. 신청 자격과 실제 조건은 혜택 탐색 화면에서 다시 확인해 주세요.
          </p>
        </div>
        <Link
          className={reportHeroPrimaryActionClassName}
          href={benefitsSearchHref}
        >
          혜택 탐색에서 조건 다시 확인
        </Link>
      </div>

      {loading ? <LoadingState title="혜택 후보를 불러오는 중입니다" /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error ? (
        <>
          <div className="rounded-[2rem] border border-amber-100 bg-amber-50/30 p-6 shadow-inner">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">플래닝 기준으로 먼저 보는 후보</p>
            <p className="mt-3 text-xl font-black tracking-tight text-slate-900 leading-tight">{recommendation.signals.headline}</p>
            <p className="mt-3 text-sm font-bold text-slate-600 leading-relaxed">{recommendation.signals.summary}</p>
            <p className="mt-3 text-xs font-bold leading-relaxed text-amber-800">
              이 섹션은 수급 가능 여부를 확정하는 화면이 아니라, 지금 먼저 확인할 혜택 후보를 좁혀 주는 보조 레이어입니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {recommendation.signals.topics.map((topic) => (
                <span key={topic} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black text-amber-700 shadow-sm">
                  {BENEFIT_TOPICS[topic].label}
                </span>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm font-bold text-slate-700">
              {recommendation.signals.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {reason}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm font-bold text-amber-800 flex items-center gap-3">
               <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-black shrink-0">!</span>
               <p>세부 자격과 실제 신청 판단은 혜택 탐색과 원문 공고에서 다시 확인해 주세요. {recommendation.signals.limitations.join(" ")}</p>
            </div>
          </div>

          {detailError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-black text-rose-700 text-center">
              {detailError}
            </div>
          ) : null}

          {recommendation.rows.length < 1 ? (
            <EmptyState
              title="지금 표시할 혜택 후보가 없습니다"
              description="현재 추론한 주제와 맞는 혜택을 찾지 못했습니다. 혜택 탐색 화면에서 직접 범위를 넓혀 보세요."
              icon="data"
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2" data-testid="report-benefits-cards">
              {recommendation.rows.map((row, index) => {
                const ctas = resolveBenefitCtas(row.item);
                const isDetailLoading = detailLoadingId === row.item.id;
                return (
                  <article key={row.item.id} className="group flex flex-col rounded-[2.5rem] border border-slate-100 bg-slate-50/30 p-6 transition-all hover:bg-white hover:shadow-lg shadow-sm" data-testid="report-benefit-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">상위 {index + 1} · Gov24</p>
                        <h3 className="mt-2 text-lg font-black text-slate-900 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-1">{row.item.title}</h3>
                        <p className="mt-1 text-[11px] font-black text-slate-400 uppercase tracking-widest">{row.item.org ?? "기관 정보 미상"}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">적합도</p>
                        <p className="text-xl font-black text-emerald-700 tabular-nums">{row.explain.finalPoints.toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-white border border-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider shadow-sm">{regionLabel(row.item)}</span>
                      {(row.explain.matched.topics.length > 0 ? row.explain.matched.topics : ["주제 일반"]).map((topic) => (
                        <span key={`${row.item.id}:${topic}`} className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider shadow-sm">
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="mt-6 flex-1 space-y-3">
                      <p className="text-sm font-bold text-slate-700 leading-relaxed border-l-4 border-emerald-500 pl-3 bg-white/50 py-2 rounded-r-lg shadow-sm">{row.explain.why.summary}</p>
                      <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-3">{row.item.summary}</p>
                    </div>
                    {row.item.applyHow ? (
                      <p className="mt-4 text-[10px] font-bold text-slate-400 italic">신청방법: {row.item.applyHow}</p>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 shadow-sm"
                        disabled={isDetailLoading}
                        type="button"
                        onClick={() => void openDetail(row.item.id)}
                      >
                        {isDetailLoading ? "불러오는 중..." : "내용 상세보기"}
                      </button>
                      {ctas.applyUrl ? (
                        <a
                          className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-700 active:scale-95"
                          href={ctas.applyUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          신청하기
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {detailData ? <Gov24ServiceDetailModal data={detailData} onClose={() => setDetailData(null)} /> : null}
    </Card>
  );
}
