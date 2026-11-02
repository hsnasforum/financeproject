import { describe, expect, it } from "vitest";
import {
  PensionQueryError,
  evaluateGuaranteedFreshness,
  evaluateProductsFreshness,
  parsePensionQuery,
  queryGuaranteed,
  queryProducts,
  splitPensionFeeDescription,
  type PensionProductsQuery,
} from "../src/lib/products/pensionQuery";
import type {
  PensionGuaranteedItem,
  PensionGuaranteedSnapshot,
  PensionProductItem,
  PensionProductsSnapshot,
} from "../src/lib/products/pensionSnapshots";

const SOURCE = { id: "fss-lifeplan-openapi", name: "통합연금포털(금융감독원) OpenAPI", attribution: "통합연금포털(금융감독원) 콘텐츠", url: "https://example.invalid" };

function product(overrides: Partial<PensionProductItem>): PensionProductItem {
  return {
    areaCode: 3,
    area: "자산운용",
    company: "가회사",
    product: "가상품",
    launchDate: "2020-01-01",
    productType: "주식형",
    rcvMethod: null,
    feeType: "감소형",
    sells: "Y",
    guarantees: "N",
    reserve: 100,
    reserve1: null,
    reserve2: null,
    reserve3: null,
    earnRate3: 1,
    earnRate5: null,
    earnRate7: null,
    earnRate10: null,
    avgTotalEarRate: 1,
    avgFeeRate: 1,
    ...overrides,
  };
}

function productsSnapshot(items: PensionProductItem[], overrides: Partial<PensionProductsSnapshot> = {}): PensionProductsSnapshot {
  return {
    schemaVersion: 1,
    source: { ...SOURCE, endpoint: "psProdList2" },
    generatedAt: "2026-10-14T18:55:21.914Z",
    asOf: { year: 2026, quarter: 2, label: "2026년 2분기" },
    selection: {
      attempts: [
        { year: 2026, quarter: 3, status: "not_published", areaCode: 1 },
        { year: 2026, quarter: 2, status: "selected" },
      ],
      quartersBehind: 1,
    },
    areas: [{ code: 3, label: "자산운용", sourceRows: items.length, rowCount: items.length, exactDuplicateRowsRemoved: 0, excludedRowsWithoutProductInfo: 0 }],
    rowCount: items.length,
    items,
    ...overrides,
  };
}

function guaranteed(overrides: Partial<PensionGuaranteedItem>): PensionGuaranteedItem {
  return {
    areaCode: 4,
    area: "생명보험",
    reportMonth: "2026-09",
    company: "가생명",
    product: "가연금저축보험",
    publishedInterestRate: 2.3,
    guaranteedInterestRate: "(10년 이내) 1.00%, (10년 초과) 0.50%",
    fpFeeDesc: null,
    agentFeeDesc: "(7년 이내) 보험료의 2.0%|(납입기간 이내) 보험료의 4.2%",
    onlineFeeDesc: "(7년 이내) 보험료의 2.0%|(납입기간 이내) 보험료의 4.2%",
    tel: "02-0000-0000",
    ...overrides,
  };
}

function guaranteedSnapshot(items: PensionGuaranteedItem[]): PensionGuaranteedSnapshot {
  return {
    schemaVersion: 1,
    source: { ...SOURCE, endpoint: "psGuaranteedProdList" },
    generatedAt: "2026-10-14T18:55:21.914Z",
    asOf: { reportMonth: "2026-09", label: "2026년 9월" },
    areas: [{ code: 4, label: "생명보험", sourceRows: items.length, rowCount: items.length, exactDuplicateRowsRemoved: 0 }],
    rowCount: items.length,
    items,
  };
}

const productsQuery = (overrides: Partial<PensionProductsQuery> = {}) => ({
  ...(parsePensionQuery(new URLSearchParams({ dataset: "products" })) as PensionProductsQuery),
  ...overrides,
});

