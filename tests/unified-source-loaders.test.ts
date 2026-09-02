import { describe, expect, it, vi } from "vitest";
import {
  getUnifiedProductsWithLoaders,
  type UnifiedProductView,
} from "../src/lib/sources/unified";
import {
  type UnifiedSourceLoader,
  type UnifiedSourceLoaderMap,
  type UnifiedSourcePage,
} from "../src/lib/sources/unifiedLoaders";

function product(input: Partial<UnifiedProductView> & {
  stableId: string;
  sourceId: UnifiedProductView["sourceId"];
  externalKey: string;
  providerName?: string;
  productName?: string;
}): UnifiedProductView {
  return {
    kind: "deposit",
    providerName: input.providerName ?? "Provider",
    productName: input.productName ?? "Product",
    ...input,
  };
}

function createLoader(
  sourceId: UnifiedProductView["sourceId"],
  page: Omit<UnifiedSourcePage, "sourceId">,
): UnifiedSourceLoader {
  return {
    sourceId,
    refreshIfNeeded: vi.fn(async () => undefined),
    query: vi.fn(async () => ({
      sourceId,
      ...page,
    })),
  };
}

function baseInput(overrides: Partial<Parameters<typeof getUnifiedProductsWithLoaders>[0]> = {}) {
  return {
    kind: "deposit" as const,
    mode: "merged" as const,
    includeSources: ["finlife", "datago_kdb"] as Array<UnifiedProductView["sourceId"]>,
    sourceId: null,
    cursor: null,
    q: null,
    refresh: false,
    onlyNew: false,
    changedSince: null,
    includeTimestamps: false,
    limit: 20,
    sort: "recent" as const,
    qMode: "contains" as const,
    enrichSources: [],
    depositProtection: "any" as const,
    includeKdbOnly: false,
    debug: false,
    ...overrides,
  };
}

