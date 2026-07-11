"use client";

import { useEffect, useReducer } from "react";

import type { FinlifeKind, FinlifeSourceResult } from "@/lib/finlife/types";
import {
  requestFinlifeProductListData,
  type ProductListDataRequestInput,
  type ProductListDataRequestResult,
} from "@/lib/products/productListDataRequest";
import type { ProductExplorerScanMode } from "@/lib/products/productExplorerUrlState";

type UseFinlifeProductListDataInput = {
  kind: FinlifeKind;
  topFinGrpNo: string;
  pageNo: number;
  scanMode: ProductExplorerScanMode;
  maxPages: number | "auto";
};

export type FinlifeProductListDataState = {
  loading: boolean;
  error: string;
  payload: FinlifeSourceResult | null;
};

type FinlifeProductListDataAction =
  | { type: "request-started" }
  | {
    type: "request-settled";
    result: Exclude<ProductListDataRequestResult, { status: "aborted" }>;
  };

const INITIAL_FINLIFE_PRODUCT_LIST_DATA_STATE: FinlifeProductListDataState = {
  loading: true,
  error: "",
  payload: null,
};

export function reduceFinlifeProductListDataState(
  state: FinlifeProductListDataState,
  action: FinlifeProductListDataAction,
): FinlifeProductListDataState {
  if (action.type === "request-started") {
    return { ...state, loading: true, error: "" };
  }
  if (action.result.status === "success") {
    return { loading: false, error: "", payload: action.result.payload };
  }
  return { ...state, loading: false, error: action.result.error };
}

export function useFinlifeProductListData({
  kind,
  topFinGrpNo,
  pageNo,
  scanMode,
  maxPages,
}: UseFinlifeProductListDataInput): FinlifeProductListDataState {
  const [state, dispatch] = useReducer(
    reduceFinlifeProductListDataState,
    INITIAL_FINLIFE_PRODUCT_LIST_DATA_STATE,
  );

  useEffect(() => {
    if (!topFinGrpNo) return;

    const controller = new AbortController();
    const request: ProductListDataRequestInput = {
      kind,
      topFinGrpNo,
      pageNo,
      scanMode,
      maxPages,
    };

    dispatch({ type: "request-started" });
    void requestFinlifeProductListData(request, { signal: controller.signal }).then((result) => {
      if (result.status === "aborted" || controller.signal.aborted) return;
      dispatch({ type: "request-settled", result });
    });

    return () => controller.abort();
  }, [kind, maxPages, pageNo, scanMode, topFinGrpNo]);

  return state;
}
