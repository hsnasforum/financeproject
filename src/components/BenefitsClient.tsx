"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
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
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader 
          title="공공 혜택 탐색" 
          description="중앙부처 및 지자체에서 제공하는 다양한 혜택 정보를 한곳에서 확인해 보세요." 
        />
        
        <div className="mb-8 space-y-4">
          <Card className="rounded-[2.5rem] border-slate-200/60 p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">주제별 필터</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isTopicFilterBypassed(selectedTopics) ? "primary" : "outline"}
                    className="rounded-full"
                    onClick={() => applyAndRun({ topics: [] })}
                  >
                    전체
                  </Button>
                  {BENEFIT_TOPIC_KEYS.map((topicKey) => (
                    <Button
                      key={topicKey}
                      size="sm"
                      variant={selectedTopics.includes(topicKey) && !isTopicFilterBypassed(selectedTopics) ? "primary" : "outline"}
                      className="rounded-full"
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
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAdvancedOpen((prev) => !prev)}>
                  키워드 검색 {advancedOpen ? "닫기" : "열기"}
                </Button>
                <div className="h-4 w-px bg-slate-100" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">지역</span>
                  <select
                    className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    value={sido}
                    onChange={(e) => applyAndRun({ sido: e.target.value, sigungu: "" })}
                  >
                    <option value="">전국</option>
                    {SIDO_LIST.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                {sido && (
                  <select
                    className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    value={sigungu}
                    onChange={(e) => applyAndRun({ sigungu: e.target.value })}
                  >
                    <option value="">시/군/구 전체</option>
                    {facets.sigungu.map((entry) => (
                      <option key={entry.key} value={entry.key}>{entry.key}</option>
                    ))}
                  </select>
                )}
                
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="rounded-full px-6"
                    onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: 0, includeFacets: true })}
                  >
                    {loading ? "검색 중" : "필터 적용"}
                  </Button>
                </div>
              </div>

              {advancedOpen && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <input
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="찾으시는 혜택 키워드를 입력해 보세요 (예: 청년, 의료비, 임대주택)"
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-emerald-600">{totalMatched.toLocaleString()}건의 혜택</span>
            <div className="h-3 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant={includeNationwide ? "secondary" : "ghost"} className="h-7 rounded-full text-[10px]" onClick={() => applyAndRun({ includeNationwide: !includeNationwide })}>
                전국 포함 {includeNationwide ? "ON" : "OFF"}
              </Button>
              <Button size="sm" variant={includeUnknown ? "secondary" : "ghost"} className="h-7 rounded-full text-[10px]" onClick={() => applyAndRun({ includeUnknown: !includeUnknown })}>
                미상 포함 {includeUnknown ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-[10px] text-slate-400" onClick={() => setAdvancedConfigOpen((prev) => !prev)}>
              고급 설정
            </Button>
            {assumption && <span className="text-[10px] italic text-slate-400">{assumption}</span>}
          </div>
        </div>

        {advancedConfigOpen && (
          <Card className="mb-6 rounded-3xl border-slate-100 bg-slate-50/50 p-4">
             <div className="flex flex-wrap items-center gap-4 text-[11px]">
               <div className="flex gap-2">
                 <Button size="sm" variant={scanAll ? "primary" : "outline"} className="h-7 rounded-full text-[10px]" onClick={() => applyAndRun({ scanAll: true })}>전체 스캔</Button>
                 <Button size="sm" variant={!scanAll ? "primary" : "outline"} className="h-7 rounded-full text-[10px]" onClick={() => applyAndRun({ scanAll: false })}>부분 스캔</Button>
               </div>
               <div className="flex items-center gap-2">
                 <span className="text-slate-400">데이터 수집율</span>
                 <span className="font-bold text-slate-700">{Math.round((meta.snapshot?.completionRate ?? 0) * 100)}%</span>
               </div>
               {process.env.NODE_ENV !== "production" && (
                 <Button size="sm" variant="outline" className="h-7 rounded-full text-[10px] bg-white" onClick={() => void refreshSnapshot()}>
                   스냅샷 강제 갱신
                 </Button>
               )}
             </div>
          </Card>
        )}

        {error && (
          <ErrorState message={error} onRetry={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: 0 })} className="mb-8" />
        )}

        <div className="space-y-6">
          {loading && items.length === 0 ? (
            <LoadingState description="관련된 정부 혜택을 찾고 있습니다." />
          ) : items.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {items.map((item) => {
                  const quality = getBenefitQualityBucket(item);
                  const applyShortcut = extractShortcutFromApplyHow(item.id, item.applyHow);
                  return (
                    <Card key={item.id} className="group flex flex-col overflow-hidden rounded-[2rem] border-slate-200/60 bg-white p-0 shadow-sm transition-all hover:shadow-md">
                      <div className="flex flex-1 flex-col p-6">
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                              {item.topicMatch?.matchedTopics?.[0] ? BENEFIT_TOPICS[item.topicMatch.matchedTopics[0] as BenefitTopicKey]?.label : "지원 혜택"}
                            </span>
                            <h3 className="text-lg font-black leading-snug text-slate-900 group-hover:text-emerald-600 transition-colors">{item.title}</h3>
                          </div>
                          <Badge variant="secondary" className={cn(
                            "border-none px-2 py-0.5 text-[9px] font-bold",
                            quality === "HIGH" ? "bg-emerald-50 text-emerald-700" :
                            quality === "MED" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500"
                          )}>
                            {quality === "HIGH" ? "정보 충분" : quality === "MED" ? "보통" : "정보 부족"}
                          </Badge>
                        </div>
                        
                        <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-500 line-clamp-2">{item.summary}</p>
                        
                        <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="w-12 font-bold text-slate-400 shrink-0">운영기관</span>
                            <span className="font-medium text-slate-700">{item.org || "-"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="w-12 font-bold text-slate-400 shrink-0">신청방법</span>
                            <div className="flex flex-wrap items-center gap-1 font-medium text-slate-700">
                              <span className="line-clamp-1">{item.applyHow || "-"}</span>
                              {applyShortcut && (
                                <a href={applyShortcut} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline underline-offset-2">바로가기</a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-4 px-6">
                        <div className="flex gap-1.5">
                          {item.eligibilityChips?.slice(0, 2).map((chip) => (
                            <span key={chip} className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">{chip}</span>
                          ))}
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs font-bold text-emerald-600 hover:bg-emerald-50" onClick={() => void openDetail(item)}>
                          상세 보기 →
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
              
              {nextCursor !== null && (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-full px-12 font-black shadow-sm"
                    onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: nextCursor, includeFacets: false, append: true, syncUrl: false })}
                    disabled={loading}
                  >
                    {loading ? "로딩 중..." : "혜택 더 보기"}
                  </Button>
                </div>
              )}
            </>
          ) : !loading && !error ? (
            <EmptyState
              title="검색된 혜택이 없습니다"
              description="필터 조건을 완화하거나 다른 키워드로 검색해 보세요."
              actionLabel="필터 초기화"
              onAction={() => applyAndRun({ query: "", topics: [], sido: "", sigungu: "", includeNationwide: true, includeUnknown: true })}
            />
          ) : null}
        </div>
      </Container>
      
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 md:p-8" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[3rem] p-0 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-50/80 p-6 md:p-8 border-b border-slate-100 flex items-start justify-between">
              <div className="space-y-2">
                <Badge className="border-none bg-emerald-100 text-emerald-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                  {selected.topicMatch?.matchedTopics?.[0] ? BENEFIT_TOPICS[selected.topicMatch.matchedTopics[0] as BenefitTopicKey]?.label : "지원 혜택"}
                </Badge>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-snug">{selected.title}</h3>
                <p className="text-sm font-bold text-slate-500">{selected.org}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-10 w-10 rounded-full p-0 bg-white" onClick={() => setSelected(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              <section>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">혜택 설명</p>
                <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 text-sm font-medium leading-relaxed text-slate-700">
                  {selected.summary}
                </div>
              </section>
              
              <section>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">지원 조건</p>
                <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6">
                  {detailLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                      <div className="h-4 w-1/2 rounded-full bg-slate-200" />
                    </div>
                  ) : detail?.conditions?.length ? (
                    <ul className="space-y-4">
                      {detail.conditions.map((line, idx) => (
                        <li key={idx} className="flex gap-3 text-sm font-medium text-slate-700">
                          <span className="text-emerald-500 font-black">•</span>
                          <span className="leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm font-bold text-slate-400 italic">상세 조건 정보가 없습니다.</p>
                  )}
                </div>
              </section>

              {selected.applyHow && (
                <section>
                  <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">신청 방법</p>
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/30 p-6 text-sm font-black text-emerald-800">
                    <p>
                      {selected.applyHow}
                      {selectedApplyShortcut && (
                        <a href={selectedApplyShortcut} target="_blank" rel="noopener noreferrer" className="ml-2 text-emerald-600 underline underline-offset-4 decoration-2">바로가기</a>
                      )}
                    </p>
                  </div>
                </section>
              )}
            </div>

            <div className="bg-slate-50/80 p-5 px-8 border-t border-slate-100">
               <p className="text-[10px] font-bold text-slate-400">데이터 제공: 보조금24 API</p>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
