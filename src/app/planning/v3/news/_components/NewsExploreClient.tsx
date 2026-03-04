"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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
    } catch (error) {
      if (requestId !== requestSeqRef.current) return;

      setItems([]);
      setTopics([]);
      setSources([]);
      setTotal(0);
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

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...draft });
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Explore</h1>
              <p className="text-sm text-slate-600">토픽·기간·소스·버스트 필터로 과거 동향 재탐색</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                Digest로
              </Link>
              <Link href="/planning/v3/news/trends" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                트렌드
              </Link>
              <Link href="/planning/v3/news/alerts" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                알림함
              </Link>
              <Link href="/planning/v3/news/settings" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                설정
              </Link>
            </div>
          </div>
        </Card>

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
              <p className="text-xs text-slate-500">검색 결과: {resultLabel}</p>
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
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">검색 결과</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : items.length < 1 ? (
            <p className="text-sm text-slate-600">조건에 맞는 항목이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">
                    {item.topicLabel} · {item.sourceName} · 버스트 등급 {item.burstLevel} · 점수 {item.score.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">근거: {item.rationale || "기본 점수 규칙 반영"}</p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.publishedAt)}</p>
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