describe("unified source loaders", () => {
  it("merges fake loader pages without DB/network and preserves deposit protection policy", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [
        product({
          stableId: "P1",
          sourceId: "finlife",
          externalKey: "P1",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 2, intrRate2: 3 }],
          signals: { depositProtection: "unknown" },
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [
        product({
          stableId: "P1",
          sourceId: "datago_kdb",
          externalKey: "KDB-1",
          options: [{ sourceId: "datago_kdb", termMonths: 12, intrRate: 2.2, intrRate2: 3.2 }],
          signals: { depositProtection: "matched" },
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    const loaders: UnifiedSourceLoaderMap = { finlife, datago_kdb: kdb };

    const result = await getUnifiedProductsWithLoaders(baseInput({
      depositProtection: "require",
    }), loaders);

    expect(finlife.refreshIfNeeded).toHaveBeenCalledWith({ kind: "deposit", refresh: false });
    expect(kdb.refreshIfNeeded).toHaveBeenCalledWith({ kind: "deposit", refresh: false });
    expect(result.sources).toEqual({ finlife: { count: 1 }, datago_kdb: { count: 1 } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      stableId: "P1",
      sourceIds: ["finlife", "datago_kdb"],
      signals: { depositProtection: "matched" },
    });
    expect(result.items[0]?.options?.map((option) => option.sourceId)).toEqual(["datago_kdb"]);
  });

  it("finds catalog filter matches that exist only on a later source page", async () => {
    const finlife = createLoader("finlife", {
      count: 2,
      items: [product({
        stableId: "F1",
        sourceId: "finlife",
        externalKey: "F1",
        providerName: "첫은행",
        options: [{ sourceId: "finlife", termMonths: 6, intrRate: 1.5, intrRate2: 2 }],
      })],
      pageInfo: { hasMore: true, nextCursor: "fin-next", limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => query.cursor === "fin-next"
      ? {
          sourceId: "finlife",
          count: 2,
          items: [product({
            stableId: "F2",
            sourceId: "finlife",
            externalKey: "F2",
            providerName: "다음은행",
            options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
          })],
          pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
        }
      : {
          sourceId: "finlife",
          count: 2,
          items: [product({
            stableId: "F1",
            sourceId: "finlife",
            externalKey: "F1",
            providerName: "첫은행",
            options: [{ sourceId: "finlife", termMonths: 6, intrRate: 1.5, intrRate2: 2 }],
          })],
          pageInfo: { hasMore: true, nextCursor: "fin-next", limit: 1, sourceId: "finlife" },
        });
    const kdb = createLoader("datago_kdb", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "datago_kdb" },
    });
    const input = {
      ...baseInput({ limit: 1 }),
      provider: "다음은행",
      termMonths: 12,
      minRate: 3.5,
    } as Parameters<typeof getUnifiedProductsWithLoaders>[0] & {
      provider: string;
      termMonths: number;
      minRate: number;
    };

    const result = await getUnifiedProductsWithLoaders(input, { finlife, datago_kdb: kdb });

    expect(finlife.query).toHaveBeenCalledTimes(2);
    expect(result.items.map((item) => item.stableId)).toEqual(["F2"]);
  });

  it("returns provider facets independently from the first result page and can select a later provider", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({
        stableId: "FIRST",
        sourceId: "finlife",
        externalKey: "FIRST",
        providerName: "첫은행",
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    finlife.listProviderNames = vi.fn(async () => ["첫은행", "뒤페이지은행"]);
    vi.mocked(finlife.query).mockImplementation(async (query) => ({
      sourceId: "finlife",
      count: 1,
      items: [product({
        stableId: query.provider === "뒤페이지은행" ? "LATER" : "FIRST",
        sourceId: "finlife",
        externalKey: query.provider === "뒤페이지은행" ? "LATER" : "FIRST",
        providerName: query.provider === "뒤페이지은행" ? "뒤페이지은행" : "첫은행",
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: query.limit, sourceId: "finlife" },
    }));

    const initial = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      limit: 1,
    }), { finlife });
    expect(initial.items.map((item) => item.providerName)).toEqual(["첫은행"]);
    expect(initial.facets?.providers).toEqual(["뒤페이지은행", "첫은행"]);

    const selected = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      provider: "뒤페이지은행",
      limit: 1,
    }), { finlife });
    expect(selected.items.map((item) => item.stableId)).toEqual(["LATER"]);
    expect(finlife.query).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "뒤페이지은행" }));
  });

  it("serves the next filtered cursor from the bounded snapshot without rereading source page one", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      const pageIndex = query.cursor === null ? 0 : query.cursor === "page-2" ? 1 : 2;
      return {
        sourceId: "finlife",
        count: 1,
        items: [product({
          stableId: `F${pageIndex + 1}`,
          sourceId: "finlife",
          externalKey: `F${pageIndex + 1}`,
          productName: `상품 ${pageIndex + 1}`,
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        })],
        pageInfo: {
          hasMore: pageIndex < 2,
          nextCursor: pageIndex === 0 ? "page-2" : pageIndex === 1 ? "page-3" : null,
          limit: query.limit,
          sourceId: "finlife",
        },
      };
    });
    const input = baseInput({
      includeSources: ["finlife"],
      limit: 1,
      minRate: 3.5,
    });

    const first = await getUnifiedProductsWithLoaders(input, { finlife });
    expect(first.items.map((item) => item.stableId)).toEqual(["F1"]);
    expect(first.pageInfo.nextCursor).toBeTruthy();
    expect(finlife.query).toHaveBeenCalledTimes(3);

    const second = await getUnifiedProductsWithLoaders({
      ...input,
      cursor: first.pageInfo.nextCursor,
    }, { finlife });
    expect(second.items.map((item) => item.stableId)).toEqual(["F2"]);
    expect(finlife.query).toHaveBeenCalledTimes(3);
  });

  it("marks an endless filtered fallback partial at the page boundary", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [],
      pageInfo: { hasMore: true, nextCursor: "unused", limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      const call = vi.mocked(finlife.query).mock.calls.length;
      return {
        sourceId: "finlife",
        count: 1,
        items: [product({
          stableId: `BOUND-${call}`,
          sourceId: "finlife",
          externalKey: `BOUND-${call}`,
          productName: `경계 상품 ${call}`,
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        })],
        pageInfo: { hasMore: true, nextCursor: `bound-${call}`, limit: query.limit, sourceId: "finlife" },
      };
    });

    const result = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      limit: 100,
      termMonths: 12,
    }), { finlife });

    expect(finlife.query).toHaveBeenCalledTimes(20);
    expect(result.pageInfo.partial).toBe(true);
    expect(result.pageInfo.partialReasons).toEqual([
      expect.objectContaining({
        code: "SCAN_PAGE_CAP",
        sourceId: "finlife",
        cap: { unit: "pages", limit: 20 },
        message: expect.stringContaining("20페이지"),
        recovery: expect.any(String),
      }),
    ]);
    expect(result.items).toHaveLength(20);
  });

  it("reports the row cap separately when the bounded scan fills before exhaustion", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [],
      pageInfo: { hasMore: true, nextCursor: "unused", limit: 1000, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      const pageIndex = vi.mocked(finlife.query).mock.calls.length;
      const items = Array.from({ length: 1000 }, (_, rowIndex) => {
        const id = `${pageIndex}-${rowIndex}`;
        return product({
          stableId: `ROW-${id}`,
          sourceId: "finlife",
          externalKey: `ROW-${id}`,
          productName: `행 상한 상품 ${id}`,
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        });
      });
      return {
        sourceId: "finlife",
        count: items.length,
        items,
        pageInfo: {
          hasMore: true,
          nextCursor: `row-page-${pageIndex}`,
          limit: query.limit,
          sourceId: "finlife",
        },
      };
    });

    const result = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      termMonths: 12,
      limit: 10,
    }), { finlife });

    expect(finlife.query).toHaveBeenCalledTimes(20);
    expect(result.pageInfo.partialReasons).toEqual([
      expect.objectContaining({
        code: "SCAN_ROW_CAP",
        sourceId: "finlife",
        cap: { unit: "rows", limit: 20_000 },
        message: expect.stringContaining("20,000개 행"),
      }),
    ]);
  });

  it("keeps provider-facet failure separate from complete row data", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({
        stableId: "F1",
        sourceId: "finlife",
        externalKey: "F1",
        providerName: "현재은행",
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    finlife.listProviderNames = vi.fn(async () => {
      throw new Error("facet storage unavailable");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
    }), { finlife });

    expect(result.items.map((item) => item.stableId)).toEqual(["F1"]);
    expect(result.pageInfo.partial).not.toBe(true);
    expect(result.pageInfo.partialReasons ?? []).toEqual([]);
    expect(result.facets).toEqual({
      providers: ["현재은행"],
      providerStatus: {
        state: "partial",
        issues: [expect.objectContaining({
          code: "PROVIDER_FACET_FAILED",
          sourceId: "finlife",
          message: expect.any(String),
          recovery: expect.any(String),
        })],
      },
    });
    consoleError.mockRestore();
  });

  it("stops requesting additional source pages after the request is aborted", async () => {
    const controller = new AbortController();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [],
      pageInfo: { hasMore: true, nextCursor: "next", limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      controller.abort();
      return {
        sourceId: "finlife",
        count: 1,
        items: [product({
          stableId: "ABORT-1",
          sourceId: "finlife",
          externalKey: "ABORT-1",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        })],
        pageInfo: { hasMore: true, nextCursor: "next", limit: query.limit, sourceId: "finlife" },
      };
    });

    await expect(getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      minRate: 3.5,
      signal: controller.signal,
    }), { finlife })).rejects.toMatchObject({ name: "AbortError" });
    expect(finlife.query).toHaveBeenCalledTimes(1);
  });

  it("delegates single-source cursor queries to the selected loader", async () => {
    const samplebank = createLoader("samplebank", {
      count: 3,
      items: [
        product({
          stableId: "samplebank:S1",
          sourceId: "samplebank",
          externalKey: "S1",
          signals: { depositProtection: "matched" },
        }),
      ],
      pageInfo: { hasMore: true, nextCursor: "sample-next", limit: 1, sourceId: "samplebank" },
    });

    const result = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["samplebank"],
      sourceId: "samplebank",
      cursor: "sample-cursor",
      limit: 1,
      depositProtection: "prefer",
    }), { samplebank });

    expect(samplebank.query).toHaveBeenCalledWith(expect.objectContaining({
      cursor: "sample-cursor",
      limit: 1,
      kind: "deposit",
    }));
    expect(result.sources).toEqual({ samplebank: { count: 3 } });
    expect(result.pageInfo).toEqual({ hasMore: true, nextCursor: "sample-next", limit: 1, sourceId: "samplebank" });
    expect(result.items[0]?.sourceId).toBe("samplebank");
  });

  it("keeps stored results when one source refresh fails", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "F1", sourceId: "finlife", externalKey: "F1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [product({
        stableId: "K1",
        sourceId: "datago_kdb",
        externalKey: "K1",
        options: [{ sourceId: "datago_kdb", termMonths: 12, intrRate: 2.1, intrRate2: 3.1 }],
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    vi.mocked(kdb.refreshIfNeeded).mockRejectedValueOnce(new Error("upstream unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getUnifiedProductsWithLoaders(baseInput({ refresh: true }), { finlife, datago_kdb: kdb });

    expect(result.items.map((item) => item.stableId).sort()).toEqual(["F1", "K1"]);
    expect(result.sourceIssues).toEqual([expect.objectContaining({
      sourceId: "datago_kdb",
      phase: "refresh",
      fallbackUsed: true,
    })]);
    expect(result.pageInfo.partial).toBe(true);
    expect(result.pageInfo.partialReasons).toEqual([
      expect.objectContaining({
        code: "SOURCE_REFRESH_FALLBACK",
        sourceId: "datago_kdb",
        message: expect.stringContaining("이전에 저장된 상품"),
        recovery: expect.any(String),
      }),
    ]);
    consoleError.mockRestore();
  });

  it("marks a refresh fallback reported without throwing while keeping stored rows", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "F1", sourceId: "finlife", externalKey: "F1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    vi.mocked(finlife.refreshIfNeeded).mockResolvedValueOnce({ fallbackUsed: true });

    const result = await getUnifiedProductsWithLoaders(baseInput({
      includeSources: ["finlife"],
      refresh: true,
    }), { finlife });

    expect(result.items.map((item) => item.stableId)).toEqual(["F1"]);
    expect(result.pageInfo.partialReasons).toEqual([
      expect.objectContaining({
        code: "SOURCE_REFRESH_FALLBACK",
        sourceId: "finlife",
      }),
    ]);
  });

  it("returns the healthy source when another source query fails", async () => {
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "F1", sourceId: "finlife", externalKey: "F1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    vi.mocked(kdb.query).mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getUnifiedProductsWithLoaders(baseInput(), { finlife, datago_kdb: kdb });

    expect(result.items.map((item) => item.stableId)).toEqual(["F1"]);
    expect(result.sources.datago_kdb).toEqual({ count: 0 });
    expect(result.sourceIssues).toEqual([expect.objectContaining({
      sourceId: "datago_kdb",
      phase: "query",
      fallbackUsed: false,
    })]);
    expect(result.pageInfo.partial).toBe(true);
    expect(result.pageInfo.partialReasons).toEqual([
      expect.objectContaining({
        code: "SOURCE_QUERY_FAILED",
        sourceId: "datago_kdb",
        message: expect.stringContaining("후보가 누락"),
        recovery: expect.any(String),
      }),
    ]);
    consoleError.mockRestore();
  });

  it("uses the private recent key for global multi-source order and deterministic snapshot pages", async () => {
    const recentKey = Symbol.for("finance.unified.recentSortAt");
    const withRecentKey = (item: UnifiedProductView, recentAt: string): UnifiedProductView => Object.assign(
      item,
      { [recentKey]: recentAt },
    );
    const option = { sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 };
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        withRecentKey(product({
          stableId: "TIE-B",
          sourceId: "finlife",
          externalKey: "TIE-B",
          providerName: "나은행",
          productName: "동시 상품",
          options: [option],
        }), "2026-08-31T00:00:00.000Z"),
        withRecentKey(product({
          stableId: "TIE-A",
          sourceId: "finlife",
          externalKey: "TIE-A",
          providerName: "가은행",
          productName: "동시 상품",
          options: [option],
        }), "2026-08-31T00:00:00.000Z"),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [withRecentKey(product({
        stableId: "NEWEST",
        sourceId: "datago_kdb",
        externalKey: "NEWEST",
        providerName: "하은행",
        productName: "최신 상품",
        options: [{ ...option, sourceId: "datago_kdb" }],
      }), "2026-09-01T00:00:00.000Z")],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "datago_kdb" },
    });
    const input = baseInput({
      includeSources: ["finlife", "datago_kdb"],
      includeTimestamps: false,
      termMonths: 12,
      limit: 1,
      sort: "recent",
    });

    const first = await getUnifiedProductsWithLoaders(input, { finlife, datago_kdb: kdb });
    const second = await getUnifiedProductsWithLoaders({
      ...input,
      cursor: first.pageInfo.nextCursor,
    }, { finlife, datago_kdb: kdb });
    const third = await getUnifiedProductsWithLoaders({
      ...input,
      cursor: second.pageInfo.nextCursor,
    }, { finlife, datago_kdb: kdb });

    expect([first.items[0]?.stableId, second.items[0]?.stableId, third.items[0]?.stableId])
      .toEqual(["NEWEST", "TIE-A", "TIE-B"]);
    expect(finlife.query).toHaveBeenCalledTimes(1);
    expect(kdb.query).toHaveBeenCalledTimes(1);
    expect(first.items[0]?.firstSeenAt).toBeUndefined();
    expect(first.items[0]?.lastSeenAt).toBeUndefined();
    expect(first.items[0]?.updatedAt).toBeUndefined();
    expect(JSON.stringify(first)).not.toContain("finance.unified.recentSortAt");
  });

  it("fails closed when every requested source query fails", async () => {
    const finlife = createLoader("finlife", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    vi.mocked(finlife.query).mockRejectedValueOnce(new Error("finlife unavailable"));
    vi.mocked(kdb.query).mockRejectedValueOnce(new Error("kdb unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getUnifiedProductsWithLoaders(baseInput(), { finlife, datago_kdb: kdb }))
      .rejects.toThrow("모든 상품 데이터 소스를 불러오지 못했습니다.");
    consoleError.mockRestore();
  });
});