describe("pension query parsing", () => {
  it("defaults to the guaranteed dataset and the cost-first products view", () => {
    expect(parsePensionQuery(new URLSearchParams())).toEqual({ dataset: "guaranteed", area: "all", channel: "all", sort: "nameAsc", q: "" });
    expect(parsePensionQuery(new URLSearchParams({ dataset: "products" }))).toEqual({
      dataset: "products", area: "all", sells: "Y", guarantees: "all", productType: "all", sort: "feeAsc", q: "", page: 1,
    });
  });

  it("rejects unknown keys, values and repeated keys instead of ignoring them", () => {
    expect(() => parsePensionQuery(new URLSearchParams({ dataset: "deposit" }))).toThrow(PensionQueryError);
    expect(() => parsePensionQuery(new URLSearchParams({ dataset: "products", sort: "rateDesc" }))).toThrow(PensionQueryError);
    expect(() => parsePensionQuery(new URLSearchParams({ dataset: "products", area: "2" }))).toThrow(PensionQueryError);
    expect(() => parsePensionQuery(new URLSearchParams({ dataset: "guaranteed", page: "2" }))).toThrow(PensionQueryError);
    expect(() => parsePensionQuery(new URLSearchParams("dataset=products&area=1&area=3"))).toThrow(PensionQueryError);
    expect(() => parsePensionQuery(new URLSearchParams({ dataset: "products", page: "0" }))).toThrow(PensionQueryError);
  });
});

describe("pension products query", () => {
  const items = [
    product({ company: "다회사", product: "저비용", avgFeeRate: 0.4, earnRate3: 2 }),
    product({ company: "가회사", product: "비용없음", avgFeeRate: null, earnRate3: 9 }),
    product({ company: "나회사", product: "고비용", avgFeeRate: 1.5, earnRate3: 5, productType: "채권형" }),
    product({ company: "라회사", product: "판매중단", avgFeeRate: 0.1, sells: "N" }),
    product({ company: "마회사", product: "음수공시", avgFeeRate: -0.106, guarantees: "Y", productType: "채권형" }),
  ];

  it("sorts by the lowest fee first, keeps published outliers and puts missing values last", () => {
    const result = queryProducts(productsSnapshot(items), productsQuery());
    expect(result.items.map((row) => row.product)).toEqual(["음수공시", "저비용", "고비용", "비용없음"]);
    expect(result.missingSortValueCount).toBe(1);
    expect(result.items.every((row) => row.selling)).toBe(true);
  });

  it("keeps missing values last when sorting by returns as well", () => {
    const result = queryProducts(productsSnapshot(items), productsQuery({ sort: "earn3Desc" }));
    expect(result.items.map((row) => row.product)).toEqual(["비용없음", "고비용", "저비용", "음수공시"]);
    const tenYear = queryProducts(productsSnapshot(items), productsQuery({ sort: "earn10Desc" }));
    expect(tenYear.missingSortValueCount).toBe(4);
  });

  it("offers product types from the current scope without the type filter itself", () => {
    const result = queryProducts(productsSnapshot(items), productsQuery({ productType: "채권형" }));
    expect(result.items.map((row) => row.product)).toEqual(["음수공시", "고비용"]);
    expect(result.productTypes).toEqual([{ value: "주식형", count: 2 }, { value: "채권형", count: 2 }]);
  });

  it("filters by principal guarantee, selling status and spacing-insensitive search", () => {
    expect(queryProducts(productsSnapshot(items), productsQuery({ guarantees: "Y" })).items.map((row) => row.product)).toEqual(["음수공시"]);
    expect(queryProducts(productsSnapshot(items), productsQuery({ sells: "all" })).total).toBe(5);
    expect(queryProducts(productsSnapshot(items), productsQuery({ q: "고 비 용" })).items.map((row) => row.product)).toEqual(["고비용"]);
  });

  it("pages twenty rows at a time and clamps a page past the end", () => {
    const many = Array.from({ length: 45 }, (_, index) => product({ product: `상품${String(index).padStart(2, "0")}`, avgFeeRate: index }));
    const last = queryProducts(productsSnapshot(many), productsQuery({ page: 9 }));
    expect(last).toMatchObject({ total: 45, page: 3, pageCount: 3, pageSize: 20 });
    expect(last.items.map((row) => row.product)).toEqual(["상품40", "상품41", "상품42", "상품43", "상품44"]);
  });
});

