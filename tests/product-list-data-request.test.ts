import { describe, expect, it } from "vitest";

import {
  PRODUCT_LIST_DATA_ERROR_MESSAGE,
  requestFinlifeProductListData,
} from "../src/lib/products/productListDataRequest";

function responsePayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    mode: "live",
    meta: {
      kind: "mortgage-loan",
      pageNo: 1,
      topFinGrpNo: "030300",
      fallbackUsed: true,
      source: "snapshot",
      note: "최근 저장 데이터",
    },
    data: [],
    ...overrides,
  };
}

const request = {
  kind: "mortgage-loan" as const,
  topFinGrpNo: "030300",
  pageNo: 4,
  scanMode: "all" as const,
  maxPages: "auto" as const,
};

describe("product list data request", () => {
  it("preserves the FINLIFE URL, no-store policy, signal, and fallback payload", async () => {
    const controller = new AbortController();
    let observedUrl = "";
    let observedInit: RequestInit | undefined;

    const result = await requestFinlifeProductListData(request, {
      signal: controller.signal,
      fetchImpl: async (input, init) => {
        observedUrl = String(input);
        observedInit = init;
        return new Response(JSON.stringify(responsePayload()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(observedUrl).toBe(
      "/api/finlife/mortgage-loan?topFinGrpNo=030300&pageNo=1&pageSize=50&scan=all&maxPages=auto",
    );
    expect(observedInit?.cache).toBe("no-store");
    expect(observedInit?.signal).toBe(controller.signal);
    expect(result).toMatchObject({
      status: "success",
      payload: {
        ok: true,
        meta: {
          fallbackUsed: true,
          source: "snapshot",
          note: "최근 저장 데이터",
        },
      },
    });
  });

  it("keeps the parsed API error message", async () => {
    const result = await requestFinlifeProductListData(request, {
      fetchImpl: async () => new Response(JSON.stringify(responsePayload({
        ok: false,
        error: {
          code: "UPSTREAM_FAILED",
          message: "공시 데이터를 불러오지 못했습니다.",
        },
      }))),
    });

    expect(result).toEqual({
      status: "error",
      error: "공시 데이터를 불러오지 못했습니다.",
    });
  });

  it("uses the existing safe message for network and parse failures", async () => {
    const networkResult = await requestFinlifeProductListData(request, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    const parseResult = await requestFinlifeProductListData(request, {
      fetchImpl: async () => new Response("not-json"),
    });

    expect(networkResult).toEqual({ status: "error", error: PRODUCT_LIST_DATA_ERROR_MESSAGE });
    expect(parseResult).toEqual({ status: "error", error: PRODUCT_LIST_DATA_ERROR_MESSAGE });
  });

  it("suppresses a stale response after the request signal is aborted", async () => {
    const controller = new AbortController();
    let resolveJson: ((value: unknown) => void) | undefined;
    const json = new Promise<unknown>((resolve) => {
      resolveJson = resolve;
    });

    const resultPromise = requestFinlifeProductListData(request, {
      signal: controller.signal,
      fetchImpl: async () => ({ json: () => json }) as Response,
    });

    controller.abort();
    resolveJson?.(responsePayload());

    await expect(resultPromise).resolves.toEqual({ status: "aborted" });
  });
});
