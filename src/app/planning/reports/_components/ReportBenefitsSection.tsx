"use client";

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
  reportSurfaceButtonClassName,
  reportHeroPrimaryActionClassName,
} from "@/components/ui/ReportTone";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";
import { BENEFIT_TOPICS } from "@/lib/publicApis/benefitsTopics";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import {
  rankPlanningBenefitRecommendations,
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
    <Card className="space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-5 text-white shadow-xl" data-testid="report-benefits-section">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Benefit Match</p>
        <h2 className="mt-1 text-base font-bold text-white">보조금24 · 정부지원 혜택 후보</h2>
        <p className="mt-1 text-xs text-white/72">
          현재 플래닝 결과와 기본 프로필을 바탕으로 먼저 볼 만한 혜택을 정리했습니다.
        </p>
      </div>

      {loading ? <LoadingState title="혜택 후보를 불러오는 중입니다" /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950 p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Why These Benefits</p>
            <p className="mt-2 text-lg font-black tracking-tight text-white">{recommendation.signals.headline}</p>
            <p className="mt-2 text-sm text-white/75">{recommendation.signals.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {recommendation.signals.topics.map((topic) => (
                <span key={topic} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                  {BENEFIT_TOPICS[topic].label}
                </span>
              ))}
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/75">
              {recommendation.signals.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/15 px-3 py-2 text-xs text-amber-100">
              {recommendation.signals.limitations.join(" ")}
            </div>
          </div>

          {detailError ? (
            <div className="rounded-lg border border-rose-300/40 bg-rose-900/30 px-3 py-2 text-xs text-rose-100">
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
            <div className="grid gap-3 xl:grid-cols-2" data-testid="report-benefits-cards">
              {recommendation.rows.map((row, index) => {
                const ctas = resolveBenefitCtas(row.item);
                const isDetailLoading = detailLoadingId === row.item.id;
                return (
                  <article key={row.item.id} className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-800/90 p-4 shadow-sm backdrop-blur" data-testid="report-benefit-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Top {index + 1} · Gov24</p>
                        <h3 className="mt-1 text-sm font-bold text-white">{row.item.title}</h3>
                        <p className="mt-1 text-xs text-white/70">{row.item.org ?? "기관 정보 미상"}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">Fit Score</p>
                        <p className="text-lg font-black text-emerald-50">{row.explain.finalPoints.toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">{regionLabel(row.item)}</span>
                      {(row.explain.matched.topics.length > 0 ? row.explain.matched.topics : ["주제 일반"]).map((topic) => (
                        <span key={`${row.item.id}:${topic}`} className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                          {topic}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 text-xs leading-5 text-white/82">{row.explain.why.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-white/62">{row.item.summary}</p>
                    {row.item.applyHow ? (
                      <p className="mt-2 text-[11px] text-white/55">신청방법: {row.item.applyHow}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className={`inline-flex items-center text-xs ${reportSurfaceButtonClassName}`}
                        disabled={isDetailLoading}
                        type="button"
                        onClick={() => void openDetail(row.item.id)}
                      >
                        {isDetailLoading ? "불러오는 중..." : "내용 상세보기"}
                      </button>
                      {ctas.applyUrl ? (
                        <a
                          className={`inline-flex items-center text-xs no-underline ${reportHeroPrimaryActionClassName}`}
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
