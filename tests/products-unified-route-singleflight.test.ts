import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  finlifeRefresh: vi.fn(),
  finlifeQuery: vi.fn(),
  finlifeProviders: vi.fn(),
  kdbRefresh: vi.fn(),
  kdbQuery: vi.fn(),
  kdbProviders: vi.fn(),
  getProductFreshnessSummary: vi.fn(),
}));

vi.mock("@/lib/sources/unifiedLoaders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/sources/unifiedLoaders")>();
  return {
    ...actual,
    DEFAULT_UNIFIED_SOURCE_LOADERS: {
      finlife: {
        sourceId: "finlife",
        refreshIfNeeded: mocked.finlifeRefresh,
        query: mocked.finlifeQuery,
        listProviderNames: mocked.finlifeProviders,
      },
      datago_kdb: {
        sourceId: "datago_kdb",
        refreshIfNeeded: mocked.kdbRefresh,
        query: mocked.kdbQuery,
        listProviderNames: mocked.kdbProviders,
      },
    },
  };
});

vi.mock("@/lib/sources/productFreshness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/sources/productFreshness")>();
  return {
    ...actual,
    getProductFreshnessSummary: mocked.getProductFreshnessSummary,
  };
});

import { GET } from "../src/app/api/products/unified/route";
import {
  getUnifiedCatalogSnapshotStoreStats,
  resetUnifiedCatalogSnapshotStoreForTests,
} from "../src/lib/sources/unified";
import type { SourceQuery, UnifiedSourcePage } from "../src/lib/sources/unifiedLoaders";
import type { UnifiedProductView } from "../src/lib/sources/unifiedTypes";