describe("pension guaranteed query", () => {
  it("splits 계약체결비용 and 계약관리비용 at the published separator", () => {
    expect(splitPensionFeeDescription("A|B")).toEqual({ acquisition: "A", maintenance: "B" });
    expect(splitPensionFeeDescription("A only")).toEqual({ acquisition: "A only", maintenance: null });
    expect(splitPensionFeeDescription(null)).toEqual({ acquisition: null, maintenance: null });
  });

  it("filters by channel, keeps missing channels as undisclosed and sorts by name or published rate", () => {
    const snapshot = guaranteedSnapshot([
      guaranteed({ company: "나생명", publishedInterestRate: 2.05 }),
      guaranteed({ company: "가생명", publishedInterestRate: 2.3, onlineFeeDesc: null, fpFeeDesc: "X|Y" }),
    ]);
    const byName = queryGuaranteed(snapshot, { dataset: "guaranteed", area: "all", channel: "all", sort: "nameAsc", q: "" });
    expect(byName.items.map((row) => row.company)).toEqual(["가생명", "나생명"]);
    expect(byName.items[0].channels).toEqual(["대리점", "설계사"]);
    expect(byName.items[0].fees.find((fee) => fee.channel === "online")).toEqual({ channel: "online", label: "온라인", acquisition: null, maintenance: null });

    const online = queryGuaranteed(snapshot, { dataset: "guaranteed", area: "all", channel: "online", sort: "publishedRateDesc", q: "" });
    expect(online.items.map((row) => row.company)).toEqual(["나생명"]);
    const byRate = queryGuaranteed(snapshot, { dataset: "guaranteed", area: "all", channel: "all", sort: "publishedRateDesc", q: "" });
    expect(byRate.items.map((row) => row.publishedInterestRate)).toEqual([2.3, 2.05]);
  });
});

describe("pension freshness", () => {
  it("measures the collection age against the 7-day receipt rule", () => {
    const snapshot = productsSnapshot([product({})]);
    expect(evaluateProductsFreshness(snapshot, new Date("2026-10-20T00:00:00Z"))).toMatchObject({
      collectionAgeDays: 5, maxAgeDays: 7, collectionStale: false,
    });
    expect(evaluateProductsFreshness(snapshot, new Date("2026-10-21T18:55:21.914Z"))).toMatchObject({
      collectionAgeDays: 7, collectionStale: false,
    });
    expect(evaluateProductsFreshness(snapshot, new Date("2026-10-21T19:00:00Z"))).toMatchObject({
      collectionAgeDays: 7, collectionStale: true,
    });
  });

  it("counts quarters behind the newest completed KST quarter and reports unpublished ones", () => {
    const snapshot = productsSnapshot([product({})]);
    expect(evaluateProductsFreshness(snapshot, new Date("2026-10-15T00:00:00Z"))).toMatchObject({
      periodsBehind: 1, periodUnit: "quarter", periodStale: false, unpublishedPeriods: ["2026년 3분기"],
    });
    // 2027-01-01 09:00 KST is already Q1 2027, so Q4 2026 is the newest completed quarter.
    expect(evaluateProductsFreshness(snapshot, new Date("2027-01-01T00:00:00Z"))).toMatchObject({ periodsBehind: 2, periodStale: true });
    expect(evaluateProductsFreshness(snapshot, new Date("2026-12-31T14:00:00Z"))).toMatchObject({ periodsBehind: 1 });
  });

  it("counts months behind for the monthly guaranteed report", () => {
    const snapshot = guaranteedSnapshot([guaranteed({})]);
    expect(evaluateGuaranteedFreshness(snapshot, new Date("2026-10-15T00:00:00Z"))).toMatchObject({ periodsBehind: 1, periodUnit: "month", periodStale: false });
    expect(evaluateGuaranteedFreshness(snapshot, new Date("2027-03-01T00:00:00Z"))).toMatchObject({ periodsBehind: 6, periodStale: true });
  });
});
