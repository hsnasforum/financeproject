"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ProviderChips } from "@/components/ui/ProviderChips";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SearchPill } from "@/components/ui/SearchPill";
import { FilterField } from "@/components/ui/FilterField";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";
import { createLatestRequestCoordinator } from "@/lib/browser/latestRequest";
import {
  buildCatalogQueryKey,
  buildCatalogRequestParams,
  buildCatalogUrlParams,
  buildCatalogViewModel,
  canAppendCatalogPage,
  formatCatalogSourceAsOf,
  formatCatalogSourceName,
  formatCatalogRate,
  isCatalogSamplebankVisible,
  parseCatalogKind,
  parseCatalogResponse,
  parseCatalogUrlState,
  type CatalogKind,
  type CatalogState,
  type UnifiedResponse,
} from "@/lib/products/catalogExplorer";

export default function ProductsCatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = useMemo(() => parseCatalogUrlState(searchParams), [searchParams]);
  const [kind, setKind] = useState<CatalogKind>(urlState.kind);
  const [termMonths, setTermMonths] = useState<string>(urlState.termMonths);
  const [minRate, setMinRate] = useState<string>(urlState.minRate);
  const [q, setQ] = useState(urlState.q);
  const [selectedProvider, setSelectedProvider] = useState<string>(urlState.provider);
  const samplebankVisible = isCatalogSamplebankVisible();
  const [includeSamplebank, setIncludeSamplebank] = useState(false);
  const [catalogState, setCatalogState] = useState<CatalogState>({
    queryKey: "",
    rows: [],
    nextCursor: null,
    hasMore: false,
    freshness: null,
    providerNames: [],
    partialReasons: [],
    providerStatus: { state: "complete", issues: [] },
    provenanceFingerprint: null,
  });
  const catalogStateRef = useRef(catalogState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [compareNotice, setCompareNotice] = useState("");
  const catalogRequestsRef = useRef<ReturnType<typeof createLatestRequestCoordinator> | null>(null);
  if (catalogRequestsRef.current == null) catalogRequestsRef.current = createLatestRequestCoordinator();
  const effectiveIncludeSamplebank = samplebankVisible && includeSamplebank;

  useEffect(() => {
    catalogStateRef.current = catalogState;
  }, [catalogState]);
  const catalogQueryKey = useMemo(
    () => buildCatalogQueryKey({
      kind: urlState.kind,
      q: urlState.q,
      provider: urlState.provider,
      termMonths: urlState.termMonths,
      minRate: urlState.minRate,
      includeSamplebank: effectiveIncludeSamplebank,
    }),
    [effectiveIncludeSamplebank, urlState.kind, urlState.minRate, urlState.provider, urlState.q, urlState.termMonths],
  );
  const currentCatalog = useMemo(() => {
    const isCurrent = catalogState.queryKey === catalogQueryKey;
    return {
      rows: isCurrent ? catalogState.rows : [],
      nextCursor: isCurrent ? catalogState.nextCursor : null,
      hasMore: isCurrent && catalogState.hasMore,
      freshness: isCurrent ? catalogState.freshness : null,
      providerNames: isCurrent ? catalogState.providerNames : [],
      partialReasons: isCurrent ? catalogState.partialReasons : [],
      providerStatus: isCurrent
        ? catalogState.providerStatus
        : { state: "complete" as const, issues: [] },
    };
  }, [catalogQueryKey, catalogState.freshness, catalogState.hasMore, catalogState.nextCursor, catalogState.partialReasons, catalogState.providerNames, catalogState.providerStatus, catalogState.queryKey, catalogState.rows]);
  const {
    rows,
    nextCursor,
    hasMore,
    freshness,
    providerNames,
    partialReasons,
    providerStatus,
  } = currentCatalog;

  useEffect(() => {
    setKind(urlState.kind);
    setTermMonths(urlState.termMonths);
    setMinRate(urlState.minRate);
    setQ(urlState.q);
    setSelectedProvider(urlState.provider);
    setIncludeSamplebank(false);
  }, [urlState.kind, urlState.minRate, urlState.provider, urlState.q, urlState.termMonths]);

  const catalogViewModel = useMemo(
    () => buildCatalogViewModel({
      rows,
      providerNames,
      selectedProvider: urlState.provider,
      termMonths: urlState.termMonths,
      minRate: urlState.minRate,
    }),
    [providerNames, rows, urlState.minRate, urlState.provider, urlState.termMonths],
  );
  const providers = catalogViewModel.providers;
  const filteredRows = catalogViewModel.filteredRows;

  const run = useCallback(async (input?: { append?: boolean; cursor?: string | null }) => {
    const request = catalogRequestsRef.current!.start();
    const append = Boolean(input?.append);
    setLoading(true);
    setError("");
    try {
      const params = buildCatalogRequestParams({
        kind: urlState.kind,
        q: urlState.q,
        provider: urlState.provider,
        termMonths: urlState.termMonths,
        minRate: urlState.minRate,
        includeSamplebank: effectiveIncludeSamplebank,
        append,
        cursor: input?.cursor,
      });

      const res = await fetch(`/api/products/unified?${params.toString()}`, {
        cache: "no-store",
        signal: request.signal,
      });
      const json = (await res.json()) as UnifiedResponse;
      if (!request.isCurrent()) return;
      if (!res.ok || !json.ok) {
        const code = json.error?.code ?? "UPSTREAM";
        const message = json.error?.message ?? "통합 카탈로그 조회에 실패했습니다.";
        if (append && (code === "CURSOR_INVALID" || code === "CURSOR_EXPIRED" || code === "CURSOR_MISMATCH")) {
          const previous = catalogStateRef.current;
          if (previous.queryKey === catalogQueryKey) {
            const stopped = { ...previous, hasMore: false, nextCursor: null };
            catalogStateRef.current = stopped;
            setCatalogState(stopped);
          }
        }
        setError(`${code}: ${message}`);
        return;
      }

      const {
        pageItems,
        hasMore: responseHasMore,
        nextCursor: responseNextCursor,
        freshness: responseFreshness,
        providerNames: responseProviderNames,
        partialReasons: responsePartialReasons,
        providerStatus: responseProviderStatus,
        provenance: responseProvenance,
      } = parseCatalogResponse(json);
      const previous = catalogStateRef.current;
      const responseFingerprint = responseProvenance?.versionFingerprint.trim() || null;
      if (
        append
        && !canAppendCatalogPage({
          currentQueryKey: previous.queryKey,
          responseQueryKey: catalogQueryKey,
          currentFingerprint: previous.provenanceFingerprint,
          responseFingerprint,
        })
      ) {
        const stopped = previous.queryKey === catalogQueryKey
          ? { ...previous, hasMore: false, nextCursor: null }
          : previous;
        catalogStateRef.current = stopped;
        setCatalogState(stopped);
        setError("CURSOR_PROVENANCE_MISMATCH: 이전 페이지와 데이터 기준을 확인할 수 없거나 서로 달라 결과를 합치지 않았습니다. 첫 페이지부터 다시 조회해 주세요.");
        return;
      }
      const missingFirstPageProvenance = !append && responseHasMore && responseFingerprint === null;
      const nextState: CatalogState = {
        queryKey: catalogQueryKey,
        rows: append && previous.queryKey === catalogQueryKey ? [...previous.rows, ...pageItems] : pageItems,
        hasMore: missingFirstPageProvenance ? false : responseHasMore,
        nextCursor: missingFirstPageProvenance ? null : responseNextCursor,
        freshness: responseFreshness,
        providerNames: responseProviderNames,
        partialReasons: responsePartialReasons,
        providerStatus: responseProviderStatus,
        provenanceFingerprint: responseFingerprint,
      };
      catalogStateRef.current = nextState;
      setCatalogState(nextState);
      setCompareNotice("");
      if (missingFirstPageProvenance) {
        setError("CURSOR_PROVENANCE_MISSING: 다음 페이지의 데이터 기준을 확인할 수 없어 더 보기를 중단했습니다. 첫 페이지부터 다시 조회해 주세요.");
      }
    } catch (fetchError) {
      if (!request.isCurrent() || (fetchError instanceof Error && fetchError.name === "AbortError")) return;
      setError("UPSTREAM: 통합 카탈로그 조회 중 오류가 발생했습니다.");
    } finally {
      if (request.isCurrent()) setLoading(false);
      request.finish();
    }
  }, [catalogQueryKey, effectiveIncludeSamplebank, urlState.kind, urlState.minRate, urlState.provider, urlState.q, urlState.termMonths]);

  const applySearch = useCallback((overrides: Partial<{
    kind: CatalogKind;
    q: string;
    provider: string;
    termMonths: string;
    minRate: string;
  }> = {}) => {
    const nextParams = buildCatalogUrlParams({
      kind: overrides.kind ?? kind,
      q: overrides.q ?? q,
      provider: overrides.provider ?? selectedProvider,
      termMonths: overrides.termMonths ?? termMonths,
      minRate: overrides.minRate ?? minRate,
    });
    const nextQuery = nextParams.toString();
    if (nextQuery === searchParams.toString()) {
      void run({ append: false });
      return;
    }
    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }, [kind, minRate, pathname, q, router, run, searchParams, selectedProvider, termMonths]);

  const handleKindChange = useCallback((id: string) => {
    const nextKind = parseCatalogKind(id);
    setKind(nextKind);
    setSelectedProvider("all");
    applySearch({ kind: nextKind, provider: "all" });
  }, [applySearch]);

  useEffect(() => {
    let active = true;

    async function refreshCatalog() {
      await Promise.resolve();
      if (active) {
        void run({ append: false });
      }
    }

    void refreshCatalog();

    return () => {
      active = false;
      catalogRequestsRef.current?.cancel();
    };
  }, [run]);

  return (
    <PageShell>
      <PageHeader
        title="통합 상품 탐색"
        description="예금·적금 후보를 현재 검색과 필터 기준으로 비교해 보는 통합 카탈로그입니다."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        이 화면은 확정 추천이 아니라, 현재 조건 기준으로 비교할 후보를 좁혀 보는 단계입니다.
        최고 금리만 보지 말고 기간, 우대조건, 예금자보호, 가입 조건은 상세에서 다시 확인하세요.
      </p>

      <div className="sticky top-0 z-30 mb-10 space-y-4">
        <Card className="rounded-[2.5rem] p-8 shadow-lg backdrop-blur-md bg-white/95 border-slate-100">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="w-full space-y-2 sm:w-auto">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">상품군 선택</p>
                <SegmentedTabs
                  options={[
                    { id: "deposit", label: "정기예금" },
                    { id: "saving", label: "정기적금" },
                  ]}
                  activeTab={kind}
                  onChange={handleKindChange}
                />
              </div>
              
              <div className="w-full min-w-0 space-y-2 sm:min-w-[320px] sm:flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">키워드 검색</p>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <SearchPill
                    className="h-12 w-full rounded-2xl"
                    placeholder="은행명 또는 상품명으로 비교 후보를 좁혀 보세요"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onClear={() => setQ("")}
                    isLoading={loading && rows.length === 0}
                  />
                  <Button variant="primary" className="h-12 w-full rounded-2xl px-5 font-black shadow-md shadow-navy/20 sm:w-auto sm:px-8" onClick={() => applySearch()} disabled={loading}>
                    {loading ? "조회 중" : "조건으로 조회"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">제공 기관 필터</p>
              <ProviderChips
                providers={providers}
                selectedId={selectedProvider}
                onSelect={(provider) => {
                  setSelectedProvider(provider);
                  applySearch({ provider });
                }}
              />
            </div>

            <div className="flex flex-col items-stretch gap-6 border-t border-slate-50 pt-6 lg:flex-row lg:items-end">
              <div className="grid w-full min-w-0 gap-4 sm:grid-cols-2 lg:max-w-xl lg:flex-1">
                <FilterField
                  label="기간"
                  labelPosition="vertical"
                  unit="개월"
                  placeholder="전체"
                  value={termMonths}
                  wrapperClassName="w-full min-w-0"
                  onChange={(e) => setTermMonths(e.target.value)}
                />

                <FilterField
                  label="최소 금리"
                  labelPosition="vertical"
                  unit="% 이상"
                  placeholder="0.0"
                  value={minRate}
                  wrapperClassName="w-full min-w-0"
                  onChange={(e) => setMinRate(e.target.value)}
                />
              </div>
              
              <div className="flex w-full flex-wrap items-center justify-between gap-4 lg:ml-auto lg:w-auto lg:justify-end">
                {samplebankVisible ? (
                  <label className="flex cursor-pointer items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded-lg border-slate-200 text-primary focus:ring-primary transition-all"
                      checked={includeSamplebank}
                      onChange={(e) => setIncludeSamplebank(e.target.checked)}
                    />
                    샘플 데이터 포함
                  </label>
                ) : null}
                <div className="flex items-center gap-3 rounded-2xl bg-primary/10 px-4 py-2 border border-primary/10">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-sm shadow-primary/20" />
                  <span className="text-sm font-black text-navy">
                    {filteredRows.length.toLocaleString()} <span className="text-[10px] font-black text-primary/80 uppercase tracking-widest ml-1">비교 후보</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {freshness ? (
        <section
          className={`mb-8 rounded-2xl border px-5 py-4 ${freshness.overall === "fresh" ? "border-primary/15 bg-primary/5" : "border-amber-200 bg-amber-50"}`}
          role={freshness.overall === "fresh" ? "status" : "alert"}
          aria-live="polite"
          data-testid="catalog-freshness-summary"
        >
          <p className={`text-sm font-black ${freshness.overall === "fresh" ? "text-navy" : "text-amber-900"}`}>
            {freshness.overall === "fresh"
              ? "원천 데이터가 설정된 갱신 주기 안에 있습니다."
              : freshness.overall === "partial"
                ? "일부 원천의 기준 시각을 확인하지 못했습니다."
                : freshness.overall === "unavailable"
                  ? "원천 데이터의 기준 시각을 확인하지 못했습니다."
                  : "설정된 갱신 주기를 지난 데이터가 포함되어 있습니다."}
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
            화면을 연 시각이 아니라 아래 수집 기준을 확인해 주세요. 가입 전 실제 금리와 조건은 금융회사 공시에서 다시 확인해야 합니다.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {freshness.sources.map((source) => (
              <li key={`${source.sourceId}-${source.kind}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600">
                {formatCatalogSourceName(source.sourceId)} · {formatCatalogSourceAsOf(source.sourceAsOf)}
                {source.fallbackUsed ? " · 대체/예시 데이터" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {partialReasons.length > 0 ? (
        <section
          className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"
          role="alert"
          data-testid="catalog-partial-results"
        >
          <p className="text-sm font-black text-amber-900">일부 상품 정보에 확인이 필요합니다.</p>
          <ul className="mt-3 space-y-3">
            {partialReasons.map((reason, index) => (
              <li key={`${reason.code}-${"sourceId" in reason ? reason.sourceId : "snapshot"}-${index}`} className="text-xs font-medium leading-relaxed text-amber-800">
                <p>
                  <strong>{"sourceId" in reason ? formatCatalogSourceName(reason.sourceId) : "페이지 이어보기"}</strong> · {reason.message}
                </p>
                <p className="mt-1">다음 단계: {reason.recovery}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {providerStatus.state === "partial" && providerStatus.issues.length > 0 ? (
        <section
          className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"
          role="alert"
          data-testid="catalog-provider-facet-partial"
        >
          <p className="text-sm font-black text-amber-900">제공 기관 목록 일부를 확인하지 못했습니다.</p>
          <ul className="mt-3 space-y-3">
            {providerStatus.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.sourceId}-${index}`} className="text-xs font-medium leading-relaxed text-amber-800">
                <p><strong>{formatCatalogSourceName(issue.sourceId)}</strong> · {issue.message}</p>
                <p className="mt-1">다음 단계: {issue.recovery}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {compareNotice && (
        <div
          className="mb-8 rounded-2xl border border-primary/10 bg-primary/10 p-4 text-center animate-in fade-in slide-in-from-top-2"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-black text-navy">{compareNotice}</p>
          <p className="mt-2 text-[11px] font-medium leading-relaxed text-navy/80">
            지금은 후보를 담아 두는 단계이며, 나란히 다시 보는 일은 비교 화면에서 이어집니다.
          </p>
        </div>
      )}

      {error ? (
        <ErrorState
          className="mb-12"
          message={error}
          onRetry={() => void run({ append: false })}
          retryLabel="다시 시도"
        />
      ) : null}

      <div className="space-y-8">
        {loading && filteredRows.length === 0 ? (
          <div className="py-20">
            <LoadingState title="현재 조건 기준으로 비교 후보를 불러오고 있습니다" />
          </div>
        ) : filteredRows.length > 0 ? (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((item) => (
                <Card key={item.stableId} className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm transition-all hover:shadow-xl hover:border-primary/10 hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <ProviderLogo providerName={item.providerName} className="h-12 w-12 rounded-2xl shadow-sm" />
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {item.badges?.slice(0, 2).map((badge) => (
                        <span key={badge} className="rounded-lg bg-primary/5 border border-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-navy">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.providerName}</p>
                    <h2 className="mt-2 text-xl font-black text-navy leading-snug group-hover:text-primary transition-colors tracking-tight line-clamp-2">
                      {item.productName}
                    </h2>
                    {item.summary && (
                      <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>

                  <div className="mt-8 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2">저장된 데이터의 대표 옵션</p>
                    {item.options?.slice(0, 2).map((option, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-surface-muted/50 p-4 border border-slate-100/50">
                        <span className="text-xs font-black text-slate-600 tabular-nums">{option.termMonths ? `${option.termMonths}개월` : option.saveTrm}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">대표 금리</span>
                          <span className="text-base font-black text-primary tabular-nums">{formatCatalogRate(option.intrRate2 ?? option.intrRate)}</span>
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] font-medium leading-relaxed text-slate-500">
                      대표 옵션은 지금 후보를 빠르게 훑어 보는 미리보기입니다. 1차 비교용으로만 보고, 실제 가입 조건과 우대 여부는 상세에서 다시 확인하세요.
                    </p>
                    {item.options && item.options.length > 2 && (
                      <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest pt-1">+{item.options.length - 2}개 옵션 더 있음</p>
                    )}
                  </div>

                  <div className="mt-10 flex gap-3">
                    <Link
                      href={`/products/catalog/${encodeURIComponent(item.stableId)}`}
                      className="flex-1 rounded-2xl bg-primary py-4 text-center text-xs font-black text-white shadow-lg shadow-navy/20 transition-all hover:bg-navy active:scale-95"
                    >
                      상세에서 다시 확인
                    </Link>
                    <Button
                      variant="outline"
                      className="flex-1 rounded-2xl h-12 font-black border-slate-200"
                      onClick={() => {
                        const next = addCompareIdToStorage(item.stableId, compareStoreConfig.max);
                        setCompareNotice(`비교함에 담았습니다. 다른 후보와의 나란히 비교는 /products/compare에서 이어집니다. (${next.length}/${compareStoreConfig.max})`);
                        setTimeout(() => setCompareNotice(""), 3000);
                      }}
                    >
                      비교 후보 담기
                    </Button>
                  </div>
                  <p className="mt-3 text-[10px] font-medium leading-relaxed text-slate-400">
                    비교 후보 담기는 지금 결론을 정하는 버튼이 아니라, 비교 화면에서 다시 볼 후보를 모아 두는 단계입니다.
                  </p>
                </Card>
              ))}
            </div>
          </>
        ) : !loading && !error ? (
          <div className="py-20">
            <EmptyState
              title="검색 결과가 없습니다"
              description="필터를 완화하거나 다른 검색어로 비교 후보를 다시 불러와 보세요."
              actionLabel="필터 초기화"
              onAction={() => {
                setTermMonths("");
                setMinRate("");
                setQ("");
                setSelectedProvider("all");
                applySearch({ q: "", provider: "all", termMonths: "", minRate: "" });
              }}
            />
          </div>
        ) : null}
      </div>

      {hasMore && !loading && (
        <div className="mt-16 flex justify-center pb-12">
          <Button
            variant="outline"
            className="rounded-2xl h-14 px-16 font-black shadow-sm transition-all hover:bg-white active:scale-95"
            onClick={() => void run({ append: true, cursor: nextCursor })}
          >
            비교 후보 더 보기
          </Button>
        </div>
      )}
    </PageShell>
  );
}