type RoutePayload = {
  ok?: boolean;
  data?: {
    items?: UnifiedProductView[];
    pageInfo?: {
      hasMore?: boolean;
      nextCursor?: string | null;
    };
    provenance?: {
      versionFingerprint?: string;
    };
  };
  error?: {
    code?: string;
  };
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function product(sourceId: "finlife" | "datago_kdb", stableId: string): UnifiedProductView {
  return {
    stableId,
    sourceId,
    kind: "deposit",
    externalKey: stableId,
    providerName: sourceId === "finlife" ? "가은행" : "나은행",
    productName: `상품 ${stableId}`,
  };
}

function page(input: {
  sourceId: "finlife" | "datago_kdb";
  item: UnifiedProductView;
  query: SourceQuery;
  hasMore: boolean;
  nextCursor: string | null;
}): UnifiedSourcePage {
  return {
    sourceId: input.sourceId,
    count: 1,
    items: [input.item],
    pageInfo: {
      hasMore: input.hasMore,
      nextCursor: input.nextCursor,
      limit: input.query.limit,
      sourceId: input.sourceId,
    },
  };
}

async function callRoute(request: Request): Promise<{ status: number; json: RoutePayload }> {
  const response = await GET(request);
  return {
    status: response.status,
    json: (await response.json()) as RoutePayload,
  };
}

function configurePaginatedSources() {
  const firstFinlifePageStarted = deferred<AbortSignal>();
  const releaseFirstFinlifePage = deferred<void>();
  mocked.finlifeQuery.mockImplementation(async (query: SourceQuery) => {
    if (!query.signal) throw new Error("expected shared build signal");
    if (query.cursor === null) {
      firstFinlifePageStarted.resolve(query.signal);
      await releaseFirstFinlifePage.promise;
      return page({
        sourceId: "finlife",
        item: product("finlife", "F-1"),
        query,
        hasMore: true,
        nextCursor: "finlife:1",
      });
    }
    return page({
      sourceId: "finlife",
      item: product("finlife", "F-2"),
      query,
      hasMore: false,
      nextCursor: null,
    });
  });
  mocked.kdbQuery.mockImplementation(async (query: SourceQuery) => query.cursor === null
    ? page({
        sourceId: "datago_kdb",
        item: product("datago_kdb", "K-1"),
        query,
        hasMore: true,
        nextCursor: "datago_kdb:1",
      })
    : page({
        sourceId: "datago_kdb",
        item: product("datago_kdb", "K-2"),
        query,
        hasMore: false,
        nextCursor: null,
      }));
  return { firstFinlifePageStarted, releaseFirstFinlifePage };
}

const firstPageUrl = "http://localhost/api/products/unified?mode=merged&kind=deposit&includeSources=finlife,datago_kdb&limit=2";

describe("GET /api/products/unified catalog snapshot singleflight integration", () => {
  beforeEach(() => {
    resetUnifiedCatalogSnapshotStoreForTests();
    mocked.finlifeRefresh.mockReset();
    mocked.finlifeRefresh.mockResolvedValue(undefined);
    mocked.finlifeQuery.mockReset();
    mocked.finlifeProviders.mockReset();
    mocked.finlifeProviders.mockResolvedValue(["가은행"]);
    mocked.kdbRefresh.mockReset();
    mocked.kdbRefresh.mockResolvedValue(undefined);
    mocked.kdbQuery.mockReset();
    mocked.kdbProviders.mockReset();
    mocked.kdbProviders.mockResolvedValue(["나은행"]);
    mocked.getProductFreshnessSummary.mockReset();
    mocked.getProductFreshnessSummary.mockResolvedValue({
      checkedAt: "2026-09-03T00:00:00.000Z",
      overall: "fresh",
      sources: [
        {
          sourceId: "finlife",
          kind: "deposit",
          sourceAsOf: "2026-09-03T00:00:00.000Z",
          checkedAt: "2026-09-03T00:00:00.000Z",
          ttlMs: 1_000,
          ageMs: 0,
          freshness: "fresh",
          fallbackUsed: false,
          message: "fresh",
        },
        {
          sourceId: "datago_kdb",
          kind: "deposit",
          sourceAsOf: "2026-09-03T00:00:00.000Z",
          checkedAt: "2026-09-03T00:00:00.000Z",
          ttlMs: 1_000,
          ageMs: 0,
          freshness: "fresh",
          fallbackUsed: false,
          message: "fresh",
        },
      ],
    });
  });

  afterEach(() => {
    resetUnifiedCatalogSnapshotStoreForTests();
  });

  it("coalesces concurrent HTTP first pages and serves the cursor without rebuilding", async () => {
    const { firstFinlifePageStarted, releaseFirstFinlifePage } = configurePaginatedSources();

    const first = callRoute(new Request(firstPageUrl));
    await firstFinlifePageStarted.promise;
    const second = callRoute(new Request(firstPageUrl));
    await vi.waitFor(() => expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 2,
    })));
    expect(mocked.finlifeQuery).toHaveBeenCalledTimes(1);
    releaseFirstFinlifePage.resolve();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.json.data?.items?.map((item) => item.stableId)).toEqual(["F-1", "F-2"]);
    expect(secondResponse.json.data?.items).toEqual(firstResponse.json.data?.items);
    const cursor = firstResponse.json.data?.pageInfo?.nextCursor;
    expect(cursor).toBeTruthy();
    expect(secondResponse.json.data?.pageInfo?.nextCursor).toBe(cursor);
    expect(secondResponse.json.data?.provenance?.versionFingerprint)
      .toBe(firstResponse.json.data?.provenance?.versionFingerprint);
    expect(mocked.finlifeQuery.mock.calls.map(([query]) => query.cursor)).toEqual([null, "finlife:1"]);
    expect(mocked.kdbQuery.mock.calls.map(([query]) => query.cursor)).toEqual([null, "datago_kdb:1"]);
    expect(mocked.finlifeProviders).toHaveBeenCalledTimes(1);
    expect(mocked.kdbProviders).toHaveBeenCalledTimes(1);

    const cursorResponse = await callRoute(new Request(`${firstPageUrl}&cursor=${encodeURIComponent(String(cursor))}`));
    expect(cursorResponse.status).toBe(200);
    expect(cursorResponse.json.data?.items?.map((item) => item.stableId)).toEqual(["K-1", "K-2"]);
    expect(mocked.finlifeQuery).toHaveBeenCalledTimes(2);
    expect(mocked.kdbQuery).toHaveBeenCalledTimes(2);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });

  it("returns 499 when teardown wins completed-cache delivery before getUnifiedProducts settles", async () => {
    const { firstFinlifePageStarted, releaseFirstFinlifePage } = configurePaginatedSources();
    const initial = callRoute(new Request(firstPageUrl));
    await firstFinlifePageStarted.promise;
    releaseFirstFinlifePage.resolve();

    const initialResponse = await initial;
    expect(initialResponse.status).toBe(200);
    const completedCursor = initialResponse.json.data?.pageInfo?.nextCursor;
    expect(completedCursor).toBeTruthy();
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));

    const pending = callRoute(new Request(firstPageUrl));
    queueMicrotask(() => resetUnifiedCatalogSnapshotStoreForTests());
    const response = await pending;

    expect(response.status).toBe(499);
    expect(response.json.error?.code).toBe("REQUEST_ABORTED");
    expect(initialResponse.status).toBe(200);
    expect(initialResponse.json.data?.pageInfo?.nextCursor).toBe(completedCursor);
    const expiredCursorResponse = await callRoute(new Request(
      `${firstPageUrl}&cursor=${encodeURIComponent(String(completedCursor))}`,
    ));
    expect(expiredCursorResponse.status).toBe(410);
    expect(expiredCursorResponse.json.error?.code).toBe("CURSOR_EXPIRED");
    expect(mocked.finlifeQuery).toHaveBeenCalledTimes(2);
    expect(mocked.kdbQuery).toHaveBeenCalledTimes(2);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });

  it("returns 499 only to the aborted HTTP caller while the shared build completes", async () => {
    const { firstFinlifePageStarted, releaseFirstFinlifePage } = configurePaginatedSources();
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = callRoute(new Request(firstPageUrl, { signal: firstController.signal }));
    const sharedSignal = await firstFinlifePageStarted.promise;
    const second = callRoute(new Request(firstPageUrl, { signal: secondController.signal }));
    await vi.waitFor(() => expect(getUnifiedCatalogSnapshotStoreStats().activeSubscriberCount).toBe(2));

    firstController.abort();
    expect(sharedSignal.aborted).toBe(false);
    releaseFirstFinlifePage.resolve();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.status).toBe(499);
    expect(firstResponse.json.error?.code).toBe("REQUEST_ABORTED");
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.json.data?.provenance?.versionFingerprint).toBeTruthy();
    expect(mocked.finlifeQuery).toHaveBeenCalledTimes(2);
    expect(mocked.kdbQuery).toHaveBeenCalledTimes(2);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });

  it("cancels an all-aborted HTTP build and lets an immediate retry start cleanly", async () => {
    const firstBuildStarted = deferred<AbortSignal>();
    let finlifeInvocation = 0;
    mocked.finlifeQuery.mockImplementation(async (query: SourceQuery) => {
      finlifeInvocation += 1;
      if (finlifeInvocation > 1) {
        return page({
          sourceId: "finlife",
          item: product("finlife", "RETRY-F"),
          query,
          hasMore: false,
          nextCursor: null,
        });
      }
      if (!query.signal) throw new Error("expected shared build signal");
      firstBuildStarted.resolve(query.signal);
      return new Promise<UnifiedSourcePage>((_resolve, reject) => {
        query.signal?.addEventListener("abort", () => {
          reject(new DOMException("all callers cancelled", "AbortError"));
        }, { once: true });
      });
    });
    mocked.kdbQuery.mockImplementation(async (query: SourceQuery) => page({
      sourceId: "datago_kdb",
      item: product("datago_kdb", "RETRY-K"),
      query,
      hasMore: false,
      nextCursor: null,
    }));
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = callRoute(new Request(firstPageUrl, { signal: firstController.signal }));
    const second = callRoute(new Request(firstPageUrl, { signal: secondController.signal }));
    const oldSignal = await firstBuildStarted.promise;
    await vi.waitFor(() => expect(getUnifiedCatalogSnapshotStoreStats().activeSubscriberCount).toBe(2));

    firstController.abort();
    expect(oldSignal.aborted).toBe(false);
    secondController.abort();
    expect(oldSignal.aborted).toBe(true);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    const retry = callRoute(new Request(firstPageUrl));

    const [firstResponse, secondResponse, retryResponse] = await Promise.all([first, second, retry]);
    expect(firstResponse.status).toBe(499);
    expect(secondResponse.status).toBe(499);
    expect(retryResponse.status).toBe(200);
    expect(retryResponse.json.data?.items?.map((item) => item.stableId)).toEqual(["RETRY-F", "RETRY-K"]);
    expect(mocked.finlifeQuery).toHaveBeenCalledTimes(2);
    expect(mocked.kdbQuery).toHaveBeenCalledTimes(1);
    expect(getUnifiedCatalogSnapshotStoreStats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
  });
});
