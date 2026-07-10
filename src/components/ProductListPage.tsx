"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FinlifeCardFreshnessMeta, type FinlifeKind, type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { pruneOpen, toggleOpen } from "@/lib/finlife/groupOpenState";
import { type RatePreference } from "@/lib/finlife/uiSort";
import {
  formatOptionBonus,
  formatOptionRate,
  getOptionRates,
  type OptionRow,
  type OptionSortKey,
} from "@/lib/finlife/optionView";
import { FINLIFE_TOP_GROUPS } from "@/lib/finlife/topGroups";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductExplorerHeaderCard } from "./products/ProductExplorerHeaderCard";
import { ProductResultsHeader } from "./products/ProductResultsHeader";
import { ProductRowItem } from "./products/ProductRowItem";
import { ProductOptionRowItem } from "./products/ProductOptionRowItem";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { type ProductListSortKey } from "@/lib/products/listUtils";
import { buildProductListViewModel } from "@/lib/products/productListViewModel";
import {
  buildFinlifeRequestParams,
  buildProductExplorerApiUrl,
  buildProductExplorerUrlParams,
  FINLIFE_PAGE_SIZE,
  isValidProductExplorerSortKey,
  parseAmountInput,
  parseProductExplorerUrlState,
  type ProductExplorerScanMode,
  type ProductExplorerViewMode,
} from "@/lib/products/productExplorerUrlState";
import {
  addRecent,
  loadShelfFromSnapshot,
  PRODUCT_SHELF_UPDATED_EVENT,
  productShelfConfig,
  toggleCompare,
  toggleFavorite,
  type ProductShelfState,
} from "@/lib/state/productShelf";
import { type SourceStatusRow } from "@/lib/sources/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Props = {
  kind: FinlifeKind;
  title: string;
  ratePreference: RatePreference;
  initialTopFinGrpNo: string;
  initialPageNo?: number;
  scriptNonce?: string;
};

type SortKey = ProductListSortKey;

type AvailabilityRow = {
  topFinGrpNo: string;
  label: string;
  short: string;
  totalCount: number | null;
  status: "ok" | "missing" | "error";
  message?: string;
};

type StatusApiResponse = {
  ok: boolean;
  data?: SourceStatusRow[];
};

function sanitizeSnapshotNote(note: string | null | undefined): string | null {
  if (!note) return null;
  return note
    .replaceAll("pnpm finlife:probe", "데이터 점검")
    .replaceAll("finlife:probe", "데이터 점검");
}

function toProductAssumptionNote(note: string | null | undefined): string | null {
  const sanitized = sanitizeSnapshotNote(note)?.trim();
  if (!sanitized) return null;
  if (sanitized.includes("업권 범위가 좁을 수 있음")) return "업권 범위가 좁을 수 있습니다.";
  if (/[a-z]+=/i.test(sanitized)) return null;
  if (sanitized.toLowerCase().includes("fromfile")) return null;
  if (sanitized.toLowerCase().includes("replay")) return null;
  if (sanitized.includes("데이터 점검")) return null;
  return sanitized;
}

function deriveFreshnessStatus(row: SourceStatusRow | null): FinlifeCardFreshnessMeta["freshnessStatus"] {
  if (!row) return undefined;
  if (row.lastError?.message) return "error";
  if (row.counts <= 0) return "empty";
  if (!row.isFresh) return "stale";
  return "ok";
}

function formatFinlifeFallbackMode(payload: FinlifeSourceResult | null): string | null {
  const fallbackMode = payload?.meta.fallback?.mode;
  if (fallbackMode === "CACHE") return "캐시 기준";
  if (fallbackMode === "REPLAY") return "재생 데이터 기준";
  if (payload?.mode === "mock" || payload?.meta.source === "mock") return "예시 데이터 기준";
  if (payload?.meta.fallbackUsed && payload.meta.source === "snapshot") return "스냅샷 기준";
  if (payload?.meta.fallbackUsed && payload.meta.source === "live_partial") return "부분 수집 기준";
  return null;
}

