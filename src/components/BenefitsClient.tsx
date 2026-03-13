"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { SIDO_LIST, normalizeSido } from "@/lib/regions/kr";
import {
  BENEFIT_ALL_TOPICS_COUNT,
  BENEFIT_TOPIC_KEYS,
  BENEFIT_TOPICS,
  isTopicFilterBypassed,
  parseTopicKeys,
  type BenefitTopicKey,
} from "@/lib/publicApis/benefitsTopics";
import { getBenefitQualityBucket } from "@/lib/publicApis/benefitsQuality";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import { parseBenefitsQueryPreset } from "@/lib/planner/actionQuery";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";

type BenefitItem = BenefitCandidate;

type RegionFacet = { key: string; count: number };

type SearchMeta = {
  scannedPages?: number;
  scannedRows?: number;
  pagesFetched?: number;
  rowsFetched?: number;
  upstreamTotalCount?: number;
  matchedRows?: number;
  rawMatched?: number;
  uniqueIds?: number;
  uniqueCount?: number;
  dedupedCount?: number;
  totalNormalizedAll?: number;
  neededPagesEstimate?: number;
  autoMaxPagesApplied?: boolean;
  truncatedByLimit?: boolean;
  truncatedByMaxPages?: boolean;
  paginationSuspected?: boolean;
  snapshot?: {
    fromCache?: "memory" | "disk" | "built";
    generatedAt?: string;
    ageMs?: number;
    totalItemsInSnapshot?: number;
    neededPagesEstimate?: number;
    requestedMaxPages?: number | "auto";
    effectiveMaxPages?: number;
    pagesFetched?: number;
    completionRate?: number;
    truncatedByHardCap?: boolean;
  };
  normalizedCount?: number;
  dropStats?: { missingTitle?: number; generatedId?: number; unknownRegionNoText?: number; unknownRegionUnparsed?: number };
  truncated?: boolean;
  counts?: {
    regional: number;
    nationwide: number;
    unknown: number;
    total: number;
  };
  countsBySido?: Record<string, number>;
  countsBySigungu?: Record<string, number>;
  pipeline?: {
    snapshotUnique: number;
    afterTopics: number;
    afterAdvancedQuery: number;
    afterScopeToggles: number;
    afterSido: number;
    afterSigungu: number;
    afterLimit: number;
  };
  pipelineReason?: string;
};

type FetchState = {
  query: string;
  topics: BenefitTopicKey[];
  sido: string;
  sigungu: string;
  includeNationwide: boolean;
  includeUnknown: boolean;
  scanAll: boolean;
  pageSize: number;
  maxPages: number | "auto";
};

type FacetsState = {
  sido: RegionFacet[];
  sigungu: RegionFacet[];
};

type PlannerBenefitsContext = {
  category: string;
  region: string;
  ageBand: string;
  incomeBand: string;
};


function parseFlag(value: string | null, defaultValue = true): boolean {
  if (value === null) return defaultValue;
  const lowered = value.trim().toLowerCase();
  if (lowered === "0" || lowered === "false" || lowered === "no") return false;
  return true;
}

function extractShortcutFromApplyHow(serviceId: string, applyHow?: string): string | null {
  const raw = (applyHow ?? "").trim();
  if (!raw) return null;
  const extracted = extractApplyLinks({ serviceId, applyHow: raw });
  return extracted.links[0]?.url ?? extracted.primaryUrl ?? null;
}

