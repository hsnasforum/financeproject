"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { type FinlifeKind, type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { scoreProducts, type RecommendProfile, type ScoredProduct } from "@/lib/recommend/score";
import { scoreBenefits, type BenefitRecommendProfile, type ScoredBenefit } from "@/lib/recommend/scoreBenefits";
import { summarizeProductHighlights } from "@/lib/finlife/highlights";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import { getBenefitQualityBucket } from "@/lib/publicApis/benefitsQuality";
import {
  BENEFIT_ALL_TOPICS_COUNT,
  BENEFIT_TOPIC_KEYS,
  BENEFIT_TOPICS,
  isTopicFilterBypassed,
  parseTopicKeys,
  type BenefitTopicKey,
} from "@/lib/publicApis/benefitsTopics";
import { SIDO_LIST, normalizeSido } from "@/lib/regions/kr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type TabId = "saving" | "loan" | "benefits";

type RegionFacet = { key: string; count: number };
type BenefitMeta = {
  upstreamTotalCount?: number;
  uniqueCount?: number;
  uniqueIds?: number;
  paginationSuspected?: boolean;
  truncatedByLimit?: boolean;
  truncatedByMaxPages?: boolean;
  neededPagesEstimate?: number;
  snapshot?: {
    fromCache?: "memory" | "disk" | "built";
    generatedAt?: string;
    ageMs?: number;
    totalItemsInSnapshot?: number;
  };
};

type StoredState = {
  tab: TabId;
  savingKinds: FinlifeKind[];
  savingTerms: string;
  savingLiquidity: RecommendProfile["liquidityNeed"];
  savingRatePref: RecommendProfile["ratePreference"];
  loanKind: FinlifeKind;
  loanTerms: string;
  loanLiquidity: RecommendProfile["liquidityNeed"];
  loanRatePref: RecommendProfile["ratePreference"];
  benefitSido: string;
  benefitSigungu: string;
  benefitTopics: BenefitTopicKey[];
  benefitQuery: string;
  includeNationwide: boolean;
  includeUnknown: boolean;
};

