import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinlifeKind, FinlifeSourceResult } from "../src/lib/finlife/types";

const mocked = vi.hoisted(() => ({
  state: {
    loading: false,
    error: "",
    payload: null as FinlifeSourceResult | null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/products/pension",
}));

vi.mock("@/components/products/useFinlifeProductListData", () => ({
  useFinlifeProductListData: () => mocked.state,
}));

import { ProductListPage } from "../src/components/ProductListPage";

function makeSnapshotPayload(input: {
  mode?: FinlifeSourceResult["mode"];
  source?: FinlifeSourceResult["meta"]["source"];
  fallbackMode?: "REPLAY" | "CACHE";
} = {}): FinlifeSourceResult {
  return {
    ok: true,
    mode: input.mode ?? "fixture",
    meta: {
      kind: "deposit",
      pageNo: 1,
      topFinGrpNo: "020000",
      fallbackUsed: true,
      source: input.source ?? "snapshot",
      groupsScanned: ["020000", "030300"],
      completionRate: 1,
      snapshot: {
        generatedAt: "2026-06-22T16:02:29.629Z",
        ageMs: 110 * 24 * 60 * 60 * 1000,
        completionRate: 1,
        totalProducts: 1,
        totalOptions: 1,
      },
      ...(input.fallbackMode ? {
        fallback: {
          mode: input.fallbackMode,
          sourceKey: "finlife",
          generatedAt: "2026-06-22T16:02:29.629Z",
        },
      } : {}),
    },
    data: [{
      fin_prdt_cd: "copy-fixture",
      fin_co_no: "0010001",
      kor_co_nm: "테스트은행",
      fin_prdt_nm: "원천 저장 예금",
      options: [{ save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: {} }],
      raw: {},
    }],
  };
}

function renderList(kind: FinlifeKind): string {
  return renderToStaticMarkup(
    <ProductListPage
      initialTopFinGrpNo="020000"
      kind={kind}
      ratePreference="higher"
      title={kind === "pension" ? "연금저축 상품" : "예금 상품"}
    />,
  );
}

beforeEach(() => {
  mocked.state = { loading: false, error: "", payload: null };
});

describe("product list source and freshness copy", () => {
  it("does not promise current data when the pension API configuration is missing", () => {
    mocked.state.error = "FINLIFE_API_KEY가 설정되지 않았습니다.";

    const html = renderList("pension");

    expect(html).toContain("데이터 오류");
    expect(html).toContain("FINLIFE_API_KEY가 설정되지 않았습니다.");
    expect(html).toContain("다시 시도하기");
    expect(html).not.toContain("서버에서 수집한 최신 금융상품 데이터를 기준으로 표시됩니다.");
    expect(html).toContain("가입 전 금융회사 공시에서 금리와 조건을 다시 확인하세요.");
  });

  it("does not promise current data before loading has completed", () => {
    mocked.state.loading = true;

    const html = renderList("pension");

    expect(html).toContain("연금저축 상품");
    expect(html).not.toContain("서버에서 수집한 최신 금융상품 데이터를 기준으로 표시됩니다.");
    expect(html).toContain("가입 전 금융회사 공시에서 금리와 조건을 다시 확인하세요.");
  });

  it.each([
    { mode: "REPLAY" as const, label: "재생 데이터 기준" },
    { mode: "CACHE" as const, label: "캐시 기준" },
  ])("does not call a real $mode snapshot MOCK", ({ mode, label }) => {
    mocked.state.payload = makeSnapshotPayload({ fallbackMode: mode });

    const html = renderList("deposit");

    expect(html).toContain("원천 저장 예금");
    expect(html).toContain("스냅샷: 1상품 / 옵션 1");
    expect(html).toContain(label);
    expect(html).not.toContain("MOCK 데이터");
    expect(html).not.toContain("서버에서 수집한 최신 금융상품 데이터를 기준으로 표시됩니다.");
  });

  it.each([
    { mode: "mock" as const, source: "snapshot" as const },
    { mode: "fixture" as const, source: "mock" as const },
  ])("keeps explicit mock disclosure for mode=$mode/source=$source", ({ mode, source }) => {
    mocked.state.payload = makeSnapshotPayload({ mode, source });

    const html = renderList("deposit");

    expect(html).toContain("MOCK 데이터");
    expect(html).toContain("예시 데이터 기준");
  });
});
