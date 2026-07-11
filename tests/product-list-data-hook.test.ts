import { describe, expect, it } from "vitest";

import type { FinlifeSourceResult } from "../src/lib/finlife/types";
import {
  reduceFinlifeProductListDataState,
  type FinlifeProductListDataState,
} from "../src/components/products/useFinlifeProductListData";

function payload(productCode: string): FinlifeSourceResult {
  return {
    ok: true,
    mode: "live",
    meta: {
      kind: "pension",
      pageNo: 1,
      topFinGrpNo: "020000",
      fallbackUsed: false,
    },
    data: [{ fin_prdt_cd: productCode, options: [], raw: {} }],
  };
}

describe("product list data state", () => {
  it("starts a replacement request without discarding the current payload", () => {
    const currentPayload = payload("CURRENT");
    const state: FinlifeProductListDataState = {
      loading: false,
      error: "이전 오류",
      payload: currentPayload,
    };

    expect(reduceFinlifeProductListDataState(state, { type: "request-started" })).toEqual({
      loading: true,
      error: "",
      payload: currentPayload,
    });
  });

  it("replaces the payload on success and preserves it on a later error", () => {
    const nextPayload = payload("NEXT");
    const successState = reduceFinlifeProductListDataState(
      { loading: true, error: "", payload: payload("CURRENT") },
      { type: "request-settled", result: { status: "success", payload: nextPayload } },
    );
    const errorState = reduceFinlifeProductListDataState(successState, {
      type: "request-settled",
      result: { status: "error", error: "공시 데이터를 불러오지 못했습니다." },
    });

    expect(successState).toEqual({ loading: false, error: "", payload: nextPayload });
    expect(errorState).toEqual({
      loading: false,
      error: "공시 데이터를 불러오지 못했습니다.",
      payload: nextPayload,
    });
  });
});
