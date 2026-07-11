"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { FinlifeKind } from "@/lib/finlife/types";
import {
  buildProductExplorerUrlParams,
  FINLIFE_PAGE_SIZE,
  parseProductExplorerUrlState,
  type ProductExplorerSortKey,
} from "@/lib/products/productExplorerUrlState";

type ProductExplorerQueryControllerInput = {
  defaultSortKey: ProductExplorerSortKey;
  initialTopFinGrpNo: string;
  initialPageNo: number;
};

type ProductExplorerUrlParamsInput = Parameters<typeof buildProductExplorerUrlParams>[0];

export type ProductExplorerQuerySyncInput = Omit<ProductExplorerUrlParamsInput, "pageSize"> & {
  kind: FinlifeKind;
};

export function buildProductExplorerQueryTarget(input: ProductExplorerQuerySyncInput): string {
  const params = buildProductExplorerUrlParams({
    topFinGrpNo: input.topFinGrpNo,
    pageNo: input.pageNo,
    scanMode: input.scanMode,
    maxPages: input.maxPages,
    viewMode: input.viewMode,
    optionSortKey: input.optionSortKey,
    optionGroup: input.optionGroup,
    selectedFinCoNo: input.selectedFinCoNo,
    searchQuery: input.searchQuery,
    onlyFavorites: input.onlyFavorites,
    sortKey: input.sortKey,
    defaultSortKey: input.defaultSortKey,
    selectedTerms: input.selectedTerms,
    selectedProductTypes: input.selectedProductTypes,
    selectedBenefits: input.selectedBenefits,
    amountInput: input.amountInput,
    pageSize: FINLIFE_PAGE_SIZE,
  });
  return `?${params.toString()}`;
}

export function useProductExplorerQueryController({
  defaultSortKey,
  initialTopFinGrpNo,
  initialPageNo,
}: ProductExplorerQueryControllerInput) {
  const searchParams = useSearchParams();
  const initialUrlState = useMemo(
    () => parseProductExplorerUrlState(searchParams, {
      defaultSortKey,
      initialTopFinGrpNo,
      initialPageNo,
    }),
    [defaultSortKey, initialPageNo, initialTopFinGrpNo, searchParams],
  );
  const [topFinGrpNo, setTopFinGrpNo] = useState(initialUrlState.topFinGrpNo);
  const [selectedFinCoNo, setSelectedFinCoNo] = useState<string | null>(initialUrlState.selectedFinCoNo);
  const [pageNo, setPageNo] = useState(initialUrlState.pageNo);
  const [scanMode, setScanMode] = useState(initialUrlState.scanMode);
  const [maxPages, setMaxPages] = useState<number | "auto">(initialUrlState.maxPages);
  const [viewMode, setViewMode] = useState(initialUrlState.viewMode);
  const [sortKey, setSortKey] = useState<ProductExplorerSortKey>(initialUrlState.sortKey);
  const [optionSortKey, setOptionSortKey] = useState(initialUrlState.optionSortKey);
  const [optionGroup, setOptionGroup] = useState(initialUrlState.optionGroup);
  const [selectedTerms, setSelectedTerms] = useState<string[]>(initialUrlState.selectedTerms);
  const [amountInput, setAmountInput] = useState(initialUrlState.amountInput);
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>(initialUrlState.selectedProductTypes);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>(initialUrlState.selectedBenefits);
  const [searchQuery, setSearchQuery] = useState(initialUrlState.searchQuery);
  const [onlyFavorites, setOnlyFavorites] = useState(initialUrlState.onlyFavorites);

  return {
    topFinGrpNo,
    setTopFinGrpNo,
    selectedFinCoNo,
    setSelectedFinCoNo,
    pageNo,
    setPageNo,
    scanMode,
    setScanMode,
    maxPages,
    setMaxPages,
    viewMode,
    setViewMode,
    sortKey,
    setSortKey,
    optionSortKey,
    setOptionSortKey,
    optionGroup,
    setOptionGroup,
    selectedTerms,
    setSelectedTerms,
    amountInput,
    setAmountInput,
    selectedProductTypes,
    setSelectedProductTypes,
    selectedBenefits,
    setSelectedBenefits,
    searchQuery,
    setSearchQuery,
    onlyFavorites,
    setOnlyFavorites,
  };
}

export function useProductExplorerQuerySync(input: ProductExplorerQuerySyncInput): void {
  const router = useRouter();
  const target = buildProductExplorerQueryTarget(input);

  useEffect(() => {
    router.replace(target, { scroll: false });
  }, [
    input.amountInput,
    input.defaultSortKey,
    input.kind,
    input.maxPages,
    input.onlyFavorites,
    input.optionGroup,
    input.optionSortKey,
    input.pageNo,
    input.scanMode,
    input.searchQuery,
    input.selectedBenefits,
    input.selectedFinCoNo,
    input.selectedProductTypes,
    input.selectedTerms,
    input.sortKey,
    input.topFinGrpNo,
    input.viewMode,
    router,
    target,
  ]);
}
