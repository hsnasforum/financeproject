import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import type { FinlifeKind, FinlifeSourceResult } from "@/lib/finlife/types";
import {
  buildFinlifeRequestParams,
  buildProductExplorerApiUrl,
  FINLIFE_PAGE_SIZE,
  type ProductExplorerScanMode,
} from "@/lib/products/productExplorerUrlState";

export const PRODUCT_LIST_DATA_ERROR_MESSAGE = "데이터를 불러오지 못해요. 잠시 후 다시 시도해주세요.";

export type ProductListDataRequestInput = {
  kind: FinlifeKind;
  topFinGrpNo: string;
  pageNo: number;
  scanMode: ProductExplorerScanMode;
  maxPages: number | "auto";
};

export type ProductListDataRequestResult =
  | { status: "success"; payload: FinlifeSourceResult }
  | { status: "error"; error: string }
  | { status: "aborted" };

type ProductListDataRequestOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export async function requestFinlifeProductListData(
  input: ProductListDataRequestInput,
  options: ProductListDataRequestOptions = {},
): Promise<ProductListDataRequestResult> {
  const signal = options.signal;
  try {
    const params = buildFinlifeRequestParams({
      topFinGrpNo: input.topFinGrpNo,
      pageNo: input.pageNo,
      scanMode: input.scanMode,
      maxPages: input.maxPages,
      pageSize: FINLIFE_PAGE_SIZE,
    });
    const response = await (options.fetchImpl ?? fetch)(
      buildProductExplorerApiUrl(input.kind, params),
      {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      },
    );
    const raw = await response.json();
    const payload = parseFinlifeApiResponse(raw);

    if (signal?.aborted) return { status: "aborted" };
    if (!payload.ok) {
      return {
        status: "error",
        error: payload.error?.message ?? PRODUCT_LIST_DATA_ERROR_MESSAGE,
      };
    }
    return { status: "success", payload };
  } catch {
    if (signal?.aborted) return { status: "aborted" };
    return { status: "error", error: PRODUCT_LIST_DATA_ERROR_MESSAGE };
  }
}
