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
});