export function BenefitsClient({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [selectedTopics, setSelectedTopics] = useState<BenefitTopicKey[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedConfigOpen, setAdvancedConfigOpen] = useState(false);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [includeNationwide, setIncludeNationwide] = useState(true);
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [scanAll, setScanAll] = useState(true);
  const [pageSize, setPageSize] = useState(50);
  const [maxPages, setMaxPages] = useState<number | "auto">(10);

  const [items, setItems] = useState<BenefitItem[]>([]);
  const [facets, setFacets] = useState<FacetsState>({ sido: [], sigungu: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [meta, setMeta] = useState<SearchMeta>({});
  const [totalMatched, setTotalMatched] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<BenefitItem | null>(null);
  const [detail, setDetail] = useState<{ conditions?: string[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [, setPlannerContext] = useState<PlannerBenefitsContext>({
    category: "all",
    region: "전국",
    ageBand: "all",
    incomeBand: "all",
  });
  const requestControllerRef = useRef<AbortController | null>(null);
  const initializedFromQueryRef = useRef(false);
  const selectedApplyShortcut = useMemo(
    () => (selected ? extractShortcutFromApplyHow(selected.id, selected.applyHow) : null),
    [selected],
  );

  const topicBuckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const topic = item.topicMatch?.matchedTopics?.[0];
      const key = topic && topic in BENEFIT_TOPICS ? BENEFIT_TOPICS[topic as BenefitTopicKey].label : "기타";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const syncUrl = useCallback((state: FetchState) => {
    const normalizedTopics = isTopicFilterBypassed(state.topics) ? [] : state.topics;
    const params = new URLSearchParams();
    if (state.query.trim()) params.set("query", state.query.trim());
    if (normalizedTopics.length > 0) params.set("topics", normalizedTopics.join(","));
    if (state.sido) params.set("sido", state.sido);
    if (state.sigungu) params.set("sigungu", state.sigungu);
    if (!state.includeNationwide) params.set("includeNationwide", "0");
    if (!state.includeUnknown) params.set("includeUnknown", "0");
    if (state.scanAll) params.set("scan", "all");
    params.set("pageSize", String(state.pageSize));
    params.set("maxPages", String(state.maxPages));
    params.set("rows", "200");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router]);

  const run = useCallback(async (state: FetchState, options?: { deep?: boolean; syncUrl?: boolean; cursor?: number; append?: boolean; includeFacets?: boolean }) => {
    const queryValue = state.query.trim();
    const normalizedTopics = isTopicFilterBypassed(state.topics) ? [] : state.topics;
    setLoading(true);
    setError("");
    setMeta({});
    try {
      const params = new URLSearchParams();
      if (queryValue) params.set("query", queryValue);
      if (normalizedTopics.length > 0) params.set("topics", normalizedTopics.join(","));
      if (options?.deep) {
        params.set("scan", "deep");
      } else {
        params.set("scan", state.scanAll ? "all" : "page");
      }
      if (state.sido) params.set("sido", state.sido);
      if (state.sigungu) params.set("sigungu", state.sigungu);
      if (!state.includeNationwide) params.set("includeNationwide", "0");
      if (!state.includeUnknown) params.set("includeUnknown", "0");
      params.set("pageSize", String(state.pageSize));
      params.set("cursor", String(Math.max(0, Math.trunc(options?.cursor ?? 0))));
      params.set("includeFacets", options?.includeFacets === false ? "0" : "1");
      params.set("maxPages", String(state.maxPages));
      params.set("rows", "200");

      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      const res = await fetch(`/api/public/benefits/search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "혜택 조회 실패");
        return;
      }
      const nextItems = Array.isArray(json.data?.items) ? json.data.items : [];
      setItems((prev) => (options?.append ? [...prev, ...nextItems] : nextItems));
      if (!options?.append) {
        setFacets({
          sido: Array.isArray(json.data?.facets?.sido) ? json.data.facets.sido : [],
          sigungu: Array.isArray(json.data?.facets?.sigungu) ? json.data.facets.sigungu : [],
        });
      }
      setTotalMatched(typeof json.data?.totalMatched === "number" ? json.data.totalMatched : nextItems.length);
      setNextCursor(typeof json.data?.page?.nextCursor === "number" ? json.data.page.nextCursor : null);
      setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
      setMeta(typeof json.meta === "object" && json.meta ? json.meta : {});
      if (options?.syncUrl !== false) syncUrl(state);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setError("혜택 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [syncUrl]);

  const applyAndRun = useCallback((patch: Partial<FetchState>, options?: { deep?: boolean }) => {
    const nextSido = patch.sido ?? sido;
    const currentSigungu = patch.sigungu ?? sigungu;
    const shouldResetSigungu = patch.sido !== undefined && patch.sido !== sido && patch.sigungu === undefined;
    const shouldForceStrictRegion = patch.sido !== undefined && (patch.sido ?? "").trim().length > 0;
    const shouldResetBroadRegion = patch.sido !== undefined && (patch.sido ?? "").trim().length === 0;
    const nextTopicsRaw = patch.topics ?? selectedTopics;
    const nextTopics = isTopicFilterBypassed(nextTopicsRaw) ? [] : nextTopicsRaw;
    const nextState: FetchState = {
      query: patch.query ?? query,
      topics: nextTopics,
      sido: nextSido,
      sigungu: shouldResetSigungu ? "" : currentSigungu,
      includeNationwide: patch.includeNationwide ?? (shouldForceStrictRegion ? false : shouldResetBroadRegion ? true : includeNationwide),
      includeUnknown: patch.includeUnknown ?? (shouldForceStrictRegion ? false : shouldResetBroadRegion ? true : includeUnknown),
      scanAll: patch.scanAll ?? scanAll,
      pageSize: patch.pageSize ?? pageSize,
      maxPages: patch.maxPages ?? maxPages,
    };

    setQuery(nextState.query);
    setSelectedTopics(nextState.topics);
    setSido(nextState.sido);
    setSigungu(nextState.sigungu);
    setIncludeNationwide(nextState.includeNationwide);
    setIncludeUnknown(nextState.includeUnknown);
    setScanAll(nextState.scanAll);
    setPageSize(nextState.pageSize);
    setMaxPages(nextState.maxPages);
    void run(nextState, { ...options, cursor: 0, includeFacets: true, append: false });
  }, [includeNationwide, includeUnknown, maxPages, pageSize, query, run, scanAll, selectedTopics, sigungu, sido]);

  const openDetail = useCallback(async (item: BenefitItem) => {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/public/benefits/item?serviceId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setDetail({ conditions: Array.isArray(json.data?.conditions) ? json.data.conditions : [] });
      } else {
        setDetail({ conditions: [] });
      }
    } catch {
      setDetail({ conditions: [] });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      await fetch("/api/dev/benefits/snapshot/refresh", { method: "POST" });
      await run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll: true, pageSize, maxPages }, { cursor: 0, includeFacets: true });
    } catch {
      // no-op
    }
  }, [includeNationwide, includeUnknown, maxPages, pageSize, query, run, selectedTopics, sigungu, sido]);

  useEffect(() => {
    if (initializedFromQueryRef.current) return;
    initializedFromQueryRef.current = true;

    const queryPreset = parseBenefitsQueryPreset(searchParams, initialQuery);
    const topicsFromUrl = parseTopicKeys((searchParams.get("topics") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
    const parsedSido = queryPreset.sido || normalizeSido(searchParams.get("sido") ?? "") || "";
    const parsedSigungu = queryPreset.sigungu || (searchParams.get("sigungu") ?? "").trim();
    const hasIncludeNationwideParam = searchParams.has("includeNationwide");
    const hasIncludeUnknownParam = searchParams.has("includeUnknown");
    const parsedIncludeNationwide = parseFlag(searchParams.get("includeNationwide"), parsedSido ? false : true);
    const parsedIncludeUnknown = parseFlag(searchParams.get("includeUnknown"), parsedSido ? false : true);
    const parsedScan = (searchParams.get("scan") ?? "").trim().toLowerCase();
    const parsedScanAll = parsedScan ? parsedScan === "all" : true;
    const parsedPageSize = Math.max(1, Math.min(200, Number(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "50") || 50));
    const parsedMaxPagesRaw = (searchParams.get("maxPages") ?? "10").trim().toLowerCase();
    const parsedMaxPages = parsedMaxPagesRaw === "auto" ? "auto" : Math.max(5, Math.min(30, Number(parsedMaxPagesRaw) || 10));
    const prioritizedTopics = topicsFromUrl.length > 0 ? topicsFromUrl : queryPreset.mappedTopics;
    const normalizedTopics = isTopicFilterBypassed(prioritizedTopics) ? [] : prioritizedTopics;
    const initialState: FetchState = {
      query: queryPreset.q,
      topics: normalizedTopics,
      sido: parsedSido,
      sigungu: parsedSido ? parsedSigungu : "",
      includeNationwide: parsedIncludeNationwide,
      includeUnknown: parsedIncludeUnknown,
      scanAll: parsedScanAll,
      pageSize: parsedPageSize,
      maxPages: parsedMaxPages,
    };

    setPlannerContext({
      category: queryPreset.category,
      region: queryPreset.region,
      ageBand: queryPreset.ageBand,
      incomeBand: queryPreset.incomeBand,
    });
    setQuery(initialState.query);
    setSelectedTopics(initialState.topics);
    setSido(initialState.sido);
    setSigungu(initialState.sigungu);
    setIncludeNationwide(initialState.includeNationwide);
    setIncludeUnknown(initialState.includeUnknown);
    if (!hasIncludeNationwideParam && parsedSido) setIncludeNationwide(false);
    if (!hasIncludeUnknownParam && parsedSido) setIncludeUnknown(false);
    setScanAll(initialState.scanAll);
    setPageSize(initialState.pageSize);
    setMaxPages(initialState.maxPages);
    void run(initialState, { cursor: 0, includeFacets: true });

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [initialQuery, run, searchParams]);

  return (
    <PageShell className="bg-surface-muted">
      <PageHeader 
        title="혜택 후보 검색" 
        description="보조금24 연계 · 조건 기반 참고 목록" 
      />
      
      <Card>
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">주제 필터</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isTopicFilterBypassed(selectedTopics) ? "primary" : "outline"}
              onClick={() => applyAndRun({ topics: [] })}
            >
              전체
            </Button>
            {BENEFIT_TOPIC_KEYS.map((topicKey) => (
              <Button
                key={topicKey}
                size="sm"
                variant={selectedTopics.includes(topicKey) && !isTopicFilterBypassed(selectedTopics) ? "primary" : "outline"}
                onClick={() => {
                  const current = isTopicFilterBypassed(selectedTopics) ? [] : selectedTopics;
                  let next = current.includes(topicKey)
                    ? current.filter((entry) => entry !== topicKey)
                    : [...current, topicKey];
                  if (next.length === BENEFIT_ALL_TOPICS_COUNT) next = [];
                  applyAndRun({ topics: next });
                }}
              >
                {BENEFIT_TOPICS[topicKey].label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setAdvancedOpen((prev) => !prev)}>
              고급 검색 {advancedOpen ? "접기" : "펼치기"}
            </Button>
            <Button onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: 0, includeFacets: true })}>
              {loading ? "로딩..." : "검색 적용"}
            </Button>
          </div>
        </div>

        {advancedOpen ? (
          <div className="mt-4 space-y-2 rounded-xl border border-border/50 bg-surface-muted p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">키워드 검색 (선택)</p>
            <div className="flex gap-2">
              <input className="h-10 rounded-xl border border-border bg-surface px-4 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="키워드 (예: 청년내일, 의료비)" />
              <Button onClick={() => applyAndRun({ query })}>적용</Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">지역 필터 (시/도)</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={sido ? "outline" : "primary"}
              onClick={() => applyAndRun({ sido: "", sigungu: "" })}
              data-testid="benefits-sido"
              data-sido=""
            >
              전체
            </Button>
            {SIDO_LIST.map((name) => {
              const count = facets.sido.find((entry) => entry.key === name)?.count ?? 0;
              return (
                <Button
                  key={name}
                  size="sm"
                  variant={sido === name ? "primary" : "outline"}
                  onClick={() => applyAndRun({ sido: name, sigungu: "" })}
                  data-testid="benefits-sido"
                  data-sido={name}
                >
                  {name} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {sido ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">상세 지역 (시/군/구)</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={sigungu ? "outline" : "primary"}
                onClick={() => applyAndRun({ sigungu: "" })}
                data-testid="benefits-sigungu"
                data-sigungu=""
              >
                전체
              </Button>
              {facets.sigungu.map((entry) => (
                <Button
                  key={entry.key}
                  size="sm"
                  variant={sigungu === entry.key ? "primary" : "outline"}
                  onClick={() => applyAndRun({ sigungu: entry.key })}
                  data-testid="benefits-sigungu"
                  data-sigungu={entry.key}
                >
                  {entry.key} ({entry.count})
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3 pt-6 border-t border-border/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">범위 설정</span>
          <Button size="sm" variant={includeNationwide ? "primary" : "outline"} onClick={() => applyAndRun({ includeNationwide: !includeNationwide })}>
            전국 혜택 포함 ({meta.counts?.nationwide ?? 0})
          </Button>
          <Button size="sm" variant={includeUnknown ? "primary" : "outline"} onClick={() => applyAndRun({ includeUnknown: !includeUnknown })}>
            지역 미상 포함 ({meta.counts?.unknown ?? 0})
          </Button>
        </div>
        
        <div className="mt-4 bg-surface-muted p-4 rounded-2xl border border-border/50">
          <p className="text-[11px] font-bold text-slate-700">
            선택 지역: {(sido || "전체")} · 전국 공통: {meta.counts?.nationwide ?? 0} · 지역 미상: {meta.counts?.unknown ?? 0}
          </p>
          <p className="mt-1 text-xs font-black text-primary">
            총 검색 결과: {totalMatched}개 <span className="text-[10px] font-medium text-slate-400 font-normal ml-1">(데이터베이스 {meta.snapshot?.totalItemsInSnapshot ?? "?"}개 중)</span>
          </p>
          {topicBuckets.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topicBuckets.slice(0, 8).map(([label, count]) => (
                <span key={`${label}-${count}`} className="rounded-full bg-white border border-border px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                  {label} <span className="text-slate-400 ml-0.5">{count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isTopicFilterBypassed(selectedTopics)
            ? selectedTopics.map((topic) => (
              <span key={`topic-${topic}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                주제: {BENEFIT_TOPICS[topic].label}
                <button onClick={() => applyAndRun({ topics: selectedTopics.filter((entry) => entry !== topic) })} className="hover:text-slate-800 ml-1">×</button>
              </span>
            )) : null}
          {query.trim() ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">검색어: {query.trim()} <button onClick={() => applyAndRun({ query: "" })} className="hover:text-slate-800 ml-1">×</button></span> : null}
          {sido ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">지역: {sido} <button onClick={() => applyAndRun({ sido: "", sigungu: "" })} className="hover:text-slate-800 ml-1">×</button></span> : null}
          {sigungu ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">상세지역: {sigungu} <button onClick={() => applyAndRun({ sigungu: "" })} className="hover:text-slate-800 ml-1">×</button></span> : null}
          
          {(selectedTopics.length > 0 || query.trim() || sido || sigungu || !includeNationwide || !includeUnknown) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => applyAndRun({ query: "", topics: [], sido: "", sigungu: "", includeNationwide: true, includeUnknown: true })} className="text-[10px] h-6 px-2 underline text-slate-400">
              모든 필터 지우기
            </Button>
          )}
        </div>

        {(typeof meta.snapshot?.completionRate === "number" && meta.snapshot.completionRate < 0.95) || meta.snapshot?.truncatedByHardCap ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 shadow-sm">
            <span className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              수집 미완료 알림
            </span>
            전체 데이터 수집이 지연되어 일부 결과만 표시될 수 있습니다. (완주율 {typeof meta.snapshot?.completionRate === "number" ? `${Math.round(meta.snapshot.completionRate * 1000) / 10}%` : "?"})
            <div className="mt-3">
              <Button type="button" size="sm" variant="outline" className="bg-white border-amber-200 text-amber-700" onClick={() => void refreshSnapshot()}>
                전체 수집 다시 시도하기
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 border-t border-border/50 pt-6">
          <button 
            onClick={() => setAdvancedConfigOpen((prev) => !prev)}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 uppercase tracking-widest transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform", advancedConfigOpen && "rotate-180")}><path d="m6 9 6 6 6-6"/></svg>
            개발자 도구 및 상태 로그
          </button>

          {advancedConfigOpen ? (
            <div className="mt-3 space-y-2 rounded-xl border border-border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={scanAll ? "primary" : "outline"} onClick={() => applyAndRun({ scanAll: true })}>전체 수집(스캔)</Button>
                <Button size="sm" variant={scanAll ? "outline" : "primary"} onClick={() => applyAndRun({ scanAll: false })}>빠른 조회(1페이지)</Button>
                <label className="text-xs text-slate-600">페이지 크기</label>
                <select
                  className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
                  value={pageSize}
                  onChange={(e) => applyAndRun({ pageSize: Number(e.target.value) })}
                >
                  {[50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <label className="text-xs text-slate-600">최대 페이지</label>
                <select
                  className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
                  value={String(maxPages)}
                  onChange={(e) => applyAndRun({ maxPages: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
                >
                  <option value="auto">auto</option>
                  {[5, 10, 20, 30].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => applyAndRun({ maxPages: "auto", scanAll: true })}>
                  필요 페이지로 설정
                </Button>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-2 space-y-1">
                <p>업스트림: {meta.upstreamTotalCount ?? "?"} | 고유수집: {meta.uniqueCount ?? meta.uniqueIds ?? items.length} | 표시: {items.length}</p>
                <p>필요 페이지: {meta.neededPagesEstimate ?? "?"} | maxPages: {String(maxPages)}</p>
                {meta.snapshot?.generatedAt && (
                  <p>스냅샷: {new Date(meta.snapshot.generatedAt).toLocaleString("ko-KR")} ({meta.snapshot.fromCache ?? "built"}, age {Math.round((meta.snapshot.ageMs ?? 0) / 60000)}m)</p>
                )}
                {meta.pipelineReason && <p className="text-amber-600">Pipeline Reason: {meta.pipelineReason}</p>}
              </div>
              {process.env.NODE_ENV !== "production" ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" className="bg-white text-xs h-7" onClick={() => void refreshSnapshot()}>스냅샷 강제 갱신</Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm font-bold text-rose-600 bg-rose-50 p-3 rounded-xl" data-testid="benefits-error-banner">{error}</p> : null}
        {assumption ? <p className="mt-4 text-[10px] text-slate-400 italic text-right">{assumption}</p> : null}
        
        <div className="mt-6 pt-6 border-t border-border/50">
           {!includeNationwide && !includeUnknown ? (
            <p className="text-[11px] font-bold text-amber-600 mb-3 bg-amber-50 p-2 rounded-lg inline-block">※ 전국/미상 혜택을 제외하면 검색 결과가 0건일 수 있습니다.</p>
           ) : null}
           <p className="text-[11px] text-slate-400 mb-4 flex items-center gap-1.5">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
             표시된 혜택은 실제 신청 자격 여부와 다를 수 있으며, 상세 조건을 반드시 확인하시기 바랍니다.
           </p>

           <div className="grid gap-4 md:grid-cols-2">
             {items.map((item) => {
               const quality = getBenefitQualityBucket(item);
               const applyShortcut = extractShortcutFromApplyHow(item.id, item.applyHow);
               return (
                <div key={item.id} className="flex flex-col bg-surface rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow group overflow-hidden" data-testid="benefits-item">
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-bold text-slate-900 leading-snug group-hover:text-primary transition-colors">{item.title}</h3>
                      <Badge variant="secondary" className={cn(
                        "text-[9px] px-2 py-0.5 whitespace-nowrap border-none",
                        quality === "HIGH" ? "bg-emerald-100 text-emerald-700" :
                        quality === "MED" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {quality === "HIGH" ? "정보 충분" : quality === "MED" ? "보통" : "정보 부족"}
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-slate-600 line-clamp-2 mb-4 flex-1">{item.summary}</p>
                    
                    <div className="space-y-2 mt-auto">
                      {item.org && <p className="text-[11px] font-medium text-slate-500 flex gap-2"><span className="text-slate-400 w-12 shrink-0">운영기관</span> {item.org}</p>}
                      {item.applyHow && (
                        <div className="text-[11px] font-medium text-slate-500 flex gap-2">
                          <span className="text-slate-400 w-12 shrink-0">신청방법</span>
                          <span className="min-w-0">
                            {item.applyHow}
                            {applyShortcut ? (
                              <>
                                {" "}
                                <a
                                  href={applyShortcut}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline underline-offset-2 font-bold"
                                >
                                  바로가기
                                </a>
                              </>
                            ) : null}
                          </span>
                        </div>
                      )}
                      
                      {Array.isArray(item.eligibilityChips) && item.eligibilityChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                          {item.eligibilityChips.slice(0, 3).map((chip) => (
                            <span key={chip} className="rounded-md bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{chip}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-surface-muted border-t border-border/50 p-3 px-5 flex items-center justify-between">
                     <span className="text-[10px] text-slate-400">
                        {item.topicMatch?.matchedTopics?.[0] ? BENEFIT_TOPICS[item.topicMatch.matchedTopics[0] as BenefitTopicKey]?.label : ""}
                     </span>
                     <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-primary font-bold hover:bg-primary/10 rounded-full" onClick={() => void openDetail(item)}>
                        상세 보기 <span className="ml-1 opacity-50">→</span>
                     </Button>
                  </div>
                </div>
               );
             })}
           </div>

          {!loading && !error && items.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center py-24 bg-surface rounded-3xl shadow-sm text-center" data-testid="benefits-empty">
              <div className="h-20 w-20 bg-surface-muted rounded-full flex items-center justify-center text-slate-300 mb-6">
                 <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">조회된 혜택이 없습니다</h3>
              <p className="mt-3 text-sm font-medium text-slate-500 max-w-md">
                 필터를 완화하거나 다른 검색어를 사용해보세요. 미상/전국 데이터를 포함하면 더 많은 결과가 나옵니다.
              </p>
              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="rounded-full px-8 h-12" onClick={() => applyAndRun({ query: "", topics: [], sido: "", sigungu: "", includeNationwide: true, includeUnknown: true })}>필터 초기화</Button>
              </div>
            </div>
          ) : null}

          {!loading && !error && nextCursor !== null ? (
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-12 h-12 shadow-sm bg-surface font-bold text-slate-700"
                onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: nextCursor, includeFacets: false, append: true, syncUrl: false })}
              >
                더 많은 혜택 보기
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
      
      {selected ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-surface rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 md:px-8 py-6 border-b border-border/50 flex items-start justify-between bg-surface-muted/50">
              <div className="pr-4">
                <Badge variant="outline" className="mb-3 border-none bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                  {selected.topicMatch?.matchedTopics?.[0] ? BENEFIT_TOPICS[selected.topicMatch.matchedTopics[0] as BenefitTopicKey]?.label : "지원 혜택"}
                </Badge>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-snug tracking-tight">{selected.title}</h3>
                {selected.org && <p className="text-sm font-bold text-slate-500 mt-2">{selected.org}</p>}
              </div>
              <Button size="sm" variant="ghost" className="rounded-full h-10 w-10 p-0 text-slate-400 bg-surface hover:bg-slate-200 shrink-0" onClick={() => setSelected(null)}>
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-surface">
              <section>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  서비스 개요
                </h4>
                <div className="bg-surface-muted rounded-2xl p-5 text-sm font-medium text-slate-700 leading-relaxed border border-border/50">
                  {selected.summary}
                </div>
              </section>
              
              <section>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/><path d="m5 7 3 5-3 5"/><path d="m19 7-3 5 3 5"/></svg>
                  지원 대상 및 조건
                </h4>
                <div className="bg-surface-muted rounded-2xl p-5 border border-border/50">
                  {detailLoading ? (
                    <div className="animate-pulse space-y-3">
                      <div className="h-4 bg-slate-200 rounded-full w-3/4"></div>
                      <div className="h-4 bg-slate-200 rounded-full w-1/2"></div>
                    </div>
                  ) : detail?.conditions?.length ? (
                    <ul className="space-y-3">
                      {detail.conditions.map((line, idx) => (
                        <li key={idx} className="flex gap-3 text-sm text-slate-700">
                          <span className="text-primary mt-1">•</span>
                          <span className="leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm font-medium text-slate-500 italic">상세 조건 정보가 API에 제공되지 않았습니다.</p>
                  )}
                </div>
              </section>

              {selected.applyHow && (
                <section>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    신청 방법
                  </h4>
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-sm font-bold text-slate-800">
                    <p>
                      {selected.applyHow}
                      {selectedApplyShortcut ? (
                        <>
                          {" "}
                          <a
                            href={selectedApplyShortcut}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            바로가기
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </section>
              )}
            </div>

            <div className="px-6 md:px-8 py-5 border-t border-border/50 bg-surface-muted flex items-center justify-between">
               <p className="text-[10px] font-bold text-slate-400">데이터 출처: 보조금24 API</p>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