function subscribeProductShelf(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleStoreChange = () => onStoreChange();
  const hydrationTimer = window.setTimeout(handleStoreChange, 0);
  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(PRODUCT_SHELF_UPDATED_EVENT, handleStoreChange);
  return () => {
    window.clearTimeout(hydrationTimer);
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(PRODUCT_SHELF_UPDATED_EVENT, handleStoreChange);
  };
}

function getProductShelfStorageSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return [
      window.localStorage.getItem(productShelfConfig.storageKey) ?? "",
      window.localStorage.getItem(productShelfConfig.legacyCompareStorageKey) ?? "",
    ].join("\n---product-shelf---\n");
  } catch {
    return "";
  }
}

function getServerProductShelfStorageSnapshot(): string {
  return "";
}

function readProductShelfFromSnapshot(snapshot: string): ProductShelfState {
  const [currentRaw = "", legacyCompareRaw = ""] = snapshot.split("\n---product-shelf---\n");
  return loadShelfFromSnapshot(currentRaw || null, legacyCompareRaw || null);
}

const COMPARE_COUNT_BOOTSTRAP_SCRIPT = `(function(){try{var raw=window.localStorage.getItem(${JSON.stringify(productShelfConfig.storageKey)});var ids=[];if(raw){var parsed=JSON.parse(raw);if(parsed&&Array.isArray(parsed.compareBasket))ids=parsed.compareBasket;}if(!ids.length){var legacy=window.localStorage.getItem(${JSON.stringify(productShelfConfig.legacyCompareStorageKey)});if(legacy){var legacyParsed=JSON.parse(legacy);if(Array.isArray(legacyParsed))ids=legacyParsed;}}var seen=Object.create(null);var count=0;ids.forEach(function(entry){if(typeof entry!=="string")return;var id=entry.trim();if(!id||seen[id])return;seen[id]=true;count+=1;});count=Math.min(count,${productShelfConfig.maxCompareBasket});document.querySelectorAll("[data-product-compare-count]").forEach(function(node){node.textContent="비교함 "+count;});}catch(error){}})();`;

function buildUnifiedDetailId(product: NormalizedProduct): string | null {
  const raw = (product.raw as Record<string, unknown> | null) ?? null;
  const stableId = typeof raw?.stableId === "string" ? raw.stableId.trim() : "";
  if (stableId) return stableId;

  const sourceIdRaw = typeof raw?.sourceId === "string" ? raw.sourceId.trim().toLowerCase() : "";
  const sourceId = sourceIdRaw || "finlife";
  const finPrdtCd = (product.fin_prdt_cd ?? "").trim();
  if (!finPrdtCd) return null;
  return `${sourceId}:${finPrdtCd}`;
}

function GroupedOptionMobileItem({ row }: { row: OptionRow }) {
  const rates = getOptionRates(row.option);
  const term = row.option.save_trm ? `${row.option.save_trm}개월` : "기간 정보 없음";

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">만기 기간</p>
          <p className="mt-1 text-sm font-black text-navy">{term}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최고 금리</p>
          <p className="mt-1 text-lg font-black tabular-nums text-primary">{formatOptionRate(rates.best)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">기본 금리</p>
          <p className="mt-1 text-xs font-bold tabular-nums text-slate-700">{formatOptionRate(rates.base)}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary/80">우대 폭</p>
          <p className="mt-1 text-xs font-bold tabular-nums text-navy">{formatOptionBonus(rates.bonus)}</p>
        </div>
      </div>
    </div>
  );
}

