"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import {
  reportHeroActionLinkClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid
} from "@/components/ui/ReportTone";
import { NewsNavigation } from "./NewsNavigation";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { cn } from "@/lib/utils";

type BurstLevel = "all" | "상" | "중" | "하";

type ExploreItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  sourceName: string;
  topicId: string;
  topicLabel: string;
  score: number;
  rationale?: string;
  scoreParts?: {
    source?: number;
    recency?: number;
    keyword?: number;
    burst?: number;
    diversityPenalty?: number;
    duplicatePenalty?: number;
  };
  burstLevel: Exclude<BurstLevel, "all">;
};

type ExploreTopic = {
  topicId: string;
  topicLabel: string;
  count: number;
  burstLevel: Exclude<BurstLevel, "all">;
};

type ExploreSource = {
  sourceId: string;
  sourceName: string;
  count: number;
};

type ExploreResponse = {
  ok?: boolean;
  data?: {
    freshness?: {
      contract: "search_index";
      status: "current" | "stale";
      indexGeneratedAt: string;
      lastRefreshedAt?: string | null;
    };
    total?: number;
    items?: ExploreItem[];
    topics?: ExploreTopic[];
    sources?: ExploreSource[];
    filters?: {
      q?: string;
      topics?: string[];
      sources?: string[];
      burst?: BurstLevel;
      days?: number;
      minScore?: number;
    };
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type ExploreFreshness = NonNullable<NonNullable<ExploreResponse["data"]>["freshness"]>;

type ExploreFilterState = {
  q: string;
  topic: string;
  source: string;
  burst: BurstLevel;
  days: 7 | 14 | 30;
  minScore: string;
};

type NewsExploreClientProps = {
  csrf?: string;
};

const DEFAULT_FILTERS: ExploreFilterState = {
  q: "",
  topic: "",
  source: "",
  burst: "all",
  days: 30,
  minScore: "",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function freshnessLabel(status: string | undefined): string {
  if (status === "current") return "최신 상태";
  if (status === "stale") return "업데이트 필요";
  return "확인 불가";
}

function burstLabel(value: BurstLevel): string {
  if (value === "상") return "급증 강함";
  if (value === "중") return "급증 보통";
  if (value === "하") return "급증 약함";
  return "전체";
}

function buildExploreLead(item: ExploreItem): string {
  const parts = [
    `${item.topicLabel} 흐름`,
    `${item.sourceName}에서 확인`,
    `${burstLabel(item.burstLevel)}`,
  ];
  return parts.join(" · ");
}

function safeDays(value: number): 7 | 14 | 30 {
  if (value === 7 || value === 14 || value === 30) return value;
  if (value <= 7) return 7;
  if (value <= 14) return 14;
  return 30;
}

function buildQuery(filters: ExploreFilterState): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.topic) params.set("topics", filters.topic);
  if (filters.source) params.set("sources", filters.source);
  if (filters.burst !== "all") params.set("burst", filters.burst);
  if (asString(filters.minScore)) params.set("minScore", asString(filters.minScore));
  params.set("days", String(filters.days));
  params.set("limit", "200");
  return params.toString();
}

export function NewsExploreClient({ csrf }: NewsExploreClientProps) {
  const requestSeqRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [draft, setDraft] = useState<ExploreFilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<ExploreFilterState>(DEFAULT_FILTERS);
  const [items, setItems] = useState<ExploreItem[]>([]);
  const [topics, setTopics] = useState<ExploreTopic[]>([]);
  const [sources, setSources] = useState<ExploreSource[]>([]);
  const [total, setTotal] = useState(0);
  const [freshness, setFreshness] = useState<ExploreFreshness | null>(null);
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});

  const load = useCallback(async (filters: ExploreFilterState) => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const query = buildQuery(filters);
      const response = await fetch(`/api/planning/v3/news/search?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as ExploreResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      if (requestId !== requestSeqRef.current) return;

      setItems(payload.data.items ?? []);
      setTopics(payload.data.topics ?? []);
      setSources(payload.data.sources ?? []);
      setTotal(Math.max(0, Number(payload.data.total ?? 0)));
      setFreshness(payload.data.freshness ?? null);
    } catch (error) {
      if (requestId !== requestSeqRef.current) return;

      setItems([]);
      setTopics([]);
      setSources([]);
      setTotal(0);
      setFreshness(null);
      setErrorMessage(error instanceof Error ? error.message : "뉴스 탐색 데이터를 불러오지 못했습니다.");
    } finally {
      if (requestId === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  const resultLabel = useMemo(() => {
    if (loading) return "불러오는 중...";
    return `${total.toLocaleString("ko-KR")}건`;
  }, [loading, total]);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (asString(applied.q)) count += 1;
    if (asString(applied.topic)) count += 1;
    if (asString(applied.source)) count += 1;
    if (applied.burst !== "all") count += 1;
    if (applied.days !== DEFAULT_FILTERS.days) count += 1;
    if (asString(applied.minScore)) count += 1;
    return count;
  }, [applied]);
  const topTopic = topics[0];
  const topSource = sources[0];

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...draft });
  }

  return (
    <PageShell>
      <div className="space-y-8">
        <ReportHeroCard
          kicker="Topic Explorer"
          title="뉴스 탐색"
          description="최근 이슈를 다시 훑어보면서 내게 중요한 토픽만 좁혀 보고, 많이 잡히는 흐름과 출처를 같은 기준으로 비교합니다."
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(DEFAULT_FILTERS);
                  setApplied(DEFAULT_FILTERS);
                }}
                className={reportHeroActionLinkClassName}
              >
                필터 초기화
              </button>
            </div>
          )}
        >
          <NewsNavigation />

          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard
              label="검색 결과"
              value={loading ? "-" : resultLabel}
              description="현재 조건에 맞는 기사 수"
            />
            <ReportHeroStatCard
              label="적용 필터"
              value={`${activeFilterCount}개`}
              description="키워드, 기간, 소스, 급증 정도 기준"
            />
            <ReportHeroStatCard
              label="정보 신선도"
              value={loading ? "-" : freshnessLabel(freshness?.status)}
              description={freshness?.indexGeneratedAt ? `인덱스 생성: ${formatDateTime(freshness.indexGeneratedAt)}` : "상태를 확인할 수 없습니다."}
            />
          </ReportHeroStatGrid>
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <Card className="rounded-[2rem] p-6 shadow-sm border border-slate-200">
          <SubSectionHeader title="상세 필터" description="찾으려는 기사의 조건을 좁혀보세요." />
          <form className="grid gap-4 md:grid-cols-6" onSubmit={submitFilters}>
            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              키워드
              <input
                value={draft.q}
                onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="예: 금리, 환율"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              />
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              토픽
              <select
                value={draft.topic}
                onChange={(event) => setDraft((prev) => ({ ...prev, topic: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              >
                <option value="">전체</option>
                {topics.map((topic) => (
                  <option key={topic.topicId} value={topic.topicId}>
                    {topic.topicLabel} ({topic.count.toLocaleString("ko-KR")}건)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              소스
              <select
                value={draft.source}
                onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              >
                <option value="">전체</option>
                {sources.map((source) => (
                  <option key={source.sourceId} value={source.sourceId}>
                    {source.sourceName} ({source.count.toLocaleString("ko-KR")}건)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              기간
              <select
                value={draft.days}
                onChange={(event) => setDraft((prev) => ({ ...prev, days: safeDays(Number(event.target.value)) }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              >
                <option value={7}>최근 7일</option>
                <option value={14}>최근 14일</option>
                <option value={30}>최근 30일</option>
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              버스트
              <select
                value={draft.burst}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    burst: value === "상" || value === "중" || value === "하" ? value : "all",
                  }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              >
                <option value="all">전체</option>
                <option value="상">상</option>
                <option value="중">중</option>
                <option value="하">하</option>
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              최소 점수
              <input
                value={draft.minScore}
                onChange={(event) => setDraft((prev) => ({ ...prev, minScore: event.target.value }))}
                placeholder="예: 1.2"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none transition-all"
              />
            </label>

            <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold text-slate-500 tabular-nums">
                결과: {resultLabel} · 구간: {applied.days}일 · 필터링: {burstLabel(applied.burst)}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(DEFAULT_FILTERS);
                    setApplied(DEFAULT_FILTERS);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  필터 초기화
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-black text-white hover:bg-slate-800 shadow-sm transition-colors"
                >
                  조건 적용하기
                </button>
              </div>
            </div>
          </form>
          {errorMessage ? <p className="mt-4 text-xs font-bold text-rose-600">❌ {errorMessage}</p> : null}
          {freshness ? (
            <div className={cn(
              "mt-4 rounded-xl border px-4 py-3 transition-colors",
              freshness.status === "stale" ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50/50"
            )}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("h-1.5 w-1.5 rounded-full", freshness.status === "stale" ? "bg-amber-500" : "bg-emerald-500")} />
                <p className={cn("text-[10px] font-black uppercase tracking-widest", freshness.status === "stale" ? "text-amber-700" : "text-slate-500")}>
                  {freshness.status === "stale" ? "STALE INDEX NOTICE" : "INDEX STATUS: CURRENT"}
                </p>
              </div>
              <p className={cn("text-[11px] font-medium leading-relaxed", freshness.status === "stale" ? "text-amber-900" : "text-slate-600")}>
                탐색 인덱스 기준 시각: {formatDateTime(freshness.indexGeneratedAt)}
                {freshness.lastRefreshedAt ? ` · 마지막 수동 갱신: ${formatDateTime(freshness.lastRefreshedAt)}` : ""}
              </p>
              {freshness.status === "stale" && (
                <p className="mt-1 text-[11px] font-bold text-amber-800">
                  수동 갱신을 마쳤더라도 검색 인덱스 갱신 전까지는 탐색 결과가 즉시 반영되지 않을 수 있습니다.
                </p>
              )}
            </div>
          ) : null}
        </Card>

        <Card className="rounded-[2.5rem] p-8 shadow-sm">
          <SubSectionHeader
            title="살펴볼 기사"
            description="현재 필터 조건에 부합하는 탐색 결과입니다."
            action={<span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">TOTAL: {total.toLocaleString("ko-KR")}</span>}
          />

          {loading ? (
            <p className="text-sm text-slate-500 animate-pulse">불러오는 중...</p>
          ) : items.length < 1 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
              <p className="text-sm font-bold text-slate-900">조건에 맞는 항목이 없습니다.</p>
              <p className="mt-2 text-xs font-medium text-slate-500">필터를 줄이거나 최근 30일 기준으로 다시 보면 더 넓게 확인할 수 있습니다.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(DEFAULT_FILTERS);
                    setApplied(DEFAULT_FILTERS);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                >
                  필터 초기화
                </button>
                <Link href="/planning/v3/news/trends" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                  최근 흐름 보기
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="group rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">{buildExploreLead(item)}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(item.publishedAt)}</span>
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">SCORE {item.score.toFixed(2)}</span>
                    </div>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-base font-black text-slate-900 leading-snug tracking-tight hover:text-emerald-700 transition-colors"
                  >
                    {item.title}
                  </a>

                  <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed italic">
                    {item.rationale || "최근 언급량과 토픽 연관도를 기준으로 먼저 볼 기사로 분류했습니다."}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAdvanced((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      {advanced[item.id] ? "분석 상세 닫기" : "점수 분석 상세"}
                    </button>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest">원문 보기 ▶</a>
                  </div>

                  {advanced[item.id] && (
                    <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-[10px] font-bold text-slate-500 tabular-nums border border-slate-100">
                      <div className="space-y-1">
                        <p>소스: {Number(item.scoreParts?.source ?? 0).toFixed(2)}</p>
                        <p>최근성: {Number(item.scoreParts?.recency ?? 0).toFixed(2)}</p>
                      </div>
                      <div className="space-y-1 border-x border-slate-200 px-3">
                        <p>키워드: {Number(item.scoreParts?.keyword ?? 0).toFixed(2)}</p>
                        <p>버스트: {Number(item.scoreParts?.burst ?? 0).toFixed(2)}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-rose-600">편중: {Number(item.scoreParts?.diversityPenalty ?? 0).toFixed(2)}</p>
                        <p className="text-rose-600">중복: {Number(item.scoreParts?.duplicatePenalty ?? 0).toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
