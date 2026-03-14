"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchPill } from "@/components/ui/SearchPill";
import { FallbackBanner } from "@/components/FallbackBanner";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { firstError, issuesToFieldMap } from "@/lib/forms/issueMap";
import { parseSubscriptionFilters, type SubscriptionHouseType, type SubscriptionMode } from "@/lib/schemas/subscriptionFilters";
import { parseStringIssues, type Issue } from "@/lib/schemas/issueTypes";

const ERROR_SUMMARY_ID = "subscription_error_summary";

type SubscriptionItem = {
  id: string;
  title: string;
  region?: string;
  applyStart?: string;
  applyEnd?: string;
  supplyType?: string;
  sizeHints?: string;
  address?: string;
  totalHouseholds?: string;
  contact?: string;
  details?: Record<string, string>;
  link?: string;
};

type SearchMeta = {
  scannedPages?: number;
  scannedRows?: number;
  upstreamTotalCount?: number;
  matchedRows?: number;
  rawMatched?: number;
  normalizedCount?: number;
  dropStats?: { missingTitle?: number; generatedId?: number };
  truncated?: boolean;
  availableRegionsTop?: string[];
  fallback?: {
    mode?: string;
    reason?: string;
    generatedAt?: string;
    nextRetryAt?: string;
  };
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function houseTypeLabel(value: "apt" | "urbty" | "remndr"): string {
  if (value === "urbty") return "오피스텔/도시형";
  if (value === "remndr") return "잔여세대";
  return "APT";
}

type SubscriptionClientProps = {
  initialRegion?: string;
  initialFrom?: string;
  initialTo?: string;
  initialQuery?: string;
  initialHouseType?: SubscriptionHouseType;
  initialMode?: SubscriptionMode;
};

export function SubscriptionClient({
  initialRegion = "전국",
  initialFrom = daysAgoIsoDate(90),
  initialTo = todayIsoDate(),
  initialQuery = "",
  initialHouseType = "apt",
  initialMode = "all",
}: SubscriptionClientProps) {
  const initializedFromQueryRef = useRef(false);
  const [region, setRegion] = useState(initialRegion);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [meta, setMeta] = useState<SearchMeta>({});
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [houseType, setHouseType] = useState<SubscriptionHouseType>(initialHouseType);
  const [query, setQuery] = useState(initialQuery);
  const [formIssues, setFormIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SubscriptionItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const runInFlightRef = useRef(false);

  const fieldIssueMap = useMemo(() => issuesToFieldMap(formIssues), [formIssues]);

  const showValidationIssues = useCallback((issues: Issue[]) => {
    setFormIssues(issues);
    setError(firstError(issues) ?? "입력값을 확인해 주세요.");
    setTimeout(() => {
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      focusFirstError(issues.map((entry) => entry.path));
      announce(`입력 오류 ${issues.length}건이 있습니다.`);
    }, 0);
  }, []);

  const openDetail = useCallback(async (item: SubscriptionItem) => {
    setSelected(item);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ id: item.id, region: region || "전국", houseType });
      const res = await fetch(`/api/public/housing/subscription/item?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json.data?.item) {
        setSelected(json.data.item as SubscriptionItem);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [houseType, region]);

  const run = useCallback(async (options?: {
    region?: string;
    from?: string;
    to?: string;
    query?: string;
    houseType?: "apt" | "urbty" | "remndr";
    mode?: "search" | "all";
    deep?: boolean;
  }) => {
    if (runInFlightRef.current) return;
    const modeValue = options?.mode ?? "search";
    const parsedFilters = parseSubscriptionFilters({
      region: options?.region ?? region,
      from: options?.from ?? from,
      to: options?.to ?? to,
      q: options?.query ?? query,
      houseType: options?.houseType ?? houseType,
      mode: modeValue,
      scan: options?.deep ? "deep" : "",
    });
    if (!parsedFilters.ok) {
      showValidationIssues(parsedFilters.issues);
      return;
    }

    const filters = parsedFilters.value;
    setRegion(filters.region);
    setFrom(filters.from);
    setTo(filters.to);
    setHouseType(filters.houseType);
    setQuery(filters.q);

    runInFlightRef.current = true;
    setLoading(true);
    setError("");
    setFormIssues([]);
    setMeta({});
    try {
      const params = new URLSearchParams();
      if (filters.region) params.set("region", filters.region);
      if (filters.mode === "all") params.set("mode", "all");
      if (filters.deep) params.set("scan", "deep");
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      params.set("houseType", filters.houseType);
      const res = await fetch(`/api/public/housing/subscription?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        const apiIssues = parseStringIssues(json?.error?.issues ?? []);
        if (apiIssues.length > 0) {
          showValidationIssues(apiIssues);
        } else {
          const message = json?.error?.message ?? "청약 공고 조회 실패";
          setError(message);
          announce(message);
        }
        return;
      }
      setItems(Array.isArray(json.data?.items) ? json.data.items : []);
      setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
      setMeta(typeof json.meta === "object" && json.meta ? json.meta : {});
    } catch {
      setError("청약 공고 조회 실패");
      announce("청약 공고 조회 실패");
    } finally {
      setLoading(false);
      runInFlightRef.current = false;
    }
  }, [region, from, to, query, houseType, showValidationIssues]);

  useEffect(() => {
    if (initializedFromQueryRef.current) return;
    initializedFromQueryRef.current = true;
    void run({ mode: initialMode });
  }, [initialMode, run]);

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader title="청약 공고 탐색" description="청약홈의 최신 분양 정보와 지역별 모집 일정을 한눈에 확인하세요." />
        
        <div className="mb-8 space-y-4">
          <Card className="rounded-[2.5rem] border-slate-200/60 p-6 shadow-sm">
            <ErrorSummary issues={formIssues} id={ERROR_SUMMARY_ID} className="mb-6" />
            <ErrorAnnouncer />
            
            <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">지역</span>
                  <div>
                    <select
                      id={pathToId("region")}
                      className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      aria-invalid={!!fieldIssueMap.region?.[0]}
                      aria-describedby={fieldIssueMap.region?.[0] ? `${pathToId("region")}-error` : undefined}
                    >
                      {["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"].map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <FieldError id={`${pathToId("region")}-error`} message={fieldIssueMap.region?.[0]} />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">유형</span>
                  <div>
                    <select
                      id={pathToId("houseType")}
                      className="h-9 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      value={houseType}
                      onChange={(e) => setHouseType(e.target.value as "apt" | "urbty" | "remndr")}
                      aria-invalid={!!fieldIssueMap.houseType?.[0]}
                      aria-describedby={fieldIssueMap.houseType?.[0] ? `${pathToId("houseType")}-error` : undefined}
                    >
                      <option value="apt">APT</option>
                      <option value="urbty">오피스텔/도시형</option>
                      <option value="remndr">잔여세대</option>
                    </select>
                    <FieldError id={`${pathToId("houseType")}-error`} message={fieldIssueMap.houseType?.[0]} />
                  </div>
                </div>

                <div className="h-4 w-px bg-slate-100" />

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">조회 기간</span>
                  <div className="flex items-center gap-1">
                    <div>
                      <input
                        id={pathToId("from")}
                        type="date"
                        className="h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold outline-none"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        aria-invalid={!!fieldIssueMap.from?.[0]}
                        aria-describedby={fieldIssueMap.from?.[0] ? `${pathToId("from")}-error` : undefined}
                      />
                      <FieldError id={`${pathToId("from")}-error`} message={fieldIssueMap.from?.[0]} />
                    </div>
                    <span className="text-slate-300">~</span>
                    <div>
                      <input
                        id={pathToId("to")}
                        type="date"
                        className="h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold outline-none"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        aria-invalid={!!fieldIssueMap.to?.[0]}
                        aria-describedby={fieldIssueMap.to?.[0] ? `${pathToId("to")}-error` : undefined}
                      />
                      <FieldError id={`${pathToId("to")}-error`} message={fieldIssueMap.to?.[0]} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-6">
                <div className="flex flex-1 min-w-[240px] flex-col gap-1">
                  <SearchPill
                    id={pathToId("q")}
                    className="h-10 w-full"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onClear={() => setQuery("")}
                    placeholder="아파트명 또는 주택명 키워드 입력"
                    aria-invalid={!!fieldIssueMap.q?.[0]}
                    aria-describedby={fieldIssueMap.q?.[0] ? `${pathToId("q")}-error` : undefined}
                  />
                  <FieldError id={`${pathToId("q")}-error`} message={fieldIssueMap.q?.[0]} />
                </div>
                
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => { setFrom(daysAgoIsoDate(30)); setTo(todayIsoDate()); }}>최근 30일</Button>
                  <Button type="submit" variant="primary" size="sm" className="rounded-full px-8" disabled={loading}>
                    {loading ? "조회 중" : "공고 검색"}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>

        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-emerald-600">{items.length.toLocaleString()}건의 공고</span>
            {assumption && <div className="h-3 w-px bg-slate-200" />}
            {assumption && <span className="text-[10px] italic text-slate-400">{assumption}</span>}
          </div>
          <FallbackBanner fallback={meta.fallback} />
        </div>

        {error && (
          <ErrorState message={error} onRetry={() => void run()} className="mb-8" />
        )}

        <div className="space-y-4">
          {loading && items.length === 0 ? (
            <LoadingState description="최신 청약 공고를 불러오고 있습니다." />
          ) : items.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id} className="group relative overflow-hidden rounded-[2rem] border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="mb-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {item.region || "지역 미상"}
                    </span>
                    <h3 className="mt-3 text-lg font-black leading-snug text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                  </div>
                  
                  <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-400">접수 기간</span>
                      <span className="font-black text-slate-700">{item.applyStart} ~ {item.applyEnd}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-400">공급 유형</span>
                      <span className="font-medium text-slate-600">{item.supplyType || "-"}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-2xl h-10 text-xs font-bold" onClick={() => void openDetail(item)}>
                      상세 정보
                    </Button>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center flex-1 rounded-2xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
                      >
                        공고문 보기
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : !loading && !error ? (
            <EmptyState
              title="검색 결과가 없습니다"
              description="조건을 완화하거나 전체 보기로 다시 검색해 보세요."
              actionLabel="전체 보기"
              onAction={() => {
                const f = daysAgoIsoDate(90);
                const t = todayIsoDate();
                setRegion("전국");
                setQuery("");
                setFrom(f);
                setTo(t);
                void run({ region: "전국", from: f, to: t, query: "", mode: "all" });
              }}
            />
          ) : null}
        </div>
      </Container>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 md:p-8" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[3rem] p-0 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-50/80 p-6 md:p-8 border-b border-slate-100 flex items-start justify-between">
              <div className="space-y-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  {selected.region} · {houseTypeLabel(houseType)}
                </span>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-snug">{selected.title}</h3>
              </div>
              <Button size="sm" variant="ghost" className="h-10 w-10 rounded-full p-0 bg-white" onClick={() => setSelected(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              <section>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">주요 일정</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5">
                    <p className="text-[10px] font-bold text-slate-400">접수 시작</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{selected.applyStart || "-"}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5">
                    <p className="text-[10px] font-bold text-slate-400">접수 종료</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{selected.applyEnd || "-"}</p>
                  </div>
                </div>
              </section>
              
              <section>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">상세 정보</p>
                <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6">
                  {detailLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                      <div className="h-4 w-1/2 rounded-full bg-slate-200" />
                    </div>
                  ) : (
                    <dl className="grid gap-y-4 text-sm sm:grid-cols-2 sm:gap-x-8">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">공급 위치</dt>
                        <dd className="mt-1 font-bold text-slate-700">{selected.address || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">공급 규모</dt>
                        <dd className="mt-1 font-bold text-slate-700">{selected.totalHouseholds || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">주택형/면적</dt>
                        <dd className="mt-1 font-bold text-slate-700">{selected.sizeHints || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">문의처</dt>
                        <dd className="mt-1 font-bold text-slate-700">{selected.contact || "-"}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              </section>

              {selected.details && Object.keys(selected.details).length > 0 && (
                <section>
                  <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">기타 유의사항</p>
                  <div className="space-y-2">
                    {Object.entries(selected.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs">
                        <span className="font-bold text-slate-400">{k}</span>
                        <span className="font-black text-slate-700">{v}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="bg-slate-50/80 p-6 border-t border-slate-100 flex items-center justify-between">
               <p className="text-[10px] font-bold text-slate-400">데이터 제공: 청약홈 Open API</p>
               {selected.link && (
                 <a
                   href={selected.link}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="rounded-full bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
                 >
                   공고 전문 보기
                 </a>
               )}
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