export function ProductListPage({ kind, title, ratePreference, initialTopFinGrpNo, initialPageNo = 1, scriptNonce }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productShelfStorageSnapshot = useSyncExternalStore(
    subscribeProductShelf,
    getProductShelfStorageSnapshot,
    getServerProductShelfStorageSnapshot,
  );
  const shelf = readProductShelfFromSnapshot(productShelfStorageSnapshot);
  const defaultSortKey: SortKey = ratePreference === "higher" ? "rateDesc" : "rateAsc";
  const initialUrlState = useMemo(
    () => parseProductExplorerUrlState(searchParams, { defaultSortKey, initialTopFinGrpNo, initialPageNo }),
    [defaultSortKey, initialPageNo, initialTopFinGrpNo, searchParams],
  );
  const [topFinGrpNo, setTopFinGrpNo] = useState(initialUrlState.topFinGrpNo);
  const [selectedFinCoNo, setSelectedFinCoNo] = useState<string | null>(initialUrlState.selectedFinCoNo);
  const [pageNo, setPageNo] = useState(initialUrlState.pageNo);
  const [scanMode, setScanMode] = useState<ProductExplorerScanMode>(initialUrlState.scanMode);
  const [maxPages, setMaxPages] = useState<number | "auto">(initialUrlState.maxPages);
  const [viewMode, setViewMode] = useState<ProductExplorerViewMode>(initialUrlState.viewMode);
  const [sortKey, setSortKey] = useState<SortKey>(initialUrlState.sortKey);
  const [optionSortKey, setOptionSortKey] = useState<OptionSortKey>(initialUrlState.optionSortKey);
  const [optionGroup, setOptionGroup] = useState(initialUrlState.optionGroup);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAllProviders, setShowAllProviders] = useState(false);

  const [selectedTerms, setSelectedTerms] = useState<string[]>(initialUrlState.selectedTerms);
  const [amountInput, setAmountInput] = useState(initialUrlState.amountInput);
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>(initialUrlState.selectedProductTypes);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>(initialUrlState.selectedBenefits);
  const [searchQuery, setSearchQuery] = useState(initialUrlState.searchQuery);
  const [onlyFavorites, setOnlyFavorites] = useState(initialUrlState.onlyFavorites);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<FinlifeSourceResult | null>(null);
  const [sourceStatusRows, setSourceStatusRows] = useState<SourceStatusRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const sourceStatusAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const availabilityTimer = window.setTimeout(() => {
      setAvailability([]);
      setAvailabilityNotice("");
    }, 0);
    return () => window.clearTimeout(availabilityTimer);
  }, [kind]);

  useEffect(() => {
    if (kind !== "deposit" && kind !== "saving") {
      sourceStatusAbortRef.current?.abort();
      const sourceStatusTimer = window.setTimeout(() => {
        setSourceStatusRows([]);
      }, 0);
      return () => window.clearTimeout(sourceStatusTimer);
    }

    sourceStatusAbortRef.current?.abort();
    const controller = new AbortController();
    sourceStatusAbortRef.current = controller;

    void (async () => {
      try {
        const response = await fetch("/api/sources/status", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await response.json()) as StatusApiResponse;
        if (!response.ok || !json.ok || !Array.isArray(json.data)) {
          if (!controller.signal.aborted) setSourceStatusRows([]);
          return;
        }
        if (!controller.signal.aborted) setSourceStatusRows(json.data);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        if (!controller.signal.aborted) setSourceStatusRows([]);
      }
    })();

    return () => controller.abort();
  }, [kind]);

  const providerOptions = useMemo(() => {
    const merged = FINLIFE_TOP_GROUPS.map((group) => {
      const hit = availability.find((row) => row.topFinGrpNo === group.id);
      return {
        id: group.id,
        name: group.label,
        short: group.short,
        totalCount: hit?.totalCount ?? null,
        status: hit?.status ?? "ok",
      };
    });

    if (availability.length === 0) return merged;
    if (showAllProviders) return merged;
    return merged.filter((entry) => entry.status === "ok" && (entry.totalCount ?? 0) > 0);
  }, [availability, showAllProviders]);

  const bankOptions = useMemo(() => {
    const banks = (payload?.data ?? [])
      .filter((item) => !!item.fin_co_no)
      .map((item) => ({
        id: item.fin_co_no!,
        name: item.kor_co_nm || "",
      }));
    
    const bankMap = new Map<string, { id: string; name: string }>();
    for (const b of banks) {
      if (!bankMap.has(b.id)) {
        bankMap.set(b.id, b);
      }
    }
    const unique = Array.from(bankMap.values());
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }, [payload?.data]);

  useEffect(() => {
    if (providerOptions.length === 0) return;
    if (providerOptions.some((entry) => entry.id === topFinGrpNo)) return;

    const providerFallbackTimer = window.setTimeout(() => {
      setTopFinGrpNo(providerOptions[0].id);
      setPageNo(1);
      setSelectionNotice("선택한 권역에 공시 상품이 없어 가능한 권역으로 자동 변경했습니다.");
    }, 0);
    return () => window.clearTimeout(providerFallbackTimer);
  }, [providerOptions, topFinGrpNo]);

  useEffect(() => {
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");

      const params = buildFinlifeRequestParams({
        topFinGrpNo,
        pageNo,
        scanMode,
        maxPages,
        pageSize: FINLIFE_PAGE_SIZE,
      });

      try {
        const res = await fetch(buildProductExplorerApiUrl(kind, params), { cache: "no-store" });
        const raw = await res.json();
        const parsed = parseFinlifeApiResponse(raw);

        if (aborted) return;

        if (!parsed.ok) {
          setError(parsed.error?.message ?? "데이터를 불러오지 못해요. 잠시 후 다시 시도해주세요.");
          return;
        }

        setPayload(parsed);
      } catch {
        if (aborted) return;
        setError("데이터를 불러오지 못해요. 잠시 후 다시 시도해주세요.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    if (topFinGrpNo) {
      void run();
    }
    return () => {
      aborted = true;
    };
  }, [kind, maxPages, pageNo, scanMode, topFinGrpNo]);

  useEffect(() => {
    const params = buildProductExplorerUrlParams({
      topFinGrpNo,
      pageNo,
      scanMode,
      maxPages,
      viewMode,
      optionSortKey,
      optionGroup,
      selectedFinCoNo,
      searchQuery,
      onlyFavorites,
      sortKey,
      defaultSortKey,
      selectedTerms,
      selectedProductTypes,
      selectedBenefits,
      amountInput,
      pageSize: FINLIFE_PAGE_SIZE,
    });
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [
    amountInput,
    defaultSortKey,
    kind,
    maxPages,
    onlyFavorites,
    optionGroup,
    optionSortKey,
    pageNo,
    router,
    scanMode,
    searchQuery,
    selectedBenefits,
    selectedFinCoNo,
    selectedProductTypes,
    selectedTerms,
    sortKey,
    topFinGrpNo,
    viewMode,
  ]);

  const shelfFavoriteIds = useMemo(() => shelf?.favorites ?? new Set<string>(), [shelf]);
  const shelfCompareSet = useMemo(() => new Set(shelf?.compareBasket ?? []), [shelf]);

  const productListViewModel = useMemo(
    () => buildProductListViewModel({
      payload,
      kind,
      selectedFinCoNo,
      selectedTerms,
      amountInput,
      selectedProductTypes,
      selectedBenefits,
      searchQuery,
      onlyFavorites,
      favoriteIds: shelfFavoriteIds,
      sortKey,
      ratePreference,
      optionSortKey,
      optionGroup,
      viewMode,
    }),
    [
      amountInput,
      kind,
      onlyFavorites,
      optionGroup,
      optionSortKey,
      payload,
      ratePreference,
      searchQuery,
      selectedBenefits,
      selectedFinCoNo,
      selectedProductTypes,
      selectedTerms,
      shelfFavoriteIds,
      sortKey,
      viewMode,
    ],
  );
  const {
    filterOptions,
    enrichedProducts,
    optionRows,
    optionGroups,
    validOptionGroupKeys,
    totals,
  } = productListViewModel;

  useEffect(() => {
    if (!optionGroup) return;
    const openGroupsTimer = window.setTimeout(() => {
      setOpenGroups((prev) => pruneOpen(prev, validOptionGroupKeys));
    }, 0);
    return () => window.clearTimeout(openGroupsTimer);
  }, [optionGroup, validOptionGroupKeys]);

  const hasNext = payload?.meta.hasNext ?? ((payload?.meta.pageNo ?? pageNo) >= 1 && (payload?.data.length ?? 0) > 0);

  const resetFilters = () => {
    setSelectedFinCoNo(null);
    setTopFinGrpNo(providerOptions[0]?.id ?? "020000");
    setPageNo(1);
    setScanMode("page");
    setMaxPages("auto");
    setViewMode("product");
    setSortKey(defaultSortKey);
    setOptionSortKey("best_desc");
    setOptionGroup(false);
    setOpenGroups({});
    setSelectionNotice("");
    setSelectedTerms([]);
    setSelectedProductTypes([]);
    setSelectedBenefits([]);
    setAmountInput("10000000");
    setSearchQuery("");
    setOnlyFavorites(false);
  };

  const compareCount = shelf?.compareBasket.length ?? 0;

  const handleToggleFavorite = (id: string) => {
    toggleFavorite(id);
  };

  const handleToggleCompare = (id: string) => {
    toggleCompare(id);
  };

  const handleViewed = (id: string) => {
    addRecent(id);
  };

  const snapshotStatus = useMemo(() => {
    const meta = payload?.meta;
    if (!meta) return null;
    const snapshot = meta.snapshot;
    if (!snapshot) return null;
    const isMock = payload?.mode === "mock" || meta.source === "mock" || meta.fallbackUsed;
    const groups = meta.groupsScanned ?? [];
    const hasNarrowGroup = groups.length <= 1;
    const hasIncomplete = Boolean(meta.truncatedByHardCap) || ((meta.completionRate ?? 1) < 0.95);
    return {
      text: `스냅샷: ${snapshot.totalProducts ?? meta.totalProducts ?? 0}상품 / 옵션 ${snapshot.totalOptions ?? meta.totalOptions ?? 0} · 완주율 ${typeof snapshot.completionRate === "number" ? `${Math.round(snapshot.completionRate * 1000) / 10}%` : "?"}${snapshot.generatedAt ? ` · 갱신 ${new Date(snapshot.generatedAt).toLocaleString("ko-KR", { hour12: false })}` : ""}`,
      isMock,
      hasNarrowGroup,
      hasIncomplete,
      note: sanitizeSnapshotNote(meta.note),
    };
  }, [payload]);

  const finlifeSourceStatusRow = useMemo(() => {
    if (kind !== "deposit" && kind !== "saving") return null;
    return sourceStatusRows.find((row) => row.sourceId === "finlife" && row.kind === kind) ?? null;
  }, [kind, sourceStatusRows]);

  const cardFreshnessMeta = useMemo<FinlifeCardFreshnessMeta | null>(() => {
    if (kind !== "deposit" && kind !== "saving") return null;

    const fallbackMode = formatFinlifeFallbackMode(payload);
    const assumptionNote = toProductAssumptionNote(payload?.meta.note);
    const snapshotGeneratedAt = payload?.meta.snapshot?.generatedAt ?? null;
    const rowStatus = deriveFreshnessStatus(finlifeSourceStatusRow);
    const lastSyncedAt = finlifeSourceStatusRow?.lastSyncedAt ?? snapshotGeneratedAt ?? null;

    if (!lastSyncedAt && !rowStatus && !fallbackMode && !assumptionNote) return null;

    return {
      sourceId: "finlife",
      kind,
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
      ...(rowStatus ? { freshnessStatus: rowStatus } : {}),
      ...(fallbackMode ? { fallbackMode } : {}),
      ...(assumptionNote ? { assumptionNotes: [assumptionNote] } : {}),
    };
  }, [finlifeSourceStatusRow, kind, payload]);

  return (
    <PageShell>
      <PageHeader 
        title={title} 
        description="서버에서 수집한 최신 금융상품 데이터를 기준으로 표시됩니다."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        데이터 신뢰 및 연동 상태는{" "}
        <Link href="/settings/data-sources" className="font-black text-primary hover:text-navy">
          내 설정 &gt; 데이터 신뢰 및 연동 상태
        </Link>
        에서 확인할 수 있습니다.
      </p>

      {snapshotStatus ? (
        <Card className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{snapshotStatus.text}</p>
          </div>
          {(snapshotStatus.hasNarrowGroup || snapshotStatus.hasIncomplete || snapshotStatus.isMock || snapshotStatus.note) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshotStatus.hasNarrowGroup ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 border border-amber-100">업권 범위 좁음</span> : null}
              {snapshotStatus.hasIncomplete ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 border border-amber-100">미완주 스캔</span> : null}
              {snapshotStatus.isMock ? <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 border border-rose-100">MOCK 데이터</span> : null}
              {snapshotStatus.note ? <span className="rounded-lg bg-surface-muted px-2 py-1 text-[10px] font-bold text-slate-500 border border-slate-100">{snapshotStatus.note}</span> : null}
            </div>
          )}
        </Card>
      ) : null}

      <div className="space-y-10">
        <ProductExplorerHeaderCard
          selectedProviderId={topFinGrpNo}
          onProviderSelect={(id) => {
            setTopFinGrpNo(id);
            setSelectedFinCoNo(null);
            setPageNo(1);
            setSelectionNotice("");
          }}
          selectedFinCoNo={selectedFinCoNo}
          onFinCoSelect={(id) => {
            setSelectedFinCoNo(id);
            setPageNo(1);
          }}
          onReset={resetFilters}
          groups={providerOptions}
          banks={bankOptions}
          showAllProviders={showAllProviders}
          onToggleShowAllProviders={setShowAllProviders}
          availabilityNotice={availabilityNotice || selectionNotice}
          termOptions={filterOptions.terms}
          selectedTerms={selectedTerms}
          onToggleTerm={(term) => {
            setSelectedTerms((prev) => (prev.includes(term) ? prev.filter((entry) => entry !== term) : [...prev, term]));
            setPageNo(1);
          }}
          amountInput={amountInput}
          onAmountInputChange={setAmountInput}
          productTypeOptions={filterOptions.productTypes}
          selectedProductTypes={selectedProductTypes}
          onToggleProductType={(tag) => {
            setSelectedProductTypes((prev) => (prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]));
            setPageNo(1);
          }}
          benefitOptions={filterOptions.benefits}
          selectedBenefits={selectedBenefits}
          onToggleBenefit={(tag) => {
            setSelectedBenefits((prev) => (prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]));
            setPageNo(1);
          }}
          scanMode={scanMode}
          onScanModeChange={(mode) => {
            setScanMode(mode);
            setPageNo(1);
          }}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          optionSortKey={optionSortKey}
          onOptionSortChange={setOptionSortKey}
          optionGroup={optionGroup}
          onOptionGroupChange={setOptionGroup}
        />

        <Card className="rounded-[2.5rem] p-8 shadow-sm border-slate-100 bg-white">
          <div className="grid gap-6 md:grid-cols-4 items-end mb-8">
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">상세 검색</label>
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPageNo(1);
                }}
                placeholder="은행명 또는 상품명을 입력하세요"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-surface-muted px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">정렬</label>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-surface-muted px-4 text-sm font-black text-slate-700 outline-none cursor-pointer transition-all focus:border-primary focus:bg-white"
                value={sortKey}
                onChange={(event) => {
                  const next = event.target.value;
                  setSortKey(isValidProductExplorerSortKey(next) ? next : defaultSortKey);
                }}
              >
                <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
                  {ratePreference === "higher" ? "금리 높은 순" : "금리 낮은 순"}
                </option>
                <option value="termAsc">기간 짧은 순</option>
                <option value="nameAsc">상품명 순</option>
              </select>
            </div>
            <div className="flex gap-2">
              <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-surface-muted transition-all hover:bg-white px-4">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(event) => {
                    setOnlyFavorites(event.target.checked);
                    setPageNo(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-xs font-black text-slate-600">즐겨찾기</span>
              </label>
              <Link
                href="/products/compare"
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-navy/10 transition-all hover:bg-navy active:scale-95 px-4"
              >
                <span data-product-compare-count className="text-xs font-black" suppressHydrationWarning>
                  비교함 {compareCount}
                </span>
              </Link>
              <script nonce={scriptNonce} dangerouslySetInnerHTML={{ __html: COMPARE_COUNT_BOOTSTRAP_SCRIPT }} />
            </div>
          </div>

          <ProductResultsHeader
            viewMode={viewMode}
            shownProducts={totals.shownProducts}
            shownOptions={totals.shownOptions}
            totalProducts={totals.totalProducts}
            totalOptions={totals.totalOptions}
            scanMode={scanMode}
            sortKey={sortKey}
            onSortChange={setSortKey}
            ratePreference={ratePreference}
            nowPage={payload?.meta.nowPage ?? payload?.meta.pageNo}
            maxPage={payload?.meta.maxPage}
            pagesFetched={payload?.meta.pagesFetched}
            truncatedByMaxPages={payload?.meta.truncatedByMaxPages}
            mode={payload?.mode}
            showSortControl={false}
          />

          <div className="divide-y divide-slate-50 mt-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <div key={`loading-${idx}`} className="flex items-center gap-6 py-8 px-4">
                  <Skeleton className="h-14 w-14 rounded-2xl bg-surface-muted" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-1/4 bg-surface-muted rounded-full" />
                    <Skeleton className="h-6 w-3/4 bg-surface-muted rounded-full" />
                  </div>
                  <Skeleton className="h-12 w-28 rounded-2xl bg-surface-muted" />
                </div>
              ))
            ) : error ? (
              <div className="mx-auto my-20 max-w-md text-center py-10 rounded-[2.5rem] bg-rose-50 border border-rose-100">
                <p className="text-lg font-black text-rose-900">데이터 오류</p>
                <p className="mt-2 text-sm font-medium text-rose-700/70 leading-relaxed">{error}</p>
                <Button className="mt-8 rounded-2xl px-10 h-12 font-black shadow-lg shadow-rose-900/20" variant="primary" onClick={() => router.refresh()}>
                  다시 시도하기
                </Button>
              </div>
            ) : ((viewMode === "product" ? enrichedProducts.length : optionRows.length) === 0) ? (
              <div className="py-20">
                <EmptyState
                  title="검색 결과가 없습니다"
                  description="다른 검색어나 필터를 조정하여 당신에게 꼭 맞는 상품을 찾아보세요."
                  icon="search"
                  actionLabel="필터 초기화"
                  onAction={resetFilters}
                />
              </div>
            ) : (
              viewMode === "product"
                ? enrichedProducts.map((item: NormalizedProduct, index) => {
                  const unifiedId = buildUnifiedDetailId(item);
                  const productId = item.fin_prdt_cd;
                  const highlightReasons = index < 3 ? (item.reasons ?? []).slice(0, 3) : [];
                  return (
                    <ProductRowItem
                      key={item.fin_prdt_cd}
                      product={item}
                      kind={kind}
                      amountWonDefault={parseAmountInput(amountInput)}
                      freshnessMeta={cardFreshnessMeta ?? undefined}
                      badges={[]}
                      reasonLines={highlightReasons}
                      isFavorite={shelfFavoriteIds.has(productId)}
                      isCompared={shelfCompareSet.has(productId)}
                      compareLimit={productShelfConfig.maxCompareBasket}
                      onToggleFavorite={() => handleToggleFavorite(productId)}
                      onToggleCompare={() => handleToggleCompare(productId)}
                      onViewed={() => handleViewed(productId)}
                      unifiedDetailHref={unifiedId ? `/products/catalog/${encodeURIComponent(unifiedId)}` : undefined}
                    />
                  );
                })
                : optionGroup
                  ? optionGroups.map((group) => {
                    const groupKey = group.product.fin_prdt_cd ?? group.key;
                    const rep = getOptionRates(group.representativeRow.option);
                    const summaryTerm = group.representativeRow.option.save_trm ? `${group.representativeRow.option.save_trm}개월` : "기간 정보 없음";
                    const open = !!openGroups[groupKey];
                    return (
                      <div key={groupKey} className="py-6">
                        <Card className={cn("overflow-hidden border border-slate-100 transition-all", open ? "shadow-md" : "shadow-sm")}>
                          <div className="flex items-start justify-between gap-4 p-6 bg-surface-muted/30">
                            <div className="flex min-w-0 items-start gap-4">
                              <ProviderLogo providerKey={group.product.fin_co_no} providerName={group.product.kor_co_nm ?? "-"} size={48} className="rounded-2xl shadow-sm" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.product.kor_co_nm ?? "-"}</p>
                                <h3 className="truncate text-base font-black text-navy tracking-tight">{group.product.fin_prdt_nm ?? "-"}</h3>
                                {cardFreshnessMeta ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black">
                                    {cardFreshnessMeta.lastSyncedAt ? (
                                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                                        기준 확인 {new Date(cardFreshnessMeta.lastSyncedAt).toLocaleString("ko-KR", { hour12: false })}
                                      </span>
                                    ) : null}
                                    {cardFreshnessMeta.freshnessStatus ? (
                                      <span
                                        className={cn(
                                          "rounded-full border px-2.5 py-1",
                                          cardFreshnessMeta.freshnessStatus === "ok"
                                            ? "border-primary/20 bg-primary/5 text-navy"
                                            : cardFreshnessMeta.freshnessStatus === "stale"
                                              ? "border-amber-200 bg-amber-50 text-amber-800"
                                              : cardFreshnessMeta.freshnessStatus === "error"
                                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                                : "border-slate-200 bg-white text-slate-500",
                                        )}
                                      >
                                        상태: {cardFreshnessMeta.freshnessStatus === "ok" ? "최신" : cardFreshnessMeta.freshnessStatus === "stale" ? "기준 지남" : cardFreshnessMeta.freshnessStatus === "error" ? "최근 확인 실패" : "기준 정보 없음"}
                                      </span>
                                    ) : null}
                                    {cardFreshnessMeta.fallbackMode ? (
                                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                                        {cardFreshnessMeta.fallbackMode}
                                      </span>
                                    ) : null}
                                    {cardFreshnessMeta.assumptionNotes?.[0] ? (
                                      <span className="line-clamp-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                                        유의: {cardFreshnessMeta.assumptionNotes[0]}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                <p className="mt-1 text-[11px] font-bold text-slate-500">
                                  {summaryTerm} · 최고 <span className="text-primary">{formatOptionRate(rep.best)}</span> (기본 {formatOptionRate(rep.base)})
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenGroups((prev) => toggleOpen(prev, groupKey));
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black text-slate-600 transition-all hover:border-primary/20 hover:text-primary"
                            >
                              {open ? "옵션 접기" : "옵션 보기"}
                            </button>
                          </div>

                          {open && (
                            <div className="border-t border-slate-100 p-6 bg-white animate-in slide-in-from-top-2 duration-300">
                              <div className="space-y-3 md:hidden">
                                {group.rows.map((row) => (
                                  <GroupedOptionMobileItem key={row.key} row={row} />
                                ))}
                              </div>
                              <div className="hidden overflow-hidden rounded-2xl border border-slate-100 md:block">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-surface-muted text-slate-400">
                                    <tr>
                                      <th className="px-4 py-3 text-left font-black uppercase tracking-widest">기간(개월)</th>
                                      <th className="px-4 py-3 text-right font-black uppercase tracking-widest">기본 금리</th>
                                      <th className="px-4 py-3 text-right font-black uppercase tracking-widest">최고 금리</th>
                                      <th className="px-4 py-3 text-right font-black uppercase tracking-widest">우대폭</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {group.rows.map((row) => {
                                      const rates = getOptionRates(row.option);
                                      const term = row.option.save_trm ?? "-";
                                      return (
                                        <tr key={row.key} className="text-slate-700 hover:bg-surface-muted transition-colors">
                                          <td className="px-4 py-3 font-black">{term}</td>
                                          <td className="px-4 py-3 text-right tabular-nums font-bold">{formatOptionRate(rates.base)}</td>
                                          <td className="px-4 py-3 text-right tabular-nums font-black text-primary">{formatOptionRate(rates.best)}</td>
                                          <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-400">{formatOptionBonus(rates.bonus)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })
                  : optionRows.map((row) => (
                    <ProductOptionRowItem
                      key={row.key}
                      row={row}
                      kind={kind}
                      amountWonDefault={parseAmountInput(amountInput)}
                      freshnessMeta={cardFreshnessMeta ?? undefined}
                    />
                  ))
            )}
          </div>

          {!loading && !error && (viewMode === "product" ? enrichedProducts.length > 0 : optionRows.length > 0) && scanMode === "page" && (
            <div className="flex items-center justify-center gap-6 border-t border-slate-100 py-12 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPageNo((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={pageNo <= 1}
                className="rounded-2xl h-12 px-8 font-black"
              >
                이전 페이지
              </Button>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted border border-slate-200 text-sm font-black text-slate-600 shadow-sm">
                {payload?.meta.nowPage ?? pageNo}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPageNo((p) => p + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={!hasNext}
                className="rounded-2xl h-12 px-8 font-black"
              >
                다음 페이지
              </Button>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