const STORAGE_KEY = "recommend-hub:v1";
function parseTerms(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parseKinds(value: unknown, fallback: FinlifeKind[]): FinlifeKind[] {
  if (!Array.isArray(value)) return fallback;
  const all: FinlifeKind[] = ["deposit", "saving", "mortgage-loan", "rent-house-loan", "credit-loan"];
  const filtered = value.filter((v): v is FinlifeKind => typeof v === "string" && all.includes(v as FinlifeKind));
  return filtered.length ? filtered : fallback;
}

function parseLiquidity(value: unknown, fallback: RecommendProfile["liquidityNeed"]): RecommendProfile["liquidityNeed"] {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function parseRatePreference(value: unknown, fallback: RecommendProfile["ratePreference"]): RecommendProfile["ratePreference"] {
  return value === "balanced" || value === "aggressive" ? value : fallback;
}

function parseLoanKind(value: unknown): FinlifeKind {
  if (value === "mortgage-loan" || value === "rent-house-loan" || value === "credit-loan") return value;
  return "mortgage-loan";
}

function parseTab(value: unknown): TabId {
  if (value === "saving" || value === "loan" || value === "benefits") return value;
  return "saving";
}

function getProductLabel(kind: FinlifeKind): string {
  if (kind === "deposit") return "예금";
  if (kind === "saving") return "적금";
  if (kind === "pension") return "연금저축";
  if (kind === "mortgage-loan") return "주담대";
  if (kind === "rent-house-loan") return "전세대출";
  return "신용대출";
}

function parseBenefitsResponse(json: unknown): { items: BenefitCandidate[]; totalMatched: number; facets: { sido: RegionFacet[]; sigungu: RegionFacet[] }; meta: BenefitMeta } {
  if (!json || typeof json !== "object") return { items: [], totalMatched: 0, facets: { sido: [], sigungu: [] }, meta: {} };
  const root = json as { data?: unknown; meta?: unknown };
  if (!root.data || typeof root.data !== "object") return { items: [], totalMatched: 0, facets: { sido: [], sigungu: [] }, meta: {} };
  const data = root.data as {
    items?: unknown;
    facets?: { sido?: unknown; sigungu?: unknown };
  };

  const items = Array.isArray(data.items) ? (data.items as BenefitCandidate[]) : [];
  const totalMatched = typeof (data as { totalMatched?: unknown }).totalMatched === "number"
    ? ((data as { totalMatched: number }).totalMatched)
    : items.length;
  const sido = Array.isArray(data.facets?.sido) ? (data.facets?.sido as RegionFacet[]) : [];
  const sigungu = Array.isArray(data.facets?.sigungu) ? (data.facets?.sigungu as RegionFacet[]) : [];
  const metaRaw = root.meta && typeof root.meta === "object" ? (root.meta as Record<string, unknown>) : {};
  const meta: BenefitMeta = {
    upstreamTotalCount: typeof metaRaw.upstreamTotalCount === "number" ? metaRaw.upstreamTotalCount : undefined,
    uniqueCount: typeof metaRaw.uniqueCount === "number" ? metaRaw.uniqueCount : undefined,
    uniqueIds: typeof metaRaw.uniqueIds === "number" ? metaRaw.uniqueIds : undefined,
    paginationSuspected: Boolean(metaRaw.paginationSuspected),
    truncatedByLimit: Boolean(metaRaw.truncatedByLimit),
    truncatedByMaxPages: Boolean(metaRaw.truncatedByMaxPages),
    neededPagesEstimate: typeof metaRaw.neededPagesEstimate === "number" ? metaRaw.neededPagesEstimate : undefined,
    snapshot: metaRaw.snapshot && typeof metaRaw.snapshot === "object" ? (metaRaw.snapshot as BenefitMeta["snapshot"]) : undefined,
  };

  return { items, totalMatched, facets: { sido, sigungu }, meta };
}

export function RecommendHubClient() {
  const [tab, setTab] = useState<TabId>("saving");

  const [savingKinds, setSavingKinds] = useState<FinlifeKind[]>(["deposit", "saving"]);
  const [savingTerms, setSavingTerms] = useState("12,24");
  const [savingLiquidity, setSavingLiquidity] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [savingRatePref, setSavingRatePref] = useState<RecommendProfile["ratePreference"]>("balanced");
  const [savingResults, setSavingResults] = useState<ScoredProduct[]>([]);
  const [savingLoading, setSavingLoading] = useState(false);
  const [savingScanAll, setSavingScanAll] = useState(false);
  const [savingCounts, setSavingCounts] = useState<{ products: number; options: number }>({ products: 0, options: 0 });

  const [loanKind, setLoanKind] = useState<FinlifeKind>("mortgage-loan");
  const [loanTerms, setLoanTerms] = useState("12,24");
  const [loanLiquidity, setLoanLiquidity] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [loanRatePref, setLoanRatePref] = useState<RecommendProfile["ratePreference"]>("balanced");
  const [loanResults, setLoanResults] = useState<ScoredProduct[]>([]);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanScanAll, setLoanScanAll] = useState(false);
  const [loanCounts, setLoanCounts] = useState<{ products: number; options: number }>({ products: 0, options: 0 });

  const [benefitSido, setBenefitSido] = useState("");
  const [benefitSigungu, setBenefitSigungu] = useState("");
  const [benefitTopics, setBenefitTopics] = useState<BenefitTopicKey[]>([]);
  const [benefitQuery, setBenefitQuery] = useState("");
  const [benefitAdvancedOpen, setBenefitAdvancedOpen] = useState(false);
  const [includeNationwide, setIncludeNationwide] = useState(true);
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [benefitFacets, setBenefitFacets] = useState<{ sido: RegionFacet[]; sigungu: RegionFacet[] }>({ sido: [], sigungu: [] });
  const [hasBenefitFacets, setHasBenefitFacets] = useState(false);
  const [benefitResults, setBenefitResults] = useState<ScoredBenefit[]>([]);
  const [benefitLoading, setBenefitLoading] = useState(false);
  const [benefitScanAll] = useState(true);
  const [benefitLimit, setBenefitLimit] = useState(200);
  const [benefitMaxPages, setBenefitMaxPages] = useState(10);
  const [benefitMeta, setBenefitMeta] = useState<BenefitMeta>({});
  const [benefitCandidateCount, setBenefitCandidateCount] = useState(0);
  const [benefitTotalMatched, setBenefitTotalMatched] = useState(0);

  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      setTab(parseTab(parsed.tab));
      setSavingKinds(parseKinds(parsed.savingKinds, ["deposit", "saving"]));
      setSavingTerms(typeof parsed.savingTerms === "string" ? parsed.savingTerms : "12,24");
      setSavingLiquidity(parseLiquidity(parsed.savingLiquidity, "medium"));
      setSavingRatePref(parseRatePreference(parsed.savingRatePref, "balanced"));
      setLoanKind(parseLoanKind(parsed.loanKind));
      setLoanTerms(typeof parsed.loanTerms === "string" ? parsed.loanTerms : "12,24");
      setLoanLiquidity(parseLiquidity(parsed.loanLiquidity, "medium"));
      setLoanRatePref(parseRatePreference(parsed.loanRatePref, "balanced"));
      setBenefitSido(typeof parsed.benefitSido === "string" ? parsed.benefitSido : "");
      setBenefitSigungu(typeof parsed.benefitSigungu === "string" ? parsed.benefitSigungu : "");
      const parsedTopics = parseTopicKeys(Array.isArray(parsed.benefitTopics) ? parsed.benefitTopics.map(String) : []);
      setBenefitTopics(isTopicFilterBypassed(parsedTopics) ? [] : parsedTopics);
      setBenefitQuery(typeof parsed.benefitQuery === "string" ? parsed.benefitQuery : "");
      setIncludeNationwide(parseBoolean(parsed.includeNationwide, true));
      setIncludeUnknown(parseBoolean(parsed.includeUnknown, true));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    const payload: StoredState = {
      tab,
      savingKinds,
      savingTerms,
      savingLiquidity,
      savingRatePref,
      loanKind,
      loanTerms,
      loanLiquidity,
      loanRatePref,
      benefitSido,
      benefitSigungu,
      benefitTopics,
      benefitQuery,
      includeNationwide,
      includeUnknown,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    tab,
    savingKinds,
    savingTerms,
    savingLiquidity,
    savingRatePref,
    loanKind,
    loanTerms,
    loanLiquidity,
    loanRatePref,
    benefitSido,
    benefitSigungu,
    benefitTopics,
    benefitQuery,
    includeNationwide,
    includeUnknown,
  ]);

  const savingKindOptions = useMemo(
    () => [
      { key: "deposit" as const, label: "예금" },
      { key: "saving" as const, label: "적금" },
    ],
    [],
  );

  const toggleSavingKind = useCallback((kind: FinlifeKind) => {
    setSavingKinds((prev) => {
      if (prev.includes(kind)) {
        const next = prev.filter((entry) => entry !== kind);
        return next.length ? next : prev;
      }
      return [...prev, kind];
    });
  }, []);

  const runSavingRecommendation = useCallback(async () => {
    setSavingLoading(true);
    setError("");
    try {
      const responses = await Promise.all(
        savingKinds.map(async (kind) => {
          const params = new URLSearchParams({ topFinGrpNo: "020000", pageNo: "1" });
          if (savingScanAll) params.set("scan", "all");
          const res = await fetch(`/api/finlife/${kind}?${params.toString()}`, { cache: "no-store" });
          const parsed = parseFinlifeApiResponse(await res.json()) as FinlifeSourceResult;
          return parsed;
        }),
      );
      const products: NormalizedProduct[] = responses.flatMap((entry) => entry.data ?? []);
      const totalOptions = products.reduce((sum, product) => sum + (product.options?.length ?? 0), 0);
      setSavingCounts({ products: products.length, options: totalOptions });
      const profile: RecommendProfile = {
        purpose: "저축",
        preferredTerms: parseTerms(savingTerms),
        liquidityNeed: savingLiquidity,
        ratePreference: savingRatePref,
        rateDirection: "higher",
        topN: 5,
      };
      setSavingResults(scoreProducts(products, profile));
    } catch {
      setError("저축 추천 데이터를 불러오지 못했습니다.");
    } finally {
      setSavingLoading(false);
    }
  }, [savingKinds, savingLiquidity, savingRatePref, savingScanAll, savingTerms]);

  const runLoanRecommendation = useCallback(async () => {
    setLoanLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ topFinGrpNo: "020000", pageNo: "1" });
      if (loanScanAll) params.set("scan", "all");
      const res = await fetch(`/api/finlife/${loanKind}?${params.toString()}`, { cache: "no-store" });
      const parsed = parseFinlifeApiResponse(await res.json()) as FinlifeSourceResult;
      const totalOptions = (parsed.data ?? []).reduce((sum, product) => sum + (product.options?.length ?? 0), 0);
      setLoanCounts({ products: parsed.data?.length ?? 0, options: totalOptions });
      const profile: RecommendProfile = {
        purpose: "대출",
        preferredTerms: parseTerms(loanTerms),
        liquidityNeed: loanLiquidity,
        ratePreference: loanRatePref,
        rateDirection: "lower",
        topN: 5,
      };
      setLoanResults(scoreProducts(parsed.data ?? [], profile));
    } catch {
      setError("대출 추천 데이터를 불러오지 못했습니다.");
    } finally {
      setLoanLoading(false);
    }
  }, [loanKind, loanLiquidity, loanRatePref, loanScanAll, loanTerms]);

  const toggleTopic = useCallback((topic: BenefitTopicKey) => {
    setBenefitTopics((prev) => {
      const current = isTopicFilterBypassed(prev) ? [] : prev;
      let next = current.includes(topic) ? current.filter((entry) => entry !== topic) : [...current, topic];
      if (next.length === BENEFIT_ALL_TOPICS_COUNT) next = [];
      return next;
    });
  }, []);

  const runBenefitRecommendation = useCallback(async () => {
    setBenefitLoading(true);
    setError("");
    try {
      const normalizedTopics = isTopicFilterBypassed(benefitTopics) ? [] : benefitTopics;
      const params = new URLSearchParams({ mode: "all", limit: String(benefitLimit), maxPages: String(benefitMaxPages), rows: "200" });
      params.set("scan", benefitScanAll ? "all" : "page");
      if (benefitSido) params.set("sido", benefitSido);
      if (benefitSigungu) params.set("sigungu", benefitSigungu);
      if (!includeNationwide) params.set("includeNationwide", "0");
      if (!includeUnknown) params.set("includeUnknown", "0");
      if (benefitQuery.trim()) params.set("query", benefitQuery.trim());
      if (normalizedTopics.length > 0) params.set("topics", normalizedTopics.join(","));

      const res = await fetch(`/api/public/benefits/search?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setError(typeof json?.error?.message === "string" ? json.error.message : "혜택 추천 데이터를 불러오지 못했습니다.");
        return;
      }
      const parsed = parseBenefitsResponse(json);
      setBenefitFacets(parsed.facets);
      setHasBenefitFacets(true);
      setBenefitMeta(parsed.meta);
      setBenefitCandidateCount(parsed.items.length);
      setBenefitTotalMatched(parsed.totalMatched);

      const profile: BenefitRecommendProfile = {
        topics: normalizedTopics,
        query: benefitQuery,
        sido: benefitSido || undefined,
        sigungu: benefitSigungu || undefined,
        includeNationwide,
        includeUnknown,
        topN: 5,
      };
      setBenefitResults(scoreBenefits(parsed.items, profile));
    } catch {
      setError("혜택 추천 데이터를 불러오지 못했습니다.");
    } finally {
      setBenefitLoading(false);
    }
  }, [benefitLimit, benefitMaxPages, benefitQuery, benefitScanAll, benefitSido, benefitSigungu, benefitTopics, includeNationwide, includeUnknown]);

  const benefitSidoCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const facet of benefitFacets.sido) {
      const key = normalizeSido(facet.key) ?? facet.key;
      map.set(key, facet.count);
    }
    return map;
  }, [benefitFacets.sido]);

  return (
    <main className="py-12 bg-slate-50 min-h-screen">
      <Container>
        <SectionHeader 
          title="추천 허브" 
          subtitle="당신을 위한 최적의 금융 솔루션을 데이터 기반으로 제안합니다" 
          icon="/icons/ic-recommend.png"
        />
        
        <div className="mt-8 flex flex-col gap-8">
          <Card className="p-2 border-none shadow-md shadow-slate-200/50 bg-white rounded-[2rem]">
            <div className="flex flex-wrap gap-1">
              {[
                { id: "saving", label: "목돈 만들기", icon: "💰" },
                { id: "loan", label: "현명한 대출", icon: "🏠" },
                { id: "benefits", label: "국가 혜택", icon: "🎁" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id as TabId)}
                  className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-4 px-6 rounded-[1.75rem] text-sm font-black transition-all duration-300 ${
                    tab === item.id 
                      ? "bg-slate-900 text-white shadow-xl translate-y-[-2px]" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-8 border-none shadow-xl shadow-slate-200/50 bg-white">
            {tab === "saving" ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid gap-8 lg:grid-cols-2">
                   <div className="space-y-6">
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">상품 유형</p>
                        <div className="flex flex-wrap gap-2">
                          {savingKindOptions.map((entry) => (
                            <Button key={entry.key} size="sm" variant={savingKinds.includes(entry.key) ? "primary" : "outline"} onClick={() => toggleSavingKind(entry.key)} className="rounded-xl px-4 py-2">
                              {entry.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">저축 기간(개월)</label>
                          <input className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all outline-none" value={savingTerms} onChange={(e) => setSavingTerms(e.target.value)} placeholder="예: 12,24" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">유동성 필요도</label>
                          <select className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all outline-none appearance-none" value={savingLiquidity} onChange={(e) => setSavingLiquidity(e.target.value as RecommendProfile["liquidityNeed"])}>
                            <option value="low">낮음</option>
                            <option value="medium">보통</option>
                            <option value="high">높음</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">수익률 성향</label>
                          <select className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all outline-none appearance-none" value={savingRatePref} onChange={(e) => setSavingRatePref(e.target.value as RecommendProfile["ratePreference"])}>
                            <option value="balanced">안정 추구</option>
                            <option value="aggressive">수익 추구</option>
                          </select>
                        </div>
                      </div>
                   </div>
                   <div className="flex flex-col justify-end gap-4 bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">분석 범위</p>
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" variant={savingScanAll ? "outline" : "primary"} onClick={() => setSavingScanAll(false)} className="rounded-xl">빠른 추천</Button>
                              <Button size="sm" variant={savingScanAll ? "primary" : "outline"} onClick={() => setSavingScanAll(true)} className="rounded-xl">전체 스캔</Button>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">데이터 규모</p>
                            <p className="mt-1 text-sm font-black text-slate-700">상품 {savingCounts.products} · 옵션 {savingCounts.options}</p>
                         </div>
                      </div>
                      <Button size="lg" className="h-14 w-full shadow-lg shadow-emerald-200/50 rounded-2xl text-base font-black" onClick={() => void runSavingRecommendation()}>
                        {savingLoading ? "데이터 분석 중..." : "최적 상품 추천받기"}
                      </Button>
                   </div>
                </div>

                {savingResults.length > 0 ? (
                  <div className="pt-8 border-t border-slate-50">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 px-2">AI 추천 결과 TOP 5</h3>
                    <div className="grid gap-4">
                      {savingResults.map((row, idx) => (
                        <div key={row.product.fin_prdt_cd} className="group relative rounded-3xl border border-slate-100 bg-white p-6 transition-all duration-300 hover:shadow-xl hover:border-emerald-200">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">
                                  {idx + 1}
                                </span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{row.product.kor_co_nm}</span>
                              </div>
                              <h4 className="text-xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors leading-tight">
                                {row.product.fin_prdt_nm ?? row.product.fin_prdt_cd}
                              </h4>
                              {(() => {
                                const hl = summarizeProductHighlights(row.product);
                                return (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="bg-slate-50 text-slate-500 border-none font-bold text-[10px] px-2.5 rounded-lg">{hl.joinTargetLabel}</Badge>
                                    <Badge variant="outline" className="border-slate-100 text-slate-400 font-bold text-[10px] px-2.5 rounded-lg">난이도: {hl.conditionsComplexity}</Badge>
                                    <span className="text-[11px] font-bold text-slate-400 ml-1">{hl.specialRateHint}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex items-end gap-6 text-right">
                               <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">매칭 점수</span>
                                  <span className="text-3xl font-black text-emerald-600 tabular-nums leading-none tracking-tighter">
                                    {row.explain.finalPoints.toFixed(1)}
                                  </span>
                               </div>
                               <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">대표 금리</span>
                                  <span className="text-xl font-black text-slate-900 tabular-nums leading-none">
                                    {row.explain.pickedOption.comparableRate?.toFixed(2) ?? "-"}%
                                  </span>
                               </div>
                            </div>
                          </div>
                          <div className="mt-6 pt-6 border-t border-slate-50">
                             <p className="text-sm font-bold text-slate-700 leading-relaxed">
                               <span className="text-emerald-600 mr-2 font-black">WHY</span>
                               {row.explain.why.summary}
                             </p>
                             <ul className="mt-4 grid md:grid-cols-3 gap-3">
                                {row.explain.why.bullets.slice(0, 3).map((line, i) => (
                                  <li key={i} className="flex items-start gap-2 text-[11px] font-medium text-slate-500 leading-snug">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                                    {line}
                                  </li>
                                ))}
                             </ul>
                          </div>
                          <details className="mt-6 group/details">
                            <summary className="list-none cursor-pointer">
                               <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover/details:bg-slate-100 group-hover/details:text-slate-600 transition-all">
                                 Detailed Scoring Analysis
                                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="group-open/details:rotate-180 transition-transform"><path d="m6 9 6 6 6-6"/></svg>
                               </div>
                            </summary>
                            <div className="mt-4 p-5 rounded-2xl bg-slate-50 border border-slate-100 grid md:grid-cols-2 gap-6">
                               <div className="space-y-3">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Contribution Breakdown</p>
                                  <div className="space-y-2 text-xs font-bold">
                                     <div className="flex justify-between"><span>금리 경쟁력</span><span className="text-slate-900">{row.explain.contributions.ratePoints.toFixed(1)}</span></div>
                                     <div className="flex justify-between"><span>기간 적합성</span><span className="text-slate-900">{row.explain.contributions.termPoints.toFixed(1)}</span></div>
                                     <div className="flex justify-between"><span>유동성 가점</span><span className="text-slate-900">{row.explain.contributions.liquidityPoints.toFixed(1)}</span></div>
                                  </div>
                               </div>
                               <div className="space-y-3">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Technical Meta</p>
                                  <div className="space-y-2 text-xs font-medium text-slate-500 italic">
                                     <p>Weights: R({row.explain.weights.rate}) T({row.explain.weights.term}) L({row.explain.weights.liquidity})</p>
                                     <p>Assumed: {row.explain.assumptions.note}</p>
                                  </div>
                               </div>
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !savingLoading && (
                  <div className="pt-12 flex flex-col items-center justify-center text-center border-t border-slate-50">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-emerald-100/20 blur-3xl rounded-full" />
                      <Image src="/visuals/empty-finance.png" alt="" aria-hidden="true" width={160} height={160} className="relative w-40 h-auto object-contain opacity-50" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">분석된 추천 결과가 없습니다</p>
                    <p className="text-xs text-slate-400 mt-1">상단의 조건을 설정하고 버튼을 눌러 추천을 시작하세요.</p>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "loan" ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid gap-8 lg:grid-cols-2">
                   <div className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">대출 종류</label>
                          <select className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all outline-none appearance-none" value={loanKind} onChange={(e) => setLoanKind(e.target.value as FinlifeKind)}>
                            <option value="mortgage-loan">주담대</option>
                            <option value="rent-house-loan">전세대출</option>
                            <option value="credit-loan">신용대출</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">대출 기간(개월)</label>
                          <input className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all outline-none" value={loanTerms} onChange={(e) => setLoanTerms(e.target.value)} placeholder="예: 12,24" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">유동성 전략</label>
                          <select className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all outline-none appearance-none" value={loanLiquidity} onChange={(e) => setLoanLiquidity(e.target.value as RecommendProfile["liquidityNeed"])}>
                            <option value="low">낮음</option>
                            <option value="medium">보통</option>
                            <option value="high">높음</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">추천 알고리즘 가중치</label>
                         <select className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-50 transition-all outline-none appearance-none" value={loanRatePref} onChange={(e) => setLoanRatePref(e.target.value as RecommendProfile["ratePreference"])}>
                            <option value="balanced">균형 잡힌 추천</option>
                            <option value="aggressive">저금리 최우선</option>
                         </select>
                      </div>
                   </div>
                   <div className="flex flex-col justify-end gap-4 bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">분석 데이터</p>
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" variant={loanScanAll ? "outline" : "primary"} onClick={() => setLoanScanAll(false)} className="rounded-xl">빠른 추천</Button>
                              <Button size="sm" variant={loanScanAll ? "primary" : "outline"} onClick={() => setLoanScanAll(true)} className="rounded-xl">전체 스캔</Button>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">DB 규모</p>
                            <p className="mt-1 text-sm font-black text-slate-700">상품 {loanCounts.products} · 옵션 {loanCounts.options}</p>
                         </div>
                      </div>
                      <Button size="lg" className="h-14 w-full shadow-lg shadow-emerald-200/50 rounded-2xl text-base font-black" onClick={() => void runLoanRecommendation()}>
                        {loanLoading ? "금융 시장 데이터 대조 중..." : "최저 금리 대출 찾기"}
                      </Button>
                   </div>
                </div>

                {loanResults.length > 0 && (
                  <div className="pt-8 border-t border-slate-50">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 px-2">AI 최적 금리 제안</h3>
                    <div className="grid gap-4">
                      {loanResults.map((row, idx) => (
                        <div key={row.product.fin_prdt_cd} className="group relative rounded-3xl border border-slate-100 bg-white p-6 transition-all duration-300 hover:shadow-xl hover:border-emerald-200">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">
                                  {idx + 1}
                                </span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{row.product.kor_co_nm}</span>
                                <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-400 uppercase">{getProductLabel(loanKind)}</Badge>
                              </div>
                              <h4 className="text-xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors leading-tight">
                                {row.product.fin_prdt_nm ?? row.product.fin_prdt_cd}
                              </h4>
                              {(() => {
                                const hl = summarizeProductHighlights(row.product);
                                return (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="bg-slate-50 text-slate-500 border-none font-bold text-[10px] px-2.5 rounded-lg">{hl.joinTargetLabel}</Badge>
                                    <Badge variant="outline" className="border-slate-100 text-slate-400 font-bold text-[10px] px-2.5 rounded-lg">난이도: {hl.conditionsComplexity}</Badge>
                                    <span className="text-[11px] font-bold text-slate-400 ml-1">{hl.specialRateHint}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex items-end gap-6 text-right">
                               <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">적합성 점수</span>
                                  <span className="text-3xl font-black text-emerald-600 tabular-nums leading-none tracking-tighter">
                                    {row.explain.finalPoints.toFixed(1)}
                                  </span>
                               </div>
                               <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">적용 금리</span>
                                  <span className="text-xl font-black text-slate-900 tabular-nums leading-none">
                                    {row.explain.pickedOption.comparableRate?.toFixed(2) ?? "-"}%
                                  </span>
                               </div>
                            </div>
                          </div>
                          <div className="mt-6 pt-6 border-t border-slate-50">
                             <p className="text-sm font-bold text-slate-700 leading-relaxed">
                               <span className="text-emerald-600 mr-2 font-black">ANALYSIS</span>
                               {row.explain.why.summary}
                             </p>
                             <ul className="mt-4 grid md:grid-cols-3 gap-3">
                                {row.explain.why.bullets.slice(0, 3).map((line, i) => (
                                  <li key={i} className="flex items-start gap-2 text-[11px] font-medium text-slate-500 leading-snug">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                                    {line}
                                  </li>
                                ))}
                             </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "benefits" ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
                   <div className="space-y-8">
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">지역 필터</p>
                        <div className="space-y-4">
                           <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant={benefitSido ? "outline" : "primary"} onClick={() => { setBenefitSido(""); setBenefitSigungu(""); }} className="rounded-xl px-4 font-bold">전국</Button>
                            {SIDO_LIST.slice(0, 8).map((sido) => (
                              <Button key={sido} size="sm" variant={benefitSido === sido ? "primary" : "outline"} onClick={() => { setBenefitSido(sido); setBenefitSigungu(""); }} className="rounded-xl px-3 font-bold">
                                {sido}
                                {hasBenefitFacets && benefitSidoCountMap.get(sido) ? <span className="ml-1 text-[10px] opacity-60">({benefitSidoCountMap.get(sido)})</span> : null}
                              </Button>
                            ))}
                            <details className="inline-block relative">
                               <summary className="list-none cursor-pointer h-8 px-4 rounded-xl border border-slate-100 bg-white text-[11px] font-bold flex items-center gap-1 hover:bg-slate-50">
                                 기타 지역
                               </summary>
                               <div className="absolute top-10 left-0 z-50 p-2 bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-wrap gap-1 min-w-[280px]">
                                 {SIDO_LIST.slice(8).map((sido) => (
                                    <Button key={sido} size="sm" variant={benefitSido === sido ? "primary" : "outline"} onClick={() => { setBenefitSido(sido); setBenefitSigungu(""); }} className="rounded-lg px-2 text-[10px] h-7">
                                      {sido}
                                    </Button>
                                  ))}
                               </div>
                            </details>
                          </div>

                          {benefitSido && (
                            <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in duration-300">
                              <Button size="sm" variant={benefitSigungu ? "outline" : "primary"} onClick={() => setBenefitSigungu("")} className="rounded-xl px-4 text-[11px]">전체</Button>
                              {benefitFacets.sigungu.map((entry) => (
                                <Button key={entry.key} size="sm" variant={benefitSigungu === entry.key ? "primary" : "outline"} onClick={() => setBenefitSigungu(entry.key)} className="rounded-xl px-3 text-[11px]">
                                  {entry.key}
                                  <span className="ml-1 opacity-60">({entry.count})</span>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">관심 주제</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={isTopicFilterBypassed(benefitTopics) ? "primary" : "outline"}
                            onClick={() => setBenefitTopics([])}
                            className="rounded-xl px-4 font-bold h-10"
                          >
                            전체
                          </Button>
                          {BENEFIT_TOPIC_KEYS.map((topic) => (
                            <Button
                              key={topic}
                              size="sm"
                              variant={benefitTopics.includes(topic) && !isTopicFilterBypassed(benefitTopics) ? "primary" : "outline"}
                              onClick={() => toggleTopic(topic)}
                              className="rounded-xl px-4 font-bold h-10"
                            >
                              {BENEFIT_TOPICS[topic].label}
                            </Button>
                          ))}
                        </div>
                      </div>
                   </div>

                   <div className="flex flex-col gap-4">
                      <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                         <div className="flex items-center justify-between mb-4">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">검색 옵션</p>
                            <Button size="sm" variant="ghost" onClick={() => setBenefitAdvancedOpen((prev) => !prev)} className="text-[10px] font-black h-6 p-0 hover:bg-transparent text-emerald-600">
                               {benefitAdvancedOpen ? "간편 검색으로 전환" : "고급 검색 필터 열기"}
                            </Button>
                         </div>
                         
                         <div className="space-y-4">
                            <div className="relative">
                               <input
                                  className="h-12 w-full rounded-2xl border border-slate-100 bg-white pl-4 pr-10 text-sm font-bold focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all outline-none shadow-sm"
                                  value={benefitQuery}
                                  onChange={(e) => setBenefitQuery(e.target.value)}
                                  placeholder="키워드(예: 청년, 전세, 월세)"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                </div>
                            </div>

                            {benefitAdvancedOpen && (
                              <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                 <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Limit</label>
                                    <select className="h-10 w-full rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold outline-none" value={benefitLimit} onChange={(e) => setBenefitLimit(Number(e.target.value))}>
                                      {[50, 100, 200, 500].map((v) => <option key={v} value={v}>{v}개 표시</option>)}
                                    </select>
                                 </div>
                                 <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Scan Pages</label>
                                    <select className="h-10 w-full rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold outline-none" value={benefitMaxPages} onChange={(e) => setBenefitMaxPages(Number(e.target.value))}>
                                      {[5, 10, 20, 50].map((v) => <option key={v} value={v}>{v}p 탐색</option>)}
                                    </select>
                                 </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                               <button onClick={() => setIncludeNationwide(!includeNationwide)} className={`flex-1 h-10 rounded-xl text-[10px] font-black transition-all ${includeNationwide ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-white text-slate-400 border border-slate-100"}`}>전국 공통 포함</button>
                               <button onClick={() => setIncludeUnknown(!includeUnknown)} className={`flex-1 h-10 rounded-xl text-[10px] font-black transition-all ${includeUnknown ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-white text-slate-400 border border-slate-100"}`}>지역 미상 포함</button>
                            </div>
                            <p className="text-xs text-slate-600">
                              총 결과 {benefitTotalMatched}개 · 후보 {benefitCandidateCount}개
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {!isTopicFilterBypassed(benefitTopics) ? benefitTopics.map((topic) => (
                                <Button key={`hub-topic-${topic}`} size="sm" variant="outline" onClick={() => toggleTopic(topic)} className="rounded-xl px-3 text-[11px]">
                                  주제: {BENEFIT_TOPICS[topic].label} ×
                                </Button>
                              )) : <span className="text-xs text-slate-500">주제: 전체</span>}
                              {benefitQuery.trim() ? (
                                <Button size="sm" variant="outline" onClick={() => setBenefitQuery("")} className="rounded-xl px-3 text-[11px]">
                                  고급검색: {benefitQuery.trim()} ×
                                </Button>
                              ) : null}
                              {benefitSido ? (
                                <Button size="sm" variant="outline" onClick={() => { setBenefitSido(""); setBenefitSigungu(""); }} className="rounded-xl px-3 text-[11px]">
                                  시/도: {benefitSido} ×
                                </Button>
                              ) : null}
                              {benefitSigungu ? (
                                <Button size="sm" variant="outline" onClick={() => setBenefitSigungu("")} className="rounded-xl px-3 text-[11px]">
                                  시군구: {benefitSigungu} ×
                                </Button>
                              ) : null}
                            </div>

                            <Button size="lg" className="h-14 w-full shadow-lg shadow-emerald-200/50 rounded-2xl text-base font-black mt-2" onClick={() => void runBenefitRecommendation()}>
                              {benefitLoading ? "공공 데이터 수집 중..." : "맞춤 혜택 검색"}
                            </Button>
                         </div>
                      </div>

                      <div className="px-4 py-3 bg-white rounded-2xl border border-slate-50 flex flex-wrap gap-y-2 justify-between items-center">
                         <div className="flex gap-4">
                            <div className="flex flex-col">
                               <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter leading-none mb-1">Total</span>
                               <span className="text-sm font-black text-slate-900 leading-none">{benefitMeta.upstreamTotalCount ?? "?"}</span>
                            </div>
                            <div className="flex flex-col">
                               <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter leading-none mb-1">Fetched</span>
                               <span className="text-sm font-black text-slate-900 leading-none">{benefitCandidateCount}</span>
                            </div>
                         </div>
                         {benefitMeta.snapshot?.generatedAt && (
                           <div className="text-[9px] font-bold text-slate-400 italic">
                             Updated: {new Date(benefitMeta.snapshot.generatedAt).toLocaleTimeString()}
                           </div>
                         )}
                      </div>
                   </div>
                </div>

                {benefitResults.length > 0 && (
                  <div className="pt-8 border-t border-slate-50">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 px-2">당신을 위한 공공 혜택 제안</h3>
                    <div className="grid gap-6 md:grid-cols-2">
                      {benefitResults.map((row, idx) => (
                        <div key={row.item.id} className="group relative rounded-3xl border border-slate-100 bg-white p-6 transition-all duration-300 hover:shadow-xl hover:border-emerald-200 flex flex-col">
                           <div className="flex items-start justify-between mb-4">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-[10px] font-black text-white shadow-sm shadow-emerald-100">
                                {idx + 1}
                              </span>
                              <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-400 uppercase tracking-tight">
                                {(() => {
                                  const q = getBenefitQualityBucket(row.item);
                                  return q === "HIGH" ? "정보 충분" : q === "MED" ? "정보 보통" : "정보 확인 필요";
                                })()}
                              </Badge>
                           </div>
                           
                           <h4 className="text-lg font-black text-slate-900 group-hover:text-emerald-700 transition-colors leading-[1.3] mb-3 flex-1">
                             {row.item.title}
                           </h4>

                           <div className="space-y-3 mt-auto">
                              <p className="text-xs font-bold text-slate-700 leading-relaxed border-l-2 border-emerald-500 pl-3">
                                {row.explain.why.summary}
                              </p>
                              
                              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                 <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">매칭 점수</span>
                                    <span className="text-2xl font-black text-emerald-600 leading-none tracking-tighter">
                                      {row.explain.finalPoints.toFixed(1)}
                                    </span>
                                 </div>
                                 <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">관련 지역</span>
                                    <span className="text-xs font-bold text-slate-900 leading-none">
                                      {row.item.region.sido} {row.item.region.sigungu !== "전체" ? row.item.region.sigungu : ""}
                                    </span>
                                 </div>
                              </div>
                           </div>

                           <details className="mt-6 group/details">
                            <summary className="list-none cursor-pointer">
                               <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover/details:bg-slate-100 transition-all">
                                 Match Logic
                                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="group-open/details:rotate-180 transition-transform"><path d="m6 9 6 6 6-6"/></svg>
                               </div>
                            </summary>
                            <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-[10px] space-y-2 font-bold">
                               <div className="flex justify-between text-slate-500"><span>지역 적합성</span><span className="text-slate-900">+{row.explain.contributions.regionPoints.toFixed(1)}</span></div>
                               <div className="flex justify-between text-slate-500"><span>주제 연관성</span><span className="text-slate-900">+{row.explain.contributions.topicPoints.toFixed(1)}</span></div>
                               <div className="flex justify-between text-slate-500"><span>키워드 일치</span><span className="text-slate-900">+{row.explain.contributions.queryPoints.toFixed(1)}</span></div>
                               <div className="flex justify-between text-slate-500"><span>데이터 신뢰도</span><span className="text-slate-900">+{row.explain.contributions.richnessPoints.toFixed(1)}</span></div>
                               <p className="pt-2 border-t border-slate-200 text-slate-400 italic font-medium">
                                 Weights: Reg({row.explain.weights.region}) Top({row.explain.weights.topic}) Qry({row.explain.weights.query}) Rich({row.explain.weights.richness})
                               </p>
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {error ? (
              <div className="mt-8 p-6 rounded-3xl bg-red-50 border border-red-100 text-center animate-in zoom-in-95 duration-300">
                <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                </div>
                <p className="text-sm font-black text-red-900">{error}</p>
                <Button variant="ghost" className="mt-4 text-xs font-bold text-red-600 hover:bg-red-100" onClick={() => setError("")}>오류 메시지 닫기</Button>
              </div>
            ) : null}
          </Card>
        </div>
      </Container>
    </main>
  );
}
