"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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

function categoryLabel(value: string): string {
  if (value === "housing") return "주거";
  if (value === "jeonse") return "전세";
  if (value === "wolse") return "월세";
  if (value === "childcare" || value === "family" || value === "birth") return "부양가족";
  if (value === "youth") return "청년";
  if (value === "job") return "일자리";
  if (value === "education") return "교육";
  if (value === "medical") return "의료";
  return "전체";
}

function ageBandLabel(value: string): string {
  if (!value || value === "all") return "전체";
  return value;
}

function incomeBandLabel(value: string): string {
  if (!value || value === "all") return "전체";
  return value;
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
  const [errorCode, setErrorCode] = useState("");
  const [selected, setSelected] = useState<BenefitItem | null>(null);
  const [detail, setDetail] = useState<{ conditions?: string[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedHints, setExpandedHints] = useState<Record<string, boolean>>({});
  const [plannerContext, setPlannerContext] = useState<PlannerBenefitsContext>({
    category: "all",
    region: "전국",
    ageBand: "all",
    incomeBand: "all",
  });
  const requestControllerRef = useRef<AbortController | null>(null);
  const initializedFromQueryRef = useRef(false);

  const summaryLines = useMemo(() => {
    return [
      `검색어 ${query.trim() || "-"} · 카테고리 ${categoryLabel(plannerContext.category)}`,
      `지역 ${plannerContext.region} · 연령대 ${ageBandLabel(plannerContext.ageBand)} · 소득 ${incomeBandLabel(plannerContext.incomeBand)}`,
      `적용 필터 주제 ${isTopicFilterBypassed(selectedTopics) ? "전체" : `${selectedTopics.length}개`} · 시도 ${sido || "전체"}`,
    ];
  }, [plannerContext.ageBand, plannerContext.category, plannerContext.incomeBand, plannerContext.region, query, selectedTopics, sido]);

  const checklist = useMemo(() => {
    const itemsList = [
      "상세 보기에서 신청 자격·신청 방법을 확인한다.",
      "조건이 과도하면 카테고리 또는 지역 필터를 완화해 다시 조회한다.",
      "적용 가능한 혜택은 플래너 가정값(월 지출/목표)에 반영한다.",
    ];
    if (items.length === 0) {
      itemsList.push("조회 0건이면 region=전국 또는 category=all로 재시도한다.");
    }
    if (error) {
      itemsList.push("오류가 반복되면 데이터 소스 상태 페이지에서 연결 상태를 점검한다.");
    }
    return itemsList.slice(0, 6);
  }, [error, items.length]);

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
    setErrorCode("");
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
        setErrorCode(typeof json?.error?.code === "string" ? json.error.code : "");
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
    <main className="py-8">
      <Container>
        <SectionHeader 
          title="혜택 후보 검색" 
          subtitle="보조금24 연계 · 조건 기반 참고 목록" 
          icon="/icons/ic-recommend.png"
        />
        <Card>
          <div className="space-y-2">
            <p className="text-xs text-slate-600">주제</p>
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdvancedOpen((prev) => !prev)}>
                고급 검색 {advancedOpen ? "접기" : "펼치기"}
              </Button>
              <Button onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: 0, includeFacets: true })}>
                {loading ? "로딩..." : "검색"}
              </Button>
            </div>
          </div>

          {advancedOpen ? (
            <div className="mt-3 space-y-2 rounded-xl border border-border bg-slate-50 p-3">
              <p className="text-xs text-slate-600">자유 텍스트(선택)</p>
              <div className="flex gap-2">
                <input className="h-10 rounded-xl border border-border px-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="키워드(예: 청년내일, 의료비)" />
                <Button onClick={() => applyAndRun({ query })}>적용</Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-600">시/도</p>
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
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">시/군/구</p>
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

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={includeNationwide ? "primary" : "outline"} onClick={() => applyAndRun({ includeNationwide: !includeNationwide })}>
              전국 포함 ({meta.counts?.nationwide ?? 0})
            </Button>
            <Button size="sm" variant={includeUnknown ? "primary" : "outline"} onClick={() => applyAndRun({ includeUnknown: !includeUnknown })}>
              미상 포함 ({meta.counts?.unknown ?? 0})
            </Button>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-700">
              {(sido || "선택")} 지역 {meta.counts?.regional ?? 0} · 전국 {meta.counts?.nationwide ?? 0} · 미상 {meta.counts?.unknown ?? 0} · 합계 {meta.counts?.total ?? items.length}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              총 결과 {totalMatched}개 (스냅샷 {meta.snapshot?.totalItemsInSnapshot ?? "?"}개 / 업스트림 {meta.upstreamTotalCount ?? "?"}개)
            </p>
            {topicBuckets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {topicBuckets.slice(0, 8).map(([label, count]) => (
                  <span key={`${label}-${count}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                    {label} {count}
                  </span>
                ))}
              </div>
            ) : null}
            {meta.pipeline ? (
              <p className="mt-1 text-xs text-slate-600">
                스냅샷 {meta.pipeline.snapshotUnique} → 주제/검색 {meta.pipeline.afterAdvancedQuery} → 토글 {meta.pipeline.afterScopeToggles} → 지역 {sigungu ? meta.pipeline.afterSigungu : meta.pipeline.afterSido} → 표시 {meta.pipeline.afterLimit}
              </p>
            ) : null}
            {meta.pipelineReason ? <p className="mt-1 text-xs text-slate-500">{meta.pipelineReason}</p> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!isTopicFilterBypassed(selectedTopics)
              ? selectedTopics.map((topic) => (
                <Button
                  key={`topic-${topic}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyAndRun({ topics: selectedTopics.filter((entry) => entry !== topic) })}
                >
                  주제: {BENEFIT_TOPICS[topic].label} ×
                </Button>
              ))
              : <span className="text-xs text-slate-500">주제: 전체</span>}
            {query.trim() ? <Button type="button" size="sm" variant="outline" onClick={() => applyAndRun({ query: "" })}>고급검색: {query.trim()} ×</Button> : null}
            {sido ? <Button type="button" size="sm" variant="outline" onClick={() => applyAndRun({ sido: "", sigungu: "" })}>시/도: {sido} ×</Button> : null}
            {sigungu ? <Button type="button" size="sm" variant="outline" onClick={() => applyAndRun({ sigungu: "" })}>시군구: {sigungu} ×</Button> : null}
            {!includeNationwide ? <Button type="button" size="sm" variant="outline" onClick={() => applyAndRun({ includeNationwide: true })}>전국 포함 OFF ×</Button> : null}
            {!includeUnknown ? <Button type="button" size="sm" variant="outline" onClick={() => applyAndRun({ includeUnknown: true })}>미상 포함 OFF ×</Button> : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyAndRun({ query: "", topics: [], sido: "", sigungu: "", includeNationwide: true, includeUnknown: true })}
            >
              필터 초기화
            </Button>
          </div>

          {(typeof meta.snapshot?.completionRate === "number" && meta.snapshot.completionRate < 0.95) || meta.snapshot?.truncatedByHardCap ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              스냅샷 완주율 {typeof meta.snapshot?.completionRate === "number" ? `${Math.round(meta.snapshot.completionRate * 1000) / 10}%` : "?"} (필요 페이지 {meta.snapshot?.neededPagesEstimate ?? meta.neededPagesEstimate ?? "?"})
              <div className="mt-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void refreshSnapshot()}>
                  전체 수집 다시하기
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setAdvancedConfigOpen((prev) => !prev)}>
              고급 설정 {advancedConfigOpen ? "접기" : "펼치기"}
            </Button>
          </div>

          {advancedConfigOpen ? (
            <div className="mt-3 space-y-2 rounded-xl border border-border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={scanAll ? "primary" : "outline"} onClick={() => applyAndRun({ scanAll: true })}>전체 수집(스캔)</Button>
                <Button size="sm" variant={scanAll ? "outline" : "primary"} onClick={() => applyAndRun({ scanAll: false })}>빠른 조회(1페이지)</Button>
                <label className="text-xs text-slate-600">페이지 크기</label>
                <select
                  className="h-8 rounded-lg border border-border px-2 text-xs"
                  value={pageSize}
                  onChange={(e) => applyAndRun({ pageSize: Number(e.target.value) })}
                >
                  {[50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <label className="text-xs text-slate-600">최대 페이지</label>
                <select
                  className="h-8 rounded-lg border border-border px-2 text-xs"
                  value={String(maxPages)}
                  onChange={(e) => applyAndRun({ maxPages: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
                >
                  <option value="auto">auto</option>
                  {[5, 10, 20, 30].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => applyAndRun({ maxPages: "auto", scanAll: true })}>
                  필요 페이지로 설정
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                총 {meta.upstreamTotalCount ?? "?"}개(업스트림) · 수집 {meta.uniqueCount ?? meta.uniqueIds ?? items.length}개(고유) · 표시 {items.length}개
              </p>
              <p className="mt-1 text-xs text-slate-600">
                필요 페이지 {meta.neededPagesEstimate ?? "?"} · 현재 maxPages {String(maxPages)} · 수집률{" "}
                {typeof meta.upstreamTotalCount === "number" && meta.upstreamTotalCount > 0
                  ? `${Math.min(100, Math.round((((meta.uniqueCount ?? meta.uniqueIds ?? items.length) / meta.upstreamTotalCount) * 100) * 10) / 10)}%`
                  : "?"}
              </p>
              {meta.snapshot?.generatedAt ? (
                <p className="mt-1 text-xs text-slate-600">
                  스냅샷: {new Date(meta.snapshot.generatedAt).toLocaleString("ko-KR")} ({meta.snapshot.fromCache ?? "built"}, age {Math.round((meta.snapshot.ageMs ?? 0) / 60000)}m)
                </p>
              ) : null}
              {meta.snapshot?.requestedMaxPages !== undefined || meta.snapshot?.effectiveMaxPages !== undefined || meta.snapshot?.pagesFetched !== undefined ? (
                <p className="mt-1 text-xs text-slate-600">
                  maxPages 요청 {String(meta.snapshot?.requestedMaxPages ?? "?")} · 실제 {meta.snapshot?.effectiveMaxPages ?? "?"} · pagesFetched {meta.snapshot?.pagesFetched ?? meta.pagesFetched ?? "?"}
                </p>
              ) : null}
              {process.env.NODE_ENV !== "production" ? (
                <div className="mt-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => void refreshSnapshot()}>스냅샷 새로고침</Button>
                </div>
              ) : null}
              {meta.paginationSuspected ? <p className="mt-1 text-xs text-amber-700">페이징 미동작 의심(환경설정/URL/파라미터 확인)</p> : null}
              {meta.truncatedByLimit ? <p className="mt-1 text-xs text-amber-700">현재 페이지 크기로 일부만 표시 중입니다. 더 보기를 눌러 이어서 확인하세요.</p> : null}
              {meta.truncatedByMaxPages ? <p className="mt-1 text-xs text-amber-700">스캔 상한(maxPages)으로 일부만 수집했습니다.</p> : null}
            </div>
          ) : null}

          {error ? <p className="mt-2 text-sm text-red-700" data-testid="benefits-error-banner">{error}</p> : null}
          {errorCode ? <p className="mt-1 text-xs text-red-600">오류 코드: {errorCode}</p> : null}
          {assumption ? <p className="mt-2 text-xs text-slate-500">{assumption}</p> : null}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">조건 요약</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {summaryLines.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-semibold text-slate-800">다음 행동 체크리스트</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {checklist.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          {!includeNationwide && !includeUnknown ? (
            <p className="mt-1 text-xs text-amber-700">전국/미상을 제외하면 0건이 될 수 있습니다.</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">혜택은 자격/소득/가구/지역 조건에 따라 실제 적용 여부가 달라질 수 있습니다.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface-muted p-2" data-testid="benefits-item">
                <p className="font-medium">
                  {item.title}
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-slate-600">
                    {(() => {
                      const q = getBenefitQualityBucket(item);
                      if (q === "HIGH") return "정보 충분";
                      if (q === "MED") return "정보 보통";
                      if (q === "LOW") return "정보 부족";
                      return "정보 없음";
                    })()}
                  </span>
                </p>
                <p className="text-slate-600">{item.summary}</p>
                {item.topicMatch && item.topicMatch.evidence.length > 0 ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    매칭: {item.topicMatch.evidence.map((entry) => `${BENEFIT_TOPICS[entry.topic as BenefitTopicKey]?.label ?? entry.topic}(${entry.field})`).join(", ")}
                  </p>
                ) : null}
                {item.org ? <p className="mt-1 text-xs text-slate-500">기관: {item.org}</p> : null}
                {item.applyHow ? <p className="mt-1 text-xs text-slate-500">신청 방법: {item.applyHow}</p> : null}
                {Array.isArray(item.eligibilityChips) && item.eligibilityChips.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.eligibilityChips.slice(0, 3).map((chip) => (
                      <span key={chip} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-slate-600">{chip}</span>
                    ))}
                  </div>
                ) : null}
                {item.eligibilityExcerpt ? (
                  <div className="mt-1">
                    <p
                      className="text-xs text-slate-500"
                      style={
                        expandedHints[item.id]
                          ? { whiteSpace: "normal" }
                          : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }
                      }
                    >
                      조건 요약: {expandedHints[item.id] ? (item.eligibilityText ?? item.eligibilityExcerpt) : item.eligibilityExcerpt}
                    </p>
                    {item.isEligibilityTruncated ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-6 px-1 text-[11px]"
                        onClick={() => setExpandedHints((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        {expandedHints[item.id] ? "접기" : "더보기"}
                      </Button>
                    ) : null}
                  </div>
                ) : Array.isArray(item.eligibilityHints) && item.eligibilityHints.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">조건 요약: {item.eligibilityHints.slice(0, 2).join(" · ")}</p>
                ) : null}
                {(() => {
                  const q = getBenefitQualityBucket(item);
                  return q === "LOW" || q === "EMPTY"
                    ? <p className="mt-1 text-xs text-amber-700">원본 API가 제공하는 조건/신청 정보가 제한적입니다.</p>
                    : null;
                })()}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => void openDetail(item)}>상세 보기</Button>
                </div>
              </li>
            ))}
          </ul>
          {!loading && !error && items.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center py-16 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200 backdrop-blur-sm text-center" data-testid="benefits-empty">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-100/30 blur-3xl rounded-full" />
                <Image src="/visuals/empty-finance.png" alt="" aria-hidden="true" width={192} height={192} className="relative w-48 h-auto object-contain opacity-60" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">조회된 혜택이 없습니다</h3>
              <div className="mt-4 space-y-1 text-sm font-medium text-slate-500">
                {!includeNationwide && !includeUnknown ? (
                  <p className="text-amber-700">전국/미상을 제외하면 0건이 될 수 있습니다(원본 지역정보 부족).</p>
                ) : null}
                {sido && (facets.sido.find((entry) => entry.key === sido)?.count ?? 0) === 0 ? (
                  <p className="text-amber-700">현재 스냅샷에서 {sido}로 분류된 항목이 0개입니다(미상/전국 비중이 큼).</p>
                ) : null}
                <p>
                  {(meta.rawMatched ?? meta.matchedRows ?? 0) > 0 && (meta.normalizedCount ?? 0) === 0
                    ? `원본 후보 ${meta.rawMatched ?? meta.matchedRows ?? 0}건을 찾았지만 정규화 결과는 0건입니다.`
                    : typeof meta.upstreamTotalCount === "number" && meta.upstreamTotalCount === 0
                    ? "업스트림 결과가 0건입니다. 키워드/데이터 갱신 시점을 확인하세요."
                    : `API에서 ${meta.scannedRows ?? 0}건을 받아 검색어 매칭 0건입니다.`}
                </p>
              </div>
              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="rounded-2xl px-6" onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: 0, includeFacets: true })}>전체 보기</Button>
                <Button variant="primary" className="rounded-2xl px-6 shadow-lg shadow-emerald-100" onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { deep: true, cursor: 0, includeFacets: true })}>더 깊게 검색</Button>
              </div>
            </div>
          ) : null}
          {!loading && !error && items.length > 0 && meta.truncated ? (
            <p className="mt-2 text-xs text-amber-700">스캔 상한에 도달해 일부 결과만 표시했습니다. 더 깊게 검색을 사용하세요.</p>
          ) : null}
          {!loading && !error && nextCursor !== null ? (
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void run({ query, topics: selectedTopics, sido, sigungu, includeNationwide, includeUnknown, scanAll, pageSize, maxPages }, { cursor: nextCursor, includeFacets: false, append: true, syncUrl: false })}
              >
                더 보기
              </Button>
            </div>
          ) : null}
        </Card>
      </Container>
      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>닫기</Button>
            </div>
            <details open className="mt-3 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">서비스 개요</summary>
              <p className="mt-2 text-sm text-slate-700">{selected.summary}</p>
              {selected.org ? <p className="mt-1 text-xs text-slate-500">기관: {selected.org}</p> : null}
              {selected.applyHow ? <p className="mt-1 text-xs text-slate-500">신청 방법: {selected.applyHow}</p> : null}
            </details>
            <details className="mt-2 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">지원 대상/조건</summary>
              {detailLoading ? <p className="mt-2 text-xs text-slate-500">로딩 중...</p> : null}
              {!detailLoading && detail?.conditions?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                  {detail.conditions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {!detailLoading && (!detail?.conditions || detail.conditions.length === 0) ? (
                <p className="mt-2 text-xs text-slate-500">원본 API에서 지원 대상/조건 필드를 제공하지 않았습니다.</p>
              ) : null}
            </details>
          </div>
        </div>
      ) : null}
    </main>
  );
}
