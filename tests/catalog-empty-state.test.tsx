import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogQueryKey,
  parseCatalogUrlState,
  type CatalogState,
  type UnifiedItem,
} from "../src/lib/products/catalogExplorer";
import type { ProductFreshnessSummary } from "../src/lib/sources/types";

// Test-only state injection: the real page renders a catalog response the client already received.
// No API, database or browser is involved; the rows below are synthetic.
const injected = vi.hoisted(() => ({ query: "", state: null as unknown }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/products/catalog",
  useSearchParams: () => new URLSearchParams(injected.query),
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useState = ((initial: unknown) => actual.useState(
    injected.state && initial && typeof initial === "object" && "provenanceFingerprint" in initial
      ? injected.state
      : initial,
  )) as typeof actual.useState;
  return { ...actual, default: { ...actual, useState }, useState };
});

const { default: ProductsCatalogPage } = await import("../src/app/products/catalog/page");

function freshness(sourceAsOf: string | null): ProductFreshnessSummary {
  const checkedAt = "2026-10-18T00:00:00.000Z";
  const state = sourceAsOf ? "fresh" : "unavailable";
  return {
    checkedAt,
    overall: state,
    sources: [{ sourceId: "finlife", kind: "deposit", sourceAsOf, checkedAt, ttlMs: 43_200_000, ageMs: sourceAsOf ? 0 : null, freshness: state, fallbackUsed: false, message: "test" }],
  };
}

const syntheticRow: UnifiedItem = {
  stableId: "finlife:deposit:test-1",
  sourceId: "finlife",
  kind: "deposit",
  externalKey: "test-1",
  providerName: "테스트은행",
  productName: "TEST_ONLY 정기예금",
  options: [{ saveTrm: "12", termMonths: 12, intrRate: 3.1, intrRate2: 3.4 }],
};

function render(input: {
  query: string;
  rows?: UnifiedItem[];
  providerNames?: string[];
  providerStatus?: CatalogState["providerStatus"];
  sourceAsOf?: string | null;
  respond?: boolean;
}): string {
  injected.query = input.query;
  const url = parseCatalogUrlState(new URLSearchParams(input.query));
  injected.state = input.respond === false ? null : ({
    queryKey: buildCatalogQueryKey({ ...url, includeSamplebank: false }),
    rows: input.rows ?? [],
    nextCursor: null,
    hasMore: false,
    freshness: freshness(input.sourceAsOf === undefined ? null : input.sourceAsOf),
    providerNames: input.providerNames ?? [],
    partialReasons: [],
    providerStatus: input.providerStatus ?? { state: "complete", issues: [] },
    provenanceFingerprint: "TEST_ONLY",
  } satisfies CatalogState);
  return renderToStaticMarkup(<ProductsCatalogPage />);
}

const UNPREPARED = "공식 상품 자료가 아직 준비되지 않았습니다";
const NO_MATCH = "검색 결과가 없습니다";

afterEach(() => {
  injected.query = "";
  injected.state = null;
});

describe("catalog empty states", () => {
  it("explains an unprepared catalog without filters and links to the public data status page", () => {
    const html = render({ query: "kind=deposit" });
    expect(html).toContain(UNPREPARED);
    expect(html).toContain('href="/settings/data-sources"');
    expect(html).not.toContain(NO_MATCH);
    expect(html).not.toContain("필터 초기화");
    expect(html).not.toMatch(/finlife:sync|pnpm|\/api\/dev|\/ops\//);
  });

  it("keeps the unprepared state when filters are set, because no provider has any product", () => {
    const html = render({ query: "kind=deposit&q=TEST_NO_MATCH&termMonths=12" });
    expect(html).toContain(UNPREPARED);
    expect(html).not.toContain(NO_MATCH);
  });

  it("treats a bundled snapshot time without stored products as unprepared", () => {
    const html = render({ query: "kind=deposit", sourceAsOf: "2026-10-18T00:00:00.000Z" });
    expect(html).toContain(UNPREPARED);
  });

  it("keeps the ordinary zero-match guidance when products exist for other filters", () => {
    const html = render({ query: "kind=deposit&q=TEST_NO_MATCH", providerNames: ["테스트은행"], sourceAsOf: "2026-10-18T00:00:00.000Z" });
    expect(html).toContain(NO_MATCH);
    expect(html).toContain("필터 초기화");
    expect(html).not.toContain(UNPREPARED);
  });

  it("does not claim the catalog is unprepared when the provider facet itself is incomplete", () => {
    const html = render({
      query: "kind=deposit",
      providerStatus: { state: "partial", issues: [{ code: "PROVIDER_FACET_FAILED", sourceId: "finlife", message: "test", recovery: "test" }] },
    });
    expect(html).not.toContain(UNPREPARED);
  });

  it("renders stored products when data exists", () => {
    const html = render({ query: "kind=deposit", rows: [syntheticRow], providerNames: ["테스트은행"], sourceAsOf: "2026-10-18T00:00:00.000Z" });
    expect(html).toContain("TEST_ONLY 정기예금");
    expect(html).not.toContain(UNPREPARED);
    expect(html).not.toContain(NO_MATCH);
  });

  it("shows neither empty state before the first response for the current query arrives", () => {
    const html = render({ query: "kind=deposit", respond: false });
    expect(html).not.toContain(UNPREPARED);
    expect(html).not.toContain(NO_MATCH);
  });
});
