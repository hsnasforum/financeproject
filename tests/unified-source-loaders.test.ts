import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUnifiedCatalogSnapshotStoreStats,
  getUnifiedProductsWithLoaders,
  resetUnifiedCatalogSnapshotStoreForTests,
  type UnifiedCatalogSnapshot,
  type UnifiedProductView,
  type UnifiedProductsRuntimeOptions,
  type UnifiedSnapshotProvenance,
} from "../src/lib/sources/unified";
import {
  BoundedCatalogSnapshotStore,
  type CatalogSnapshotSharedBuildInput,
} from "../src/lib/sources/unifiedCatalogSnapshotStore";
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const RECENT_SORT_KEY = Symbol.for("finance.unified.recentSortAt");

function withRecentSortAt(item: UnifiedProductView, recentAt: string): UnifiedProductView {
  return Object.assign(item, { [RECENT_SORT_KEY]: recentAt });
}

function createPaginatedLoader(input: {
  sourceId: UnifiedProductView["sourceId"];
  items: UnifiedProductView[];
  nativePageSize?: number;
}): UnifiedSourceLoader {
  const nativePageSize = input.nativePageSize ?? 60;
  return {
    sourceId: input.sourceId,
    refreshIfNeeded: vi.fn(async () => undefined),
    query: vi.fn(async (query) => {
      const offset = query.cursor === null
        ? 0
        : Number(query.cursor?.slice(query.cursor.lastIndexOf(":") + 1));
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("unexpected test cursor");
      const items = input.items.slice(offset, offset + nativePageSize);
      const nextOffset = offset + items.length;
      const hasMore = nextOffset < input.items.length;
      return {
        sourceId: input.sourceId,
        count: items.length,
        items,
        pageInfo: {
          hasMore,
          nextCursor: hasMore ? `${input.sourceId}:${nextOffset}` : null,
          limit: query.limit,
          sourceId: input.sourceId,
        },
      };
    }),
  };
}

function orderedProducts(input: {
  sourceId: UnifiedProductView["sourceId"];
  prefix: string;
  count: number;
  newestAt: string;
  productNamePrefix?: string;
}): UnifiedProductView[] {
  const newestAt = new Date(input.newestAt).getTime();
  return Array.from({ length: input.count }, (_, index) => {
    const id = `${input.prefix}${String(index + 1).padStart(3, "0")}`;
    return withRecentSortAt(product({
      stableId: id,
      sourceId: input.sourceId,
      externalKey: id,
      providerName: `${input.prefix}은행`,
      productName: `${input.productNamePrefix ?? "상품"} ${id}`,
    }), new Date(newestAt - index * 60_000).toISOString());
  });
}

async function collectCatalogPages(input: {
  query: ReturnType<typeof baseInput>;
  loaders: UnifiedSourceLoaderMap;
  runtime?: UnifiedProductsRuntimeOptions;
}): Promise<Awaited<ReturnType<typeof getUnifiedProductsWithLoaders>>[]> {
  const pages: Awaited<ReturnType<typeof getUnifiedProductsWithLoaders>>[] = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await getUnifiedProductsWithLoaders(
      { ...input.query, cursor },
      input.loaders,
      input.runtime,
    );
    pages.push(page);
    cursor = page.pageInfo.nextCursor;
    if (!cursor) return pages;
  }
  throw new Error("catalog pagination did not terminate");
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

function createCatalogSnapshotStore(input: Partial<{
  maxSnapshots: number;
  maxRetainedRows: number;
  maxEstimatedBytes: number;
}> = {}) {
  return new BoundedCatalogSnapshotStore<UnifiedCatalogSnapshot>({
    ttlMs: 1_000,
    sweepIntervalMs: 100,
    maxSnapshots: input.maxSnapshots ?? 8,
    maxRetainedRows: input.maxRetainedRows ?? 1_000,
    maxEstimatedBytes: input.maxEstimatedBytes ?? 1_000_000,
  });
}

