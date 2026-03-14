"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { reportHeroActionLinkClassName, ReportHeroCard, ReportHeroStatCard, ReportHeroStatGrid } from "@/components/ui/ReportTone";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";

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
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Topic Explorer"
          title="뉴스 탐색"
          description="최근 이슈를 다시 훑어보면서 내게 중요한 토픽만 좁혀 보고, 많이 잡히는 흐름과 출처를 같은 기준으로 비교합니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>
                오늘 브리핑
              </Link>
              <Link href="/planning/v3/news/trends" className={reportHeroActionLinkClassName}>
                흐름 보기
              </Link>
              <Link href="/planning/v3/news/alerts" className={reportHeroActionLinkClassName}>
                중요 알림
              </Link>
              <Link href="/planning/v3/news/settings" className={reportHeroActionLinkClassName}>
                설정
              </Link>
            </>
          )}
        >
          <ReportHeroStatGrid className="xl:grid-cols-3">
            <ReportHeroStatCard label="검색 결과" value={resultLabel} description="현재 조건에 맞는 기사 수" />
            <ReportHeroStatCard label="적용 필터" value={`${activeFilterCount}개`} description="키워드, 기간, 소스, 급증 정도 기준" />
            <ReportHeroStatCard
              label="많이 잡힌 흐름"
              value={topTopic ? topTopic.topicLabel : "-"}
              description={topSource ? `${topSource.sourceName}에서 많이 보인 기사` : "결과를 불러오면 자주 보인 흐름을 보여줍니다."}
            />
          </ReportHeroStatGrid>
        </ReportHeroCard>

        <WeeklyPlanPanel csrf={csrf} />

        <Card>
          <form className="grid gap-3 md:grid-cols-6" onSubmit={submitFilters}>
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              키워드
              <input
                value={draft.q}
                onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="예: 금리, 환율"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>

            <label className="space-y-1 text-xs font-semibold text-slate-700">
              토픽
              <select
                value={draft.topic}
                onChange={(event) => setDraft((prev) => ({ ...prev, topic: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="">전체</option>
                {topics.map((topic) => (
                  <option key={topic.topicId} value={topic.topicId}>
                    {topic.topicLabel} ({topic.count.toLocaleString("ko-KR")}건)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold text-slate-700">
              소스
              <select
                value={draft.source}
                onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="">전체</option>
                {sources.map((source) => (
                  <option key={source.sourceId} value={source.sourceId}>
                    {source.sourceName} ({source.count.toLocaleString("ko-KR")}건)
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold text-slate-700">
              기간
              <select
                value={draft.days}
                onChange={(event) => setDraft((prev) => ({ ...prev, days: safeDays(Number(event.target.value)) }))}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                <option value={7}>최근 7일</option>
                <option value={14}>최근 14일</option>
                <option value={30}>최근 30일</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold text-slate-700">
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
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="all">전체</option>
                <option value="상">상</option>
                <option value="중">중</option>
                <option value="하">하</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold text-slate-700">
              최소 점수
              <input
                value={draft.minScore}
                onChange={(event) => setDraft((prev) => ({ ...prev, minScore: event.target.value }))}
                placeholder="예: 1.2"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>

            <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <p className="text-xs text-slate-500">
                검색 결과: {resultLabel} · 최근 {applied.days}일 · 급증 정도 {burstLabel(applied.burst)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(DEFAULT_FILTERS);
                    setApplied(DEFAULT_FILTERS);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  필터 적용
                </button>
              </div>
            </div>
          </form>
          {errorMessage ? <p className="mt-2 text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
          {freshness ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 ${freshness.status === "stale" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-semibold ${freshness.status === "stale" ? "text-amber-900" : "text-slate-700"}`}>
                {freshness.status === "stale"
                  ? "최근 수동 갱신이 더 최신이지만, 탐색 화면은 아직 이전 검색 인덱스 기준으로 보입니다."
                  : "탐색 화면은 검색 인덱스 기준으로 정리된 결과를 보여줍니다."}
              </p>
              <p className={`mt-1 text-xs ${freshness.status === "stale" ? "text-amber-900" : "text-slate-600"}`}>
                탐색 인덱스 기준 시각: {formatDateTime(freshness.indexGeneratedAt)}
                {freshness.lastRefreshedAt ? ` · 마지막 수동 갱신: ${formatDateTime(freshness.lastRefreshedAt)}` : ""}
              </p>
              {freshness.status === "stale" ? (
                <p className="mt-1 text-xs text-amber-900">
                  오늘 브리핑에서 수동 갱신을 마쳤더라도, 탐색 결과는 검색 인덱스 시각이 다시 갱신되기 전까지 바로 바뀌지 않을 수 있습니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">살펴볼 기사</h2>
            <p className="text-xs text-slate-500">먼저 제목과 한 줄 해석을 보고, 필요할 때만 상세 근거를 펼쳐보세요.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : items.length < 1 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">조건에 맞는 항목이 없습니다.</p>
              <p className="mt-1 text-xs text-slate-600">필터를 줄이거나 최근 30일 기준으로 다시 보면 더 넓게 확인할 수 있습니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(DEFAULT_FILTERS);
                    setApplied(DEFAULT_FILTERS);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  필터 초기화
                </button>
                <Link href="/planning/v3/news/trends" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                  최근 흐름 보기
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-emerald-700">{buildExploreLead(item)}</p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-600">{item.rationale || "최근 언급량과 토픽 연관도를 기준으로 먼저 볼 기사로 분류했습니다."}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.publishedAt)} · 내부 점수 {item.score.toFixed(2)}</p>
                  <button
                    type="button"
                    onClick={() => setAdvanced((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                    className="mt-2 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {advanced[item.id] ? "고급 보기 닫기" : "고급 보기"}
                  </button>
                  {advanced[item.id] ? (
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                      <li>소스 기여: {(item.scoreParts?.source ?? 0).toFixed(2)}</li>
                      <li>최근성 기여: {(item.scoreParts?.recency ?? 0).toFixed(2)}</li>
                      <li>키워드 기여: {(item.scoreParts?.keyword ?? 0).toFixed(2)}</li>
                      <li>버스트 기여: {(item.scoreParts?.burst ?? 0).toFixed(2)}</li>
                      <li>편중 감점: {(item.scoreParts?.diversityPenalty ?? 0).toFixed(2)}</li>
                      <li>중복 감점: {(item.scoreParts?.duplicatePenalty ?? 0).toFixed(2)}</li>
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
