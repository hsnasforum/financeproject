"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type FinlifeKind, type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { applyFilters, collectFilterOptions } from "@/lib/finlife/filters";
import { pruneOpen, toggleOpen } from "@/lib/finlife/groupOpenState";
import { type RatePreference } from "@/lib/finlife/uiSort";
import {
  deriveTotals,
  flattenOptionRows,
  formatOptionBonus,
  formatOptionRate,
  getOptionRates,
  groupOptionRowsByProduct,
  sortOptionRows,
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
import {
  ensureProductReasons,
  filterProductsForList,
  sortProductsForList,
  type ProductListSortKey,
} from "@/lib/products/listUtils";
import {
  addRecent,
  loadShelfFromStorage,
  productShelfConfig,
  toggleCompare,
  toggleFavorite,
  type ProductShelfState,
} from "@/lib/state/productShelf";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Props = {
  kind: FinlifeKind;
  title: string;
  ratePreference: RatePreference;
  initialTopFinGrpNo: string;
  initialPageNo?: number;
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

const FINLIFE_PAGE_SIZE = 50;

function parseAmountInput(value: string): number {
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeSnapshotNote(note: string | null | undefined): string | null {
  if (!note) return null;
  return note
    .replaceAll("pnpm finlife:probe", "데이터 점검")
    .replaceAll("finlife:probe", "데이터 점검");
}

function isValidSortKey(value: string | null): value is SortKey {
  return value === "rateDesc" || value === "rateAsc" || value === "nameAsc" || value === "termAsc";
}

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
          <p className="mt-1 text-sm font-black text-slate-900">{term}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최고 금리</p>
          <p className="mt-1 text-lg font-black tabular-nums text-emerald-600">{formatOptionRate(rates.best)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">기본 금리</p>
          <p className="mt-1 text-xs font-bold tabular-nums text-slate-700">{formatOptionRate(rates.base)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50/50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/50">우대 폭</p>
          <p className="mt-1 text-xs font-bold tabular-nums text-emerald-700">{formatOptionBonus(rates.bonus)}</p>
        </div>
      </div>
    </div>
  );
}

export function ProductListPage({ kind, title, ratePreference, initialTopFinGrpNo, initialPageNo = 1 }: Props) {
  const router = useRouter();
  const [topFinGrpNo, setTopFinGrpNo] = useState(initialTopFinGrpNo);
  const [selectedFinCoNo, setSelectedFinCoNo] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(initialPageNo);
  const [scanMode, setScanMode] = useState<"page" | "all">("page");
  const [maxPages, setMaxPages] = useState<number | "auto">("auto");
  const [viewMode, setViewMode] = useState<"product" | "option">("product");
  const defaultSortKey: SortKey = ratePreference === "higher" ? "rateDesc" : "rateAsc";
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [optionSortKey, setOptionSortKey] = useState<OptionSortKey>("best_desc");
  const [optionGroup, setOptionGroup] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAllProviders, setShowAllProviders] = useState(false);

  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [amountInput, setAmountInput] = useState("10000000");
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([]);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [shelf, setShelf] = useState<ProductShelfState | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<FinlifeSourceResult | null>(null);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");

  useEffect(() => {
    setShelf(loadShelfFromStorage());
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("scan") === "all") {
      setScanMode("all");
      const mp = (sp.get("maxPages") ?? "").trim().toLowerCase();
      if (mp === "auto") setMaxPages("auto");
      else if (mp) {
        const parsed = Number(mp);
        if (Number.isFinite(parsed) && parsed > 0) setMaxPages(Math.min(80, Math.trunc(parsed)));
      }
    }
    const parsedSort = sp.get("sort");
    if (isValidSortKey(parsedSort)) setSortKey(parsedSort);
    const parsedQuery = (sp.get("q") ?? "").trim();
    if (parsedQuery) setSearchQuery(parsedQuery);
    if (sp.get("fav") === "1") setOnlyFavorites(true);
    const parsedTerms = parseCsvParam(sp.get("terms"));
    if (parsedTerms.length > 0) setSelectedTerms(parsedTerms);
    const parsedTypes = parseCsvParam(sp.get("types"));
    if (parsedTypes.length > 0) setSelectedProductTypes(parsedTypes);
    const parsedBenefits = parseCsvParam(sp.get("benefits"));
    if (parsedBenefits.length > 0) setSelectedBenefits(parsedBenefits);
    const parsedAmount = (sp.get("amount") ?? "").trim();
    if (parsedAmount) setAmountInput(parsedAmount);
    const parsedFinCoNo = (sp.get("finCoNo") ?? "").trim();
    if (parsedFinCoNo) setSelectedFinCoNo(parsedFinCoNo);
    if (sp.get("view") === "option") setViewMode("option");
    const parsedOptSort = sp.get("optSort");
    if (parsedOptSort && ["best_desc", "base_desc", "bonus_desc", "term_asc", "term_desc", "provider_asc", "product_asc"].includes(parsedOptSort)) {
      setOptionSortKey(parsedOptSort as OptionSortKey);
    }
    if (sp.get("optGroup") === "1") setOptionGroup(true);
  }, [kind]);

  useEffect(() => {
    const onStorage = () => setShelf(loadShelfFromStorage());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setAvailability([]);
    setAvailabilityNotice("");
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

    setTopFinGrpNo(providerOptions[0].id);
    setPageNo(1);
    setSelectionNotice("선택한 권역에 공시 상품이 없어 가능한 권역으로 자동 변경했습니다.");
  }, [providerOptions, topFinGrpNo]);

  useEffect(() => {
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("topFinGrpNo", topFinGrpNo);
      params.set("pageNo", scanMode === "page" ? String(pageNo) : "1");
      params.set("pageSize", String(FINLIFE_PAGE_SIZE));
      if (scanMode === "all") {
        params.set("scan", "all");
        params.set("maxPages", String(maxPages));
      }

      try {
        const res = await fetch(`/api/finlife/${kind}?${params.toString()}`, { cache: "no-store" });
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
    const params = new URLSearchParams();
    params.set("topFinGrpNo", topFinGrpNo);
    params.set("pageSize", String(FINLIFE_PAGE_SIZE));
    if (scanMode === "page") params.set("pageNo", String(pageNo));
    if (scanMode === "all") {
      params.set("scan", "all");
      params.set("maxPages", String(maxPages));
    }
    if (viewMode === "option") params.set("view", "option");
    if (viewMode === "option") {
      params.set("optSort", optionSortKey);
      if (optionGroup) params.set("optGroup", "1");
    }
    if (selectedFinCoNo) params.set("finCoNo", selectedFinCoNo);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (onlyFavorites) params.set("fav", "1");
    if (sortKey !== defaultSortKey) params.set("sort", sortKey);
    if (selectedTerms.length > 0) params.set("terms", selectedTerms.join(","));
    if (selectedProductTypes.length > 0) params.set("types", selectedProductTypes.join(","));
    if (selectedBenefits.length > 0) params.set("benefits", selectedBenefits.join(","));
    if (amountInput.trim() && amountInput !== "10000000") params.set("amount", amountInput.trim());
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

  const filterOptions = useMemo(() => collectFilterOptions(payload?.data ?? [], kind), [payload?.data, kind]);

  const shelfFavoriteIds = useMemo(() => shelf?.favorites ?? new Set<string>(), [shelf]);
  const shelfCompareSet = useMemo(() => new Set(shelf?.compareBasket ?? []), [shelf]);

  const filteredProducts = useMemo(() => {
    const products = (payload?.data ?? []).filter((item) => {
      if (!selectedFinCoNo) return true;
      return item.fin_co_no === selectedFinCoNo;
    });

    return applyFilters(
      products,
      {
        selectedTerms,
        amountWon: parseAmountInput(amountInput),
        selectedProductTypes,
        selectedBenefits,
      },
      kind,
    );
  }, [amountInput, kind, payload?.data, selectedFinCoNo, selectedBenefits, selectedProductTypes, selectedTerms]);

  const filteredByQuery = useMemo(
    () =>
      filterProductsForList(filteredProducts, {
        query: searchQuery,
        onlyFavorites,
        favoriteIds: shelfFavoriteIds,
      }),
    [filteredProducts, onlyFavorites, searchQuery, shelfFavoriteIds],
  );

  const filteredSorted = useMemo(
    () => sortProductsForList(filteredByQuery, sortKey, ratePreference),
    [filteredByQuery, ratePreference, sortKey],
  );

  const enrichedProducts = useMemo(() => ensureProductReasons(filteredSorted), [filteredSorted]);

  const optionRows = useMemo(() => {
    const rows = flattenOptionRows(enrichedProducts, selectedTerms);
    return sortOptionRows(rows, optionSortKey);
  }, [enrichedProducts, optionSortKey, selectedTerms]);

  const optionGroups = useMemo(() => {
    if (!optionGroup) return [];
    return groupOptionRowsByProduct(optionRows, "best_desc");
  }, [optionGroup, optionRows]);

  const validOptionGroupKeys = useMemo(
    () => optionGroups.map((group) => group.product.fin_prdt_cd ?? group.key),
    [optionGroups],
  );

  useEffect(() => {
    if (!optionGroup) return;
    setOpenGroups((prev) => pruneOpen(prev, validOptionGroupKeys));
  }, [optionGroup, validOptionGroupKeys]);

  const totals = useMemo(() => {
    if (viewMode === "product") {
      const shownOptions = enrichedProducts.reduce((sum, item) => sum + item.options.length, 0);
      return deriveTotals(payload, enrichedProducts.length, shownOptions);
    }
    const uniqueProducts = new Set(optionRows.map((row) => row.product.fin_prdt_cd)).size;
    return deriveTotals(payload, uniqueProducts, optionRows.length);
  }, [enrichedProducts, optionRows, payload, viewMode]);

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
    const next = toggleFavorite(id);
    setShelf(next);
  };

  const handleToggleCompare = (id: string) => {
    const next = toggleCompare(id);
    setShelf(next);
  };

  const handleViewed = (id: string) => {
    const next = addRecent(id);
    setShelf(next);
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

  return (
    <PageShell>
      <PageHeader 
        title={title} 
        description="서버에서 수집한 최신 금융상품 데이터를 기준으로 표시됩니다."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        데이터 신뢰 및 연동 상태는{" "}
        <Link href="/settings/data-sources" className="font-black text-emerald-600 hover:text-emerald-700">
          내 설정 &gt; 데이터 신뢰 및 연동 상태
        </Link>
        에서 확인할 수 있습니다.
      </p>

      {snapshotStatus ? (
        <Card className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{snapshotStatus.text}</p>
          </div>
          {(snapshotStatus.hasNarrowGroup || snapshotStatus.hasIncomplete || snapshotStatus.isMock || snapshotStatus.note) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshotStatus.hasNarrowGroup ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 border border-amber-100">업권 범위 좁음</span> : null}
              {snapshotStatus.hasIncomplete ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 border border-amber-100">미완주 스캔</span> : null}
              {snapshotStatus.isMock ? <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 border border-rose-100">MOCK 데이터</span> : null}
              {snapshotStatus.note ? <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 border border-slate-100">{snapshotStatus.note}</span> : null}
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
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">정렬</label>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none cursor-pointer transition-all focus:border-emerald-500 focus:bg-white"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
                  {ratePreference === "higher" ? "금리 높은 순" : "금리 낮은 순"}
                </option>
                <option value="termAsc">기간 짧은 순</option>
                <option value="nameAsc">상품명 순</option>
              </select>
            </div>
            <div className="flex gap-2">
              <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 transition-all hover:bg-white px-4">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(event) => {
                    setOnlyFavorites(event.target.checked);
                    setPageNo(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-black text-slate-600">즐겨찾기</span>
              </label>
              <Link
                href="/products/compare"
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/10 transition-all hover:bg-emerald-700 active:scale-95 px-4"
              >
                <span className="text-xs font-black">비교함 {compareCount}</span>
              </Link>
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
                  <Skeleton className="h-14 w-14 rounded-2xl bg-slate-100" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-1/4 bg-slate-100 rounded-full" />
                    <Skeleton className="h-6 w-3/4 bg-slate-100 rounded-full" />
                  </div>
                  <Skeleton className="h-12 w-28 rounded-2xl bg-slate-100" />
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
                          <div className="flex items-start justify-between gap-4 p-6 bg-slate-50/30">
                            <div className="flex min-w-0 items-start gap-4">
                              <ProviderLogo providerKey={group.product.fin_co_no} providerName={group.product.kor_co_nm ?? "-"} size={48} className="rounded-2xl shadow-sm" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.product.kor_co_nm ?? "-"}</p>
                                <h3 className="truncate text-base font-black text-slate-900 tracking-tight">{group.product.fin_prdt_nm ?? "-"}</h3>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">
                                  {summaryTerm} · 최고 <span className="text-emerald-600">{formatOptionRate(rep.best)}</span> (기본 {formatOptionRate(rep.base)})
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
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black text-slate-600 transition-all hover:border-emerald-200 hover:text-emerald-600"
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
                                  <thead className="bg-slate-50 text-slate-400">
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
                                        <tr key={row.key} className="text-slate-700 hover:bg-slate-50 transition-colors">
                                          <td className="px-4 py-3 font-black">{term}</td>
                                          <td className="px-4 py-3 text-right tabular-nums font-bold">{formatOptionRate(rates.base)}</td>
                                          <td className="px-4 py-3 text-right tabular-nums font-black text-emerald-600">{formatOptionRate(rates.best)}</td>
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
                    <ProductOptionRowItem key={row.key} row={row} kind={kind} amountWonDefault={parseAmountInput(amountInput)} />
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-sm font-black text-slate-600 shadow-sm">
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
