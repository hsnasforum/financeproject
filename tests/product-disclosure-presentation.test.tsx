import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinlifeKind, FinlifeSourceResult, NormalizedProduct } from "@/lib/finlife/types";

const source = vi.hoisted(() => ({
  state: { loading: false, error: "", payload: null as FinlifeSourceResult | null },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/products/credit-loan",
}));
vi.mock("@/components/products/useFinlifeProductListData", () => ({
  useFinlifeProductListData: () => source.state,
}));

import { ProductListPage } from "@/components/ProductListPage";
import { ProductRowItem } from "@/components/products/ProductRowItem";
import { ProductOptionRowItem } from "@/components/products/ProductOptionRowItem";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { flattenOptionRows } from "@/lib/finlife/optionView";

const collectedAt = "2026-10-10T00:00:00.000Z";

function product(month: unknown = "202609", name = "원문 공시월 상품"): NormalizedProduct {
  return {
    fin_prdt_cd: name, fin_co_no: "0010001", kor_co_nm: "검증 은행", fin_prdt_nm: name,
    options: [{ save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "단리" } }],
    best: { save_trm: "12", intr_rate: 3, intr_rate2: 3.4 },
    raw: { fin_co_no: "0010001", fin_prdt_cd: name, dcls_month: month },
  };
}

function payload(kind: FinlifeKind, products: NormalizedProduct[], time: string | undefined = collectedAt): FinlifeSourceResult {
  return {
    ok: true, mode: "fixture",
    meta: {
      kind, pageNo: 1, topFinGrpNo: "020000", fallbackUsed: true, source: "snapshot",
      snapshot: { generatedAt: time, totalProducts: products.length, totalOptions: products.length },
      fallback: { mode: "REPLAY", sourceKey: "finlife", generatedAt: time },
    },
    data: products,
  };
}

function renderList(kind: FinlifeKind) {
  return renderToStaticMarkup(
    <ProductListPage kind={kind} title="금융상품" ratePreference="lower" initialTopFinGrpNo="020000" />,
  );
}

function renderDrawer(item: NormalizedProduct, time: string | null = collectedAt) {
  const props = {
    open: true, onOpenChange: () => undefined, kind: "deposit" as const,
    product: item, amountWonDefault: 10_000_000, collectedAt: time,
  };
  return renderToStaticMarkup(<ProductDetailDrawer {...props} />);
}

beforeEach(() => { source.state = { loading: false, error: "", payload: null }; });

describe("FINLIFE disclosure and collection presentation", () => {
  it.each(["credit-loan", "mortgage-loan", "rent-house-loan"] as const)(
    "shows September disclosure and October collection independently in the %s list",
    (kind) => {
      source.state.payload = payload(kind, [product()]);
      const html = renderList(kind);
      expect(html).toContain("원문 공시월: 2026년 9월");
      expect(html).toContain("수집 시각: 2026. 10. 10. 09:00:00");
      expect(html).toContain("재생 데이터 기준");
      expect(html).not.toContain("MOCK 데이터");
      expect(html).not.toContain("원문 공시월: 2026년 10월");
    },
  );

  it("uses the same disclosure month in a product row, an option row, and its open detail", () => {
    const item = product();
    const freshnessMeta = { sourceId: "finlife", kind: "deposit" as const, lastSyncedAt: collectedAt };
    const rowHtml = renderToStaticMarkup(
      <ProductRowItem product={item} kind="deposit" amountWonDefault={10_000_000} freshnessMeta={freshnessMeta} />,
    );
    const optionRow = flattenOptionRows([item], [], "deposit")[0];
    const optionHtml = renderToStaticMarkup(
      <ProductOptionRowItem row={optionRow} kind="deposit" amountWonDefault={10_000_000} freshnessMeta={freshnessMeta} />,
    );
    for (const html of [rowHtml, optionHtml, renderDrawer(item)]) {
      expect(html).toContain("원문 공시월: 2026년 9월");
      expect(html).toContain("수집 시각: 2026. 10. 10. 09:00:00");
    }
  });

  it.each(["", "202600", "202613", "2026-09", "20260930"])(
    "shows invalid disclosure %s as unknown without estimating from collection",
    (month) => {
      const html = renderDrawer(product(month));
      expect(html).toContain("원문 공시월: 확인되지 않음");
      expect(html).toContain("수집 시각: 2026. 10. 10. 09:00:00");
      expect(html).not.toContain("원문 공시월: 2026년 10월");
    },
  );

  it("keeps different source months visible on separate products in the same collection", () => {
    source.state.payload = payload("mortgage-loan", [
      product("202609", "9월 공시 상품"), product("202608", "8월 공시 상품"),
    ]);
    const html = renderList("mortgage-loan");
    expect(html).toContain("원문 공시월: 2026년 9월");
    expect(html).toContain("원문 공시월: 2026년 8월");
    expect(html).not.toContain("원문 공시월: 2026년 10월");
  });

  it("shows both fields as unknown when the source supplies neither", () => {
    const item = product();
    item.raw = {};
    source.state.payload = { ...payload("credit-loan", [item]), meta: {
      kind: "credit-loan", pageNo: 1, topFinGrpNo: "020000", fallbackUsed: false,
    } };
    for (const html of [renderList("credit-loan"), renderDrawer(item, null)]) {
      expect(html).toContain("원문 공시월: 확인되지 않음");
      expect(html).toContain("수집 시각: 확인되지 않음");
    }
  });

  it("keeps valid disclosure visible when the collection timestamp is invalid", () => {
    const html = renderDrawer(product(), "not-a-date");
    expect(html).toContain("원문 공시월: 2026년 9월");
    expect(html).toContain("수집 시각: 확인되지 않음");
    expect(html).not.toContain("Invalid Date");
  });

  it.each(["credit-loan", "mortgage-loan", "rent-house-loan"] as const)(
    "preserves the %s API key failure instead of supplying substitute products",
    (kind) => {
      source.state.error = "FINLIFE_API_KEY가 설정되지 않았습니다.";
      const html = renderList(kind);
      expect(html).toContain("데이터 오류");
      expect(html).toContain("FINLIFE_API_KEY가 설정되지 않았습니다.");
      expect(html).toContain("다시 시도하기");
      expect(html).not.toContain("원문 공시월 상품");
    },
  );
});