describe("unified source loaders", () => {
  beforeEach(() => {
    resetUnifiedCatalogSnapshotStoreForTests();
  });

  it("returns every default multi-source catalog row across stable global pages", async () => {
    const finItems = orderedProducts({
      sourceId: "finlife",
      prefix: "F",
      count: 100,
      newestAt: "2026-09-02T23:59:00.000Z",
    });
    const kdbItems = orderedProducts({
      sourceId: "datago_kdb",
      prefix: "K",
      count: 100,
      newestAt: "2026-09-01T23:59:00.000Z",
    });
    const finlife = createPaginatedLoader({ sourceId: "finlife", items: finItems });
    const kdb = createPaginatedLoader({ sourceId: "datago_kdb", items: kdbItems });
    const pinned: UnifiedSnapshotProvenance = {
      policy: "pinned_snapshot",
      capturedAt: "2026-09-03T00:00:00.000Z",
      versionFingerprint: "default-catalog-v1",
      freshness: {
        checkedAt: "2026-09-03T00:00:00.000Z",
        overall: "fresh",
        sources: [],
      },
    };
    const captureCatalogProvenance = vi.fn(async () => pinned);
    const query = baseInput({ limit: 60 });

    const pages = await collectCatalogPages({
      query,
      loaders: { finlife, datago_kdb: kdb },
      runtime: { captureCatalogProvenance },
    });
    const pageIds = pages.map((page) => page.items.map((item) => item.stableId));
    const allIds = pageIds.flat();

    expect(pageIds).toEqual([
      finItems.slice(0, 60).map((item) => item.stableId),
      [
        ...finItems.slice(60).map((item) => item.stableId),
        ...kdbItems.slice(0, 20).map((item) => item.stableId),
      ],
      kdbItems.slice(20, 80).map((item) => item.stableId),
      kdbItems.slice(80).map((item) => item.stableId),
    ]);
    expect(allIds).toHaveLength(200);
    expect(new Set(allIds)).toHaveProperty("size", 200);
    expect(pages.map((page) => page.pageInfo.hasMore)).toEqual([true, true, true, false]);
    expect(pages.every((page) => page.provenance?.versionFingerprint === "default-catalog-v1")).toBe(true);
    expect(captureCatalogProvenance).toHaveBeenCalledTimes(1);
    expect(vi.mocked(finlife.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "finlife:60"]);
    expect(vi.mocked(kdb.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "datago_kdb:60"]);

    const repeated = await getUnifiedProductsWithLoaders(
      query,
      { finlife, datago_kdb: kdb },
      { captureCatalogProvenance },
    );
    expect(repeated.items.map((item) => item.stableId)).toEqual(pageIds[0]);
    expect(finlife.query).toHaveBeenCalledTimes(2);
    expect(kdb.query).toHaveBeenCalledTimes(2);
  });

  it("returns every q-only match and binds its cursor to the normalized query", async () => {
    const finItems = orderedProducts({
      sourceId: "finlife",
      prefix: "QF",
      count: 100,
      newestAt: "2026-09-02T23:59:00.000Z",
      productNamePrefix: "검색대상",
    });
    const kdbItems = orderedProducts({
      sourceId: "datago_kdb",
      prefix: "QK",
      count: 100,
      newestAt: "2026-09-01T23:59:00.000Z",
      productNamePrefix: "검색대상",
    });
    const finlife = createPaginatedLoader({ sourceId: "finlife", items: finItems });
    const kdb = createPaginatedLoader({ sourceId: "datago_kdb", items: kdbItems });
    const query = baseInput({ q: "  검색대상  ", limit: 60 });
    const loaders = { finlife, datago_kdb: kdb };

    const pages = await collectCatalogPages({ query, loaders });
    const allIds = pages.flatMap((page) => page.items.map((item) => item.stableId));

    expect(pages).toHaveLength(4);
    expect(allIds).toEqual([
      ...finItems.map((item) => item.stableId),
      ...kdbItems.map((item) => item.stableId),
    ]);
    expect(new Set(allIds)).toHaveProperty("size", 200);
    expect(vi.mocked(finlife.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "finlife:60"]);
    expect(vi.mocked(kdb.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "datago_kdb:60"]);

    const firstCursor = pages[0]?.pageInfo.nextCursor;
    if (!firstCursor) throw new Error("expected q-only catalog cursor");
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      q: "다른검색어",
      cursor: firstCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      kind: "saving",
      cursor: firstCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      sort: "name",
      cursor: firstCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      limit: 61,
      cursor: firstCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      includeSources: ["finlife", "samplebank"],
      cursor: firstCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    const legacyOffsetCursor = Buffer.from(JSON.stringify({ id: 60 }), "utf8").toString("base64url");
    await expect(getUnifiedProductsWithLoaders({
      ...query,
      cursor: legacyOffsetCursor,
    }, loaders)).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    const normalizedQueryPage = await getUnifiedProductsWithLoaders({
      ...query,
      includeSources: ["datago_kdb", "finlife"],
      q: "검색대상",
      cursor: firstCursor,
    }, loaders);
    expect(normalizedQueryPage.items.map((item) => item.stableId)).toEqual(pages[1]?.items.map((item) => item.stableId));
  });

  it.each([
    { name: "default", q: null, repeatedQ: null },
    { name: "q-only", q: "검색대상", repeatedQ: "  검색대상  " },
  ])("coalesces concurrent canonical-equivalent $name snapshot builds", async ({ q, repeatedQ }) => {
    const finItems = orderedProducts({
      sourceId: "finlife",
      prefix: "CF",
      count: 3,
      newestAt: "2026-09-03T00:00:00.000Z",
      productNamePrefix: q ?? undefined,
    });
    const kdbItems = orderedProducts({
      sourceId: "datago_kdb",
      prefix: "CK",
      count: 3,
      newestAt: "2026-09-02T00:00:00.000Z",
      productNamePrefix: q ?? undefined,
    });
    const finlife = createPaginatedLoader({ sourceId: "finlife", items: finItems, nativePageSize: 2 });
    const kdb = createPaginatedLoader({ sourceId: "datago_kdb", items: kdbItems, nativePageSize: 2 });
    const firstFinlifePageStarted = deferred();
    const releaseFinlifeFirstPages = deferred();
    const originalFinlifeQuery = vi.mocked(finlife.query).getMockImplementation();
    if (!originalFinlifeQuery) throw new Error("expected finlife query implementation");
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      if (query.cursor === null) {
        firstFinlifePageStarted.resolve();
        await releaseFinlifeFirstPages.promise;
      }
      return originalFinlifeQuery(query);
    });
    finlife.listProviderNames = vi.fn(async () => ["CF은행"]);
    kdb.listProviderNames = vi.fn(async () => ["CK은행"]);
    const pinned: UnifiedSnapshotProvenance = {
      policy: "pinned_snapshot",
      capturedAt: "2026-09-03T00:00:00.000Z",
      versionFingerprint: `concurrent-${q ?? "default"}`,
      freshness: {
        checkedAt: "2026-09-03T00:00:00.000Z",
        overall: "fresh",
        sources: [],
      },
    };
    const captureCatalogProvenance = vi.fn(async () => pinned);
    const loaders = { finlife, datago_kdb: kdb };
    const runtime = { captureCatalogProvenance };
    const query = baseInput({ q, limit: 2 });

    const firstPromise = getUnifiedProductsWithLoaders(query, loaders, runtime);
    await firstFinlifePageStarted.promise;
    const secondPromise = getUnifiedProductsWithLoaders({
      ...query,
      includeSources: ["datago_kdb", "finlife"],
      q: repeatedQ,
    }, loaders, runtime);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 2,
    }));
    releaseFinlifeFirstPages.resolve();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(vi.mocked(finlife.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "finlife:2"]);
    expect(vi.mocked(kdb.query).mock.calls.map(([call]) => call.cursor)).toEqual([null, "datago_kdb:2"]);
    expect(finlife.listProviderNames).toHaveBeenCalledTimes(1);
    expect(kdb.listProviderNames).toHaveBeenCalledTimes(1);
    expect(captureCatalogProvenance).toHaveBeenCalledTimes(1);
    expect(first.items.map((item) => item.stableId)).toEqual(second.items.map((item) => item.stableId));
    expect(first.pageInfo.nextCursor).toBe(second.pageInfo.nextCursor);
    expect(first.provenance?.versionFingerprint).toBe(second.provenance?.versionFingerprint);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });

  it("keeps a shared catalog build running when only one caller aborts", async () => {
    const store = createCatalogSnapshotStore();
    const firstPageStarted = deferred<AbortSignal>();
    const releaseFirstPage = deferred<void>();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "AF-1", sourceId: "finlife", externalKey: "AF-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    const originalFinlifeQuery = vi.mocked(finlife.query).getMockImplementation();
    if (!originalFinlifeQuery) throw new Error("expected finlife query implementation");
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      if (!query.signal) throw new Error("expected shared build signal");
      firstPageStarted.resolve(query.signal);
      await releaseFirstPage.promise;
      return originalFinlifeQuery(query);
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [product({ stableId: "AK-1", sourceId: "datago_kdb", externalKey: "AK-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "datago_kdb" },
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const query = baseInput({ limit: 1 });
    const runtime = { catalogSnapshotStore: store };

    try {
      const first = getUnifiedProductsWithLoaders(
        { ...query, signal: firstController.signal },
        { finlife, datago_kdb: kdb },
        runtime,
      );
      const firstOutcome = first.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      const sharedSignal = await firstPageStarted.promise;
      const second = getUnifiedProductsWithLoaders(
        { ...query, signal: secondController.signal },
        { finlife, datago_kdb: kdb },
        runtime,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(store.stats()).toEqual(expect.objectContaining({
        inFlightBuildCount: 1,
        activeSubscriberCount: 2,
      }));

      firstController.abort();
      expect(await firstOutcome).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });
      expect(sharedSignal.aborted).toBe(false);
      releaseFirstPage.resolve();

      await expect(second).resolves.toEqual(expect.objectContaining({
        items: expect.any(Array),
      }));
      expect(finlife.query).toHaveBeenCalledTimes(1);
      expect(kdb.query).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 1,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      releaseFirstPage.resolve();
      store.dispose();
    }
  });

  it("cancels an all-aborted catalog build and lets a new caller retry immediately", async () => {
    const store = createCatalogSnapshotStore();
    const firstBuildStarted = deferred<AbortSignal>();
    let queryInvocation = 0;
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "RF-1", sourceId: "finlife", externalKey: "RF-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    const retryPage = vi.mocked(finlife.query).getMockImplementation();
    if (!retryPage) throw new Error("expected finlife query implementation");
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      queryInvocation += 1;
      if (queryInvocation > 1) return retryPage(query);
      if (!query.signal) throw new Error("expected shared build signal");
      firstBuildStarted.resolve(query.signal);
      return new Promise<UnifiedSourcePage>((_resolve, reject) => {
        query.signal?.addEventListener("abort", () => {
          reject(new DOMException("cancelled", "AbortError"));
        }, { once: true });
      });
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [product({ stableId: "RK-1", sourceId: "datago_kdb", externalKey: "RK-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "datago_kdb" },
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const query = baseInput({ limit: 1 });
    const loaders = { finlife, datago_kdb: kdb };
    const runtime = { catalogSnapshotStore: store };

    try {
      const first = getUnifiedProductsWithLoaders({ ...query, signal: firstController.signal }, loaders, runtime);
      const second = getUnifiedProductsWithLoaders({ ...query, signal: secondController.signal }, loaders, runtime);
      const abortedOutcomes = Promise.allSettled([first, second]);
      const oldSignal = await firstBuildStarted.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      firstController.abort();
      expect(oldSignal.aborted).toBe(false);
      secondController.abort();
      expect(oldSignal.aborted).toBe(true);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));

      const retry = getUnifiedProductsWithLoaders(query, loaders, runtime);
      const [outcomes, retryResult] = await Promise.all([abortedOutcomes, retry]);

      expect(outcomes).toEqual([
        expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
        expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
      ]);
      expect(retryResult.items.map((item) => item.stableId)).toEqual(["RF-1"]);
      expect(finlife.query).toHaveBeenCalledTimes(2);
      expect(kdb.query).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 1,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      store.dispose();
    }
  });

  it.each([
    { name: "q", override: { q: "다른 검색어" } },
    { name: "limit", override: { limit: 21 } },
    { name: "kind", override: { kind: "saving" as const } },
    { name: "sort", override: { sort: "name" as const } },
    { name: "provider", override: { provider: "다른은행" } },
    { name: "term", override: { termMonths: 12 } },
    { name: "rate", override: { minRate: 3.5 } },
  ])("does not share concurrent catalog builds with a different $name signature", async ({ override }) => {
    const store = createCatalogSnapshotStore();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({
        stableId: "SF-1",
        sourceId: "finlife",
        externalKey: "SF-1",
        providerName: "기준은행",
        options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [product({
        stableId: "SK-1",
        sourceId: "datago_kdb",
        externalKey: "SK-1",
        providerName: "기준은행",
        options: [{ sourceId: "datago_kdb", termMonths: 12, intrRate: 3, intrRate2: 4 }],
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    const loaders = { finlife, datago_kdb: kdb };
    const runtime = { catalogSnapshotStore: store };

    try {
      await Promise.all([
        getUnifiedProductsWithLoaders(baseInput(), loaders, runtime),
        getUnifiedProductsWithLoaders(baseInput(override), loaders, runtime),
      ]);

      expect(finlife.query).toHaveBeenCalledTimes(2);
      expect(kdb.query).toHaveBeenCalledTimes(2);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 2,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      store.dispose();
    }
  });

  it("shares a structured partial snapshot across concurrent callers", async () => {
    const store = createCatalogSnapshotStore();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "PF-1", sourceId: "finlife", externalKey: "PF-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "finlife" },
    });
    const kdb = createLoader("datago_kdb", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 20, sourceId: "datago_kdb" },
    });
    vi.mocked(kdb.query).mockRejectedValueOnce(new Error("kdb unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loaders = { finlife, datago_kdb: kdb };
    const runtime = { catalogSnapshotStore: store };

    try {
      const [first, second] = await Promise.all([
        getUnifiedProductsWithLoaders(baseInput(), loaders, runtime),
        getUnifiedProductsWithLoaders(baseInput(), loaders, runtime),
      ]);

      expect(finlife.query).toHaveBeenCalledTimes(1);
      expect(kdb.query).toHaveBeenCalledTimes(1);
      expect(first.pageInfo.partialReasons).toEqual([
        expect.objectContaining({ code: "SOURCE_QUERY_FAILED", sourceId: "datago_kdb" }),
      ]);
      expect(second.pageInfo.partialReasons).toEqual(first.pageInfo.partialReasons);
      expect(first.sourceIssues).toEqual(second.sourceIssues);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 1,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      consoleError.mockRestore();
      store.dispose();
    }
  });

  it("rechecks the completed snapshot after becoming the shared build owner", async () => {
    const store = createCatalogSnapshotStore();
    const finlife = createLoader("finlife", {
      count: 0,
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    const originalRunSharedBuild = store.runSharedBuild.bind(store);
    let capturedSignature = "";
    const interceptedRunSharedBuild = <R>(input: CatalogSnapshotSharedBuildInput<R>): Promise<R> => {
      capturedSignature = input.signature;
      return originalRunSharedBuild(input);
    };
    vi.spyOn(store, "runSharedBuild").mockImplementation(interceptedRunSharedBuild);
    const query = baseInput({ includeSources: ["finlife"], provider: "race-bank", limit: 1 });

    try {
      const pending = getUnifiedProductsWithLoaders(query, { finlife }, { catalogSnapshotStore: store });
      expect(capturedSignature).not.toBe("");
      const stored = store.put({
        signature: capturedSignature,
        kind: "deposit",
        sources: { finlife: { count: 1 } },
        items: [product({
          stableId: "DOUBLE-CHECK-1",
          sourceId: "finlife",
          externalKey: "DOUBLE-CHECK-1",
          providerName: "race-bank",
        })],
        providers: ["race-bank"],
        partialReasons: [],
        providerStatus: { state: "complete", issues: [] },
      });
      expect(stored.stored).toBe(true);

      const result = await pending;

      expect(result.items.map((item) => item.stableId)).toEqual(["DOUBLE-CHECK-1"]);
      expect(finlife.refreshIfNeeded).not.toHaveBeenCalled();
      expect(finlife.query).not.toHaveBeenCalled();
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 1,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      store.dispose();
    }
  });

  it("shares one no-cursor result when the completed snapshot exceeds its resource budget", async () => {
    const store = createCatalogSnapshotStore({ maxRetainedRows: 1 });
    const put = vi.spyOn(store, "put");
    const firstPageStarted = deferred<void>();
    const releaseFirstPage = deferred<void>();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "LF-1", sourceId: "finlife", externalKey: "LF-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    const firstPage = vi.mocked(finlife.query).getMockImplementation();
    if (!firstPage) throw new Error("expected finlife query implementation");
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      firstPageStarted.resolve();
      await releaseFirstPage.promise;
      return firstPage(query);
    });
    const kdb = createLoader("datago_kdb", {
      count: 1,
      items: [product({ stableId: "LK-1", sourceId: "datago_kdb", externalKey: "LK-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "datago_kdb" },
    });
    const query = baseInput({ limit: 1 });
    const loaders = { finlife, datago_kdb: kdb };
    const runtime = { catalogSnapshotStore: store };

    try {
      const first = getUnifiedProductsWithLoaders(query, loaders, runtime);
      await firstPageStarted.promise;
      const second = getUnifiedProductsWithLoaders(query, loaders, runtime);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      releaseFirstPage.resolve();
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(finlife.query).toHaveBeenCalledTimes(1);
      expect(kdb.query).toHaveBeenCalledTimes(1);
      expect(put).toHaveBeenCalledTimes(1);
      expect(firstResult.pageInfo).toEqual(expect.objectContaining({
        hasMore: false,
        nextCursor: null,
        partial: true,
      }));
      expect(firstResult.pageInfo.partialReasons).toContainEqual(expect.objectContaining({
        code: "CURSOR_UNAVAILABLE_RESOURCE_LIMIT",
      }));
      expect(secondResult).toEqual(firstResult);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      releaseFirstPage.resolve();
      store.dispose();
    }
  });

  it("shares a real build failure and retries after in-flight cleanup", async () => {
    const store = createCatalogSnapshotStore();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({
        stableId: "RECOVERED-1",
        sourceId: "finlife",
        externalKey: "RECOVERED-1",
        providerName: "복구은행",
      })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const query = baseInput({ includeSources: ["finlife"], provider: "복구은행", limit: 1 });
    const runtime = { catalogSnapshotStore: store };

    try {
      const outcomes = await Promise.allSettled([
        getUnifiedProductsWithLoaders(query, { finlife }, runtime),
        getUnifiedProductsWithLoaders(query, { finlife }, runtime),
      ]);

      expect(outcomes[0]?.status).toBe("rejected");
      expect(outcomes[1]?.status).toBe("rejected");
      if (outcomes[0]?.status !== "rejected" || outcomes[1]?.status !== "rejected") {
        throw new Error("expected both shared callers to fail");
      }
      expect(outcomes[1].reason).toBe(outcomes[0].reason);
      expect(finlife.query).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));

      await expect(getUnifiedProductsWithLoaders(query, { finlife }, runtime)).resolves.toEqual(
        expect.objectContaining({ items: [expect.objectContaining({ stableId: "RECOVERED-1" })] }),
      );
      expect(finlife.query).toHaveBeenCalledTimes(2);
      expect(store.stats().snapshotCount).toBe(1);
    } finally {
      consoleError.mockRestore();
      store.dispose();
    }
  });

  it("cancels provenance capture without storing a snapshot when every caller aborts", async () => {
    const store = createCatalogSnapshotStore();
    const put = vi.spyOn(store, "put");
    const provenanceStarted = deferred<AbortSignal>();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "PV-1", sourceId: "finlife", externalKey: "PV-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    const captureCatalogProvenance = vi.fn((captureInput: Parameters<NonNullable<
      UnifiedProductsRuntimeOptions["captureCatalogProvenance"]
    >>[0]) => {
      if (!captureInput.signal) throw new Error("expected shared provenance signal");
      provenanceStarted.resolve(captureInput.signal);
      return new Promise<UnifiedSnapshotProvenance>((_resolve, reject) => {
        captureInput.signal?.addEventListener("abort", () => {
          reject(new DOMException("cancelled", "AbortError"));
        }, { once: true });
      });
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const query = baseInput({ includeSources: ["finlife"], provider: "Provider", limit: 1 });
    const runtime = { catalogSnapshotStore: store, captureCatalogProvenance };

    try {
      const first = getUnifiedProductsWithLoaders({ ...query, signal: firstController.signal }, { finlife }, runtime);
      const second = getUnifiedProductsWithLoaders({ ...query, signal: secondController.signal }, { finlife }, runtime);
      const outcomes = Promise.allSettled([first, second]);
      const sharedSignal = await provenanceStarted.promise;

      firstController.abort();
      expect(sharedSignal.aborted).toBe(false);
      secondController.abort();
      expect(sharedSignal.aborted).toBe(true);

      expect(await outcomes).toEqual([
        expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
        expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
      ]);
      expect(captureCatalogProvenance).toHaveBeenCalledTimes(1);
      expect(put).not.toHaveBeenCalled();
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      store.dispose();
    }
  });

  it("aborts the production in-flight build when the test reset clears the store", async () => {
    const buildStarted = deferred<AbortSignal>();
    const finlife = createLoader("finlife", {
      count: 1,
      items: [product({ stableId: "RESET-1", sourceId: "finlife", externalKey: "RESET-1" })],
      pageInfo: { hasMore: false, nextCursor: null, limit: 1, sourceId: "finlife" },
    });
    vi.mocked(finlife.query).mockImplementation(async (query) => {
      if (!query.signal) throw new Error("expected shared build signal");
      buildStarted.resolve(query.signal);
      return new Promise<UnifiedSourcePage>((_resolve, reject) => {
        query.signal?.addEventListener("abort", () => {
          reject(new DOMException("reset", "AbortError"));
        }, { once: true });
      });
    });
    const pending = getUnifiedProductsWithLoaders(
      baseInput({ includeSources: ["finlife"], provider: "Provider", limit: 1 }),
      { finlife },
    );
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    const signal = await buildStarted.promise;

    resetUnifiedCatalogSnapshotStoreForTests();

    expect(signal.aborted).toBe(true);
    expect(await outcome).toEqual({
      status: "rejected",
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });

  it("keeps interleaved global order when source page counts are uneven", async () => {
    const finItems: UnifiedProductView[] = [];
    const kdbItems: UnifiedProductView[] = [];
    const expectedIds: string[] = [];
    const newestAt = new Date("2026-09-03T00:00:00.000Z").getTime();
    for (let index = 0; index < 160; index += 1) {
      const sourceId = index % 16 === 0 ? "finlife" as const : "datago_kdb" as const;
      const sourceItems = sourceId === "finlife" ? finItems : kdbItems;
      const id = `${sourceId === "finlife" ? "UF" : "UK"}-${String(sourceItems.length + 1).padStart(3, "0")}`;
      sourceItems.push(withRecentSortAt(product({
        stableId: id,
        sourceId,
        externalKey: id,
        providerName: sourceId === "finlife" ? "소형은행" : "대형은행",
        productName: `교차 상품 ${id}`,
      }), new Date(newestAt - index * 60_000).toISOString()));
      expectedIds.push(id);
    }
    expect(finItems).toHaveLength(10);
    expect(kdbItems).toHaveLength(150);

    const finlife = createPaginatedLoader({ sourceId: "finlife", items: finItems });
    const kdb = createPaginatedLoader({ sourceId: "datago_kdb", items: kdbItems });
    const pages = await collectCatalogPages({
      query: baseInput({ limit: 60 }),
      loaders: { finlife, datago_kdb: kdb },
    });
    const allIds = pages.flatMap((page) => page.items.map((item) => item.stableId));

    expect(allIds).toEqual(expectedIds);
    expect(new Set(allIds)).toHaveProperty("size", 160);
    expect(pages.map((page) => page.items.length)).toEqual([60, 60, 40]);
    expect(pages.map((page) => page.pageInfo.hasMore)).toEqual([true, true, false]);
    expect(vi.mocked(finlife.query).mock.calls.map(([call]) => call.cursor)).toEqual([null]);
    expect(vi.mocked(kdb.query).mock.calls.map(([call]) => call.cursor)).toEqual([
      null,
      "datago_kdb:60",
      "datago_kdb:120",
    ]);
  });

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

  it("reuses the same filtered snapshot for an identical signature within its TTL", async () => {
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        product({
          stableId: "REUSE-1",
          sourceId: "finlife",
          externalKey: "REUSE-1",
          providerName: "재사용은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
        product({
          stableId: "REUSE-2",
          sourceId: "finlife",
          externalKey: "REUSE-2",
          providerName: "재사용은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const input = baseInput({
      includeSources: ["finlife"],
      provider: "재사용은행",
      limit: 1,
    });

    const first = await getUnifiedProductsWithLoaders(input, { finlife });
    const repeated = await getUnifiedProductsWithLoaders(input, { finlife });

    expect(first.items.map((item) => item.stableId)).toEqual(["REUSE-1"]);
    expect(repeated.items.map((item) => item.stableId)).toEqual(["REUSE-1"]);
    expect(repeated.pageInfo.nextCursor).toBe(first.pageInfo.nextCursor);
    expect(finlife.query).toHaveBeenCalledTimes(1);
  });

  it("pins the first-page provenance to every page of the same snapshot", async () => {
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        product({
          stableId: "PIN-1",
          sourceId: "finlife",
          externalKey: "PIN-1",
          providerName: "고정은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
        product({
          stableId: "PIN-2",
          sourceId: "finlife",
          externalKey: "PIN-2",
          providerName: "고정은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const pinned: UnifiedSnapshotProvenance = {
      policy: "pinned_snapshot",
      capturedAt: "2026-09-01T00:00:00.000Z",
      versionFingerprint: "version-a",
      freshness: {
        checkedAt: "2026-09-01T00:00:00.000Z",
        overall: "fresh",
        sources: [],
      },
    };
    const captureCatalogProvenance = vi.fn(async () => pinned);
    const input = baseInput({
      includeSources: ["finlife"],
      provider: "고정은행",
      limit: 1,
    });

    const first = await getUnifiedProductsWithLoaders(input, { finlife }, { captureCatalogProvenance });
    const second = await getUnifiedProductsWithLoaders({
      ...input,
      cursor: first.pageInfo.nextCursor,
    }, { finlife }, { captureCatalogProvenance });

    expect(first.provenance).toEqual(pinned);
    expect(second.provenance).toEqual(pinned);
    expect(captureCatalogProvenance).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered, cross-signature, and evicted catalog cursors explicitly", async () => {
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        product({
          stableId: "CURSOR-1",
          sourceId: "finlife",
          externalKey: "CURSOR-1",
          providerName: "커서은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
        product({
          stableId: "CURSOR-2",
          sourceId: "finlife",
          externalKey: "CURSOR-2",
          providerName: "커서은행",
          options: [{ sourceId: "finlife", termMonths: 12, intrRate: 3, intrRate2: 4 }],
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const input = baseInput({
      includeSources: ["finlife"],
      provider: "커서은행",
      limit: 1,
    });
    const first = await getUnifiedProductsWithLoaders(input, { finlife });
    const cursor = first.pageInfo.nextCursor;
    if (!cursor) throw new Error("expected catalog cursor");
    const [payload, mac] = cursor.split(".");
    const tampered = `${payload}.${mac.startsWith("a") ? "b" : "a"}${mac.slice(1)}`;

    await expect(getUnifiedProductsWithLoaders({ ...input, cursor: tampered }, { finlife }))
      .rejects.toMatchObject({ code: "CURSOR_INVALID" });
    await expect(getUnifiedProductsWithLoaders({
      ...input,
      provider: "다른은행",
      cursor,
    }, { finlife })).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });

    resetUnifiedCatalogSnapshotStoreForTests();
    await expect(getUnifiedProductsWithLoaders({ ...input, cursor }, { finlife }))
      .rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
  });

  it("returns an explicit partial first page without a cursor when one snapshot exceeds the row budget", async () => {
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        product({
          stableId: "LIMIT-1",
          sourceId: "finlife",
          externalKey: "LIMIT-1",
          providerName: "한도은행",
        }),
        product({
          stableId: "LIMIT-2",
          sourceId: "finlife",
          externalKey: "LIMIT-2",
          providerName: "한도은행",
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const boundedStore = new BoundedCatalogSnapshotStore<UnifiedCatalogSnapshot>({
      ttlMs: 1_000,
      sweepIntervalMs: 100,
      maxSnapshots: 4,
      maxRetainedRows: 1,
      maxEstimatedBytes: 100_000,
    });

    try {
      const result = await getUnifiedProductsWithLoaders(baseInput({
        includeSources: ["finlife"],
        provider: "한도은행",
        limit: 1,
      }), { finlife }, { catalogSnapshotStore: boundedStore });

      expect(result.items.map((item) => item.stableId)).toEqual(["LIMIT-1"]);
      expect(result.pageInfo).toEqual(expect.objectContaining({
        hasMore: false,
        nextCursor: null,
        partial: true,
      }));
      expect(result.pageInfo.partialReasons).toContainEqual(expect.objectContaining({
        code: "CURSOR_UNAVAILABLE_RESOURCE_LIMIT",
        resource: expect.objectContaining({ retainedRows: 2 }),
      }));
      expect(boundedStore.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        retainedRows: 0,
      }));
    } finally {
      boundedStore.dispose();
    }
  });

  it("reports a TTL-expired snapshot cursor explicitly", async () => {
    let now = 0;
    const finlife = createLoader("finlife", {
      count: 2,
      items: [
        product({
          stableId: "TTL-1",
          sourceId: "finlife",
          externalKey: "TTL-1",
          providerName: "만료은행",
        }),
        product({
          stableId: "TTL-2",
          sourceId: "finlife",
          externalKey: "TTL-2",
          providerName: "만료은행",
        }),
      ],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200, sourceId: "finlife" },
    });
    const expiringStore = new BoundedCatalogSnapshotStore<UnifiedCatalogSnapshot>({
      ttlMs: 100,
      sweepIntervalMs: 100,
      maxSnapshots: 4,
      maxRetainedRows: 100,
      maxEstimatedBytes: 100_000,
      now: () => now,
    });
    const input = baseInput({
      includeSources: ["finlife"],
      provider: "만료은행",
      limit: 1,
    });

    try {
      const first = await getUnifiedProductsWithLoaders(input, { finlife }, {
        catalogSnapshotStore: expiringStore,
      });
      expect(first.pageInfo.nextCursor).toBeTruthy();

      now = 101;
      await expect(getUnifiedProductsWithLoaders({
        ...input,
        cursor: first.pageInfo.nextCursor,
      }, { finlife }, { catalogSnapshotStore: expiringStore }))
        .rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
    } finally {
      expiringStore.dispose();
    }
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
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedCursorCount: 0,
    }));
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
