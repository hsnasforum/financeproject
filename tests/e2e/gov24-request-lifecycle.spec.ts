import { expect, test } from "./helpers/e2eTest";
import type { Page } from "@playwright/test";

const readyStatus = {
  ok: true,
  data: { items: [] },
  meta: {
    snapshot: {
      totalItems: 1,
      completionRate: 1,
      generatedAt: "2026-09-01T00:00:00.000Z",
      uniqueCount: 1,
      isStale: false,
    },
    sync: { state: "ready" },
    fallback: { mode: "CACHE", reason: "snapshot_read" },
  },
};

function gov24Status(state: "ready" | "syncing" | "needs_sync", totalItems = 1) {
  return {
    ...readyStatus,
    meta: {
      ...readyStatus.meta,
      snapshot: {
        ...readyStatus.meta.snapshot,
        totalItems,
        uniqueCount: totalItems,
      },
      sync: { state },
    },
  };
}

async function installControlledGov24Interval(page: Page) {
  await page.addInitScript(() => {
    const lifecycleWindow = window as typeof window & {
      __gov24RunIntervals?: () => void;
      __gov24IntervalCount?: () => number;
      __gov24SetVisibility?: (state: DocumentVisibilityState) => void;
    };
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const callbacks = new Map<number, () => void>();
    let nextId = 1_000_000;
    let visibilityState: DocumentVisibilityState = "visible";

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout !== 10_000) return nativeSetInterval(handler, timeout, ...args);
      const id = nextId;
      nextId += 1;
      callbacks.set(id, () => {
        if (typeof handler === "function") handler(...args);
      });
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (typeof id === "number" && callbacks.delete(id)) return;
      nativeClearInterval(id);
    }) as typeof window.clearInterval;
    lifecycleWindow.__gov24RunIntervals = () => {
      for (const callback of [...callbacks.values()]) callback();
    };
    lifecycleWindow.__gov24IntervalCount = () => callbacks.size;
    lifecycleWindow.__gov24SetVisibility = (state) => {
      visibilityState = state;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
}

async function runGov24Intervals(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & { __gov24RunIntervals: () => void }).__gov24RunIntervals();
  });
}

async function gov24IntervalCount(page: Page): Promise<number> {
  return page.evaluate(() => (
    window as typeof window & { __gov24IntervalCount: () => number }
  ).__gov24IntervalCount());
}

async function completeGov24Form(page: Page) {
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.getByRole("button", { name: "서울특별시" }).click();
  await page.getByRole("button", { name: "종로구" }).click();
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.getByPlaceholder("19900101").fill("19900101");
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.getByRole("button", { name: "다음 단계" }).click();
  await page.getByRole("button", { name: "다음 단계" }).click();
}

test("Gov24 runs the initial simple-find request only once", async ({ page }) => {
  let searchRequests = 0;
  let statusRequests = 0;
  await page.route(/\/api\/gov24\/search(?:\?|$)/, async (route) => {
    statusRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(readyStatus) });
  });
  await page.route(/\/api\/gov24\/simple-find(?:\?|$)/, async (route) => {
    searchRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          items: [],
          totalMatched: 0,
          page: { nextCursor: null },
          facets: { orgTypeCounts: {} },
        },
      }),
    });
  });

  await page.goto("/gov24");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => statusRequests).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("저장 캐시 자료")).toBeVisible();
  await expect(page.getByText(/정부 원문의 최신 지원 조건/)).toBeVisible();
  await completeGov24Form(page);
  await page.getByRole("button", { name: "지금 기준으로 보기" }).click();
  await expect(page.getByText("검색된 혜택이 없습니다")).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));

  expect(searchRequests).toBe(1);
});

test("Gov24 polls while syncing and stops immediately after the snapshot is ready", async ({ page }) => {
  await installControlledGov24Interval(page);
  let statusRequests = 0;
  await page.route(/\/api\/gov24\/search(?:\?|$)/, async (route) => {
    statusRequests += 1;
    const payload = statusRequests >= 3 ? gov24Status("ready", 3) : gov24Status("syncing", statusRequests);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/gov24");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => statusRequests).toBe(1);
  await expect(page.getByText("기준 데이터 갱신 중", { exact: true })).toBeVisible();
  await expect.poll(() => gov24IntervalCount(page)).toBe(1);

  await runGov24Intervals(page);
  await expect.poll(() => statusRequests).toBe(2);
  await expect(page.getByText("기준 데이터 갱신 중", { exact: true })).toBeVisible();

  await runGov24Intervals(page);
  await expect.poll(() => statusRequests).toBe(3);
  await expect(page.getByText("기준 데이터 확인됨", { exact: true })).toBeVisible();
  await expect.poll(() => gov24IntervalCount(page)).toBe(0);

  await runGov24Intervals(page);
  expect(statusRequests).toBe(3);
});

test("Gov24 cancels a status request while hidden and resumes with one interval when visible", async ({ page }) => {
  await installControlledGov24Interval(page);
  await page.addInitScript(() => {
    const mockWindow = window as typeof window & {
      __gov24StatusCounts?: () => { requests: number; aborts: number };
      __gov24HoldStatus?: (hold: boolean) => void;
      __gov24SetStatusState?: (state: "ready" | "syncing") => void;
    };
    const nativeFetch = window.fetch.bind(window);
    let requests = 0;
    let aborts = 0;
    let holdStatus = false;
    let statusState: "ready" | "syncing" = "syncing";
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (new URL(rawUrl, window.location.origin).pathname !== "/api/gov24/search") {
        return nativeFetch(input, init);
      }
      requests += 1;
      if (holdStatus) {
        return new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () => {
            aborts += 1;
            reject(new DOMException("The operation was aborted.", "AbortError"));
          };
          if (init?.signal?.aborted) rejectAbort();
          else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: { items: [] },
        meta: {
          snapshot: {
            totalItems: requests,
            completionRate: 1,
            generatedAt: "2026-09-01T00:00:00.000Z",
            uniqueCount: requests,
            isStale: false,
          },
          sync: { state: statusState },
          fallback: { mode: "CACHE", reason: "snapshot_read" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof window.fetch;
    mockWindow.__gov24StatusCounts = () => ({ requests, aborts });
    mockWindow.__gov24HoldStatus = (hold) => { holdStatus = hold; };
    mockWindow.__gov24SetStatusState = (state) => { statusState = state; };
  });

  const counts = () => page.evaluate(() => (
    window as typeof window & { __gov24StatusCounts: () => { requests: number; aborts: number } }
  ).__gov24StatusCounts());

  await page.goto("/gov24");
  await expect.poll(async () => (await counts()).requests).toBe(1);
  await expect.poll(() => gov24IntervalCount(page)).toBe(1);

  await page.evaluate(() => (
    window as typeof window & { __gov24HoldStatus: (hold: boolean) => void }
  ).__gov24HoldStatus(true));
  await runGov24Intervals(page);
  await expect.poll(async () => (await counts()).requests).toBe(2);

  await page.evaluate(() => (
    window as typeof window & { __gov24SetVisibility: (state: DocumentVisibilityState) => void }
  ).__gov24SetVisibility("hidden"));
  await expect.poll(async () => (await counts()).aborts).toBe(1);
  await expect.poll(() => gov24IntervalCount(page)).toBe(0);
  await runGov24Intervals(page);
  expect((await counts()).requests).toBe(2);

  await page.evaluate(() => {
    const mockWindow = window as typeof window & {
      __gov24HoldStatus: (hold: boolean) => void;
      __gov24SetVisibility: (state: DocumentVisibilityState) => void;
    };
    mockWindow.__gov24HoldStatus(false);
    mockWindow.__gov24SetVisibility("visible");
  });
  await expect.poll(async () => (await counts()).requests).toBe(3);
  await expect.poll(() => gov24IntervalCount(page)).toBe(1);

  await page.evaluate(() => (
    window as typeof window & { __gov24SetStatusState: (state: "ready" | "syncing") => void }
  ).__gov24SetStatusState("ready"));
  await runGov24Intervals(page);
  await expect.poll(async () => (await counts()).requests).toBe(4);
  await expect(page.getByText("기준 데이터 확인됨", { exact: true })).toBeVisible();
  await expect.poll(() => gov24IntervalCount(page)).toBe(0);
});

test("Gov24 aborts active status and simple-find requests when the page unmounts", async ({ page }) => {
  await page.addInitScript(() => {
    const mockWindow = window as typeof window & {
      __gov24UnmountCounts?: () => { status: number; search: number; statusAborts: number; searchAborts: number };
    };
    const nativeFetch = window.fetch.bind(window);
    let status = 0;
    let search = 0;
    let statusAborts = 0;
    let searchAborts = 0;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      const pathname = new URL(rawUrl, window.location.origin).pathname;
      if (pathname !== "/api/gov24/search" && pathname !== "/api/gov24/simple-find") {
        return nativeFetch(input, init);
      }
      if (pathname === "/api/gov24/search") status += 1;
      else search += 1;
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => {
          if (pathname === "/api/gov24/search") statusAborts += 1;
          else searchAborts += 1;
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    }) as typeof window.fetch;
    mockWindow.__gov24UnmountCounts = () => ({ status, search, statusAborts, searchAborts });
  });
  const counts = () => page.evaluate(() => (
    window as typeof window & {
      __gov24UnmountCounts: () => { status: number; search: number; statusAborts: number; searchAborts: number };
    }
  ).__gov24UnmountCounts());

  await page.goto("/gov24");
  await expect.poll(async () => (await counts()).status).toBe(1);
  await completeGov24Form(page);
  await page.getByRole("button", { name: "지금 기준으로 보기" }).click();
  await expect.poll(async () => (await counts()).search).toBe(1);

  await page.getByRole("link", { name: "MMD 홈" }).first().click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect.poll(async () => (await counts()).statusAborts).toBe(1);
  await expect.poll(async () => (await counts()).searchAborts).toBe(1);
  await expect(page.getByRole("heading", { name: "보조금24" })).toHaveCount(0);
});

test("Gov24 ignores stale status and search responses that resolve after newer requests", async ({ page }) => {
  await installControlledGov24Interval(page);
  await page.addInitScript(() => {
    type Resolver = (response: Response) => void;
    const mockWindow = window as typeof window & {
      __gov24DeferredCounts?: () => { status: number; search: number };
      __resolveGov24Status?: (requestNumber: number, state: "ready" | "syncing", total: number) => void;
      __resolveGov24Search?: (requestNumber: number, title: string) => void;
    };
    const nativeFetch = window.fetch.bind(window);
    const statusResolvers = new Map<number, Resolver>();
    const searchResolvers = new Map<number, Resolver>();
    let status = 0;
    let search = 0;
    const statusResponse = (state: "ready" | "syncing", total: number) => new Response(JSON.stringify({
      ok: true,
      data: { items: [] },
      meta: {
        snapshot: {
          totalItems: total,
          completionRate: 1,
          generatedAt: "2026-09-01T00:00:00.000Z",
          uniqueCount: total,
          isStale: false,
        },
        sync: { state },
        fallback: { mode: "CACHE", reason: "snapshot_read" },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
    const searchResponse = (title?: string) => new Response(JSON.stringify({
      ok: true,
      data: {
        items: title ? [{ id: title, title, summary: `${title} 설명`, orgType: "central" }] : [],
        totalMatched: title ? 1 : 0,
        page: { nextCursor: null },
        facets: { orgTypeCounts: title ? { all: 1, central: 1 } : {} },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      const pathname = new URL(rawUrl, window.location.origin).pathname;
      if (pathname === "/api/gov24/search") {
        status += 1;
        if (status === 1) return statusResponse("syncing", 1);
        return new Promise<Response>((resolve) => statusResolvers.set(status, resolve));
      }
      if (pathname === "/api/gov24/simple-find") {
        search += 1;
        if (search === 1) return searchResponse();
        return new Promise<Response>((resolve) => searchResolvers.set(search, resolve));
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
    mockWindow.__gov24DeferredCounts = () => ({ status, search });
    mockWindow.__resolveGov24Status = (requestNumber, state, total) => {
      statusResolvers.get(requestNumber)?.(statusResponse(state, total));
      statusResolvers.delete(requestNumber);
    };
    mockWindow.__resolveGov24Search = (requestNumber, title) => {
      searchResolvers.get(requestNumber)?.(searchResponse(title));
      searchResolvers.delete(requestNumber);
    };
  });
  const counts = () => page.evaluate(() => (
    window as typeof window & { __gov24DeferredCounts: () => { status: number; search: number } }
  ).__gov24DeferredCounts());
  const settleFrame = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await page.goto("/gov24");
  await expect.poll(async () => (await counts()).status).toBe(1);
  await expect(page.getByText("기준 데이터 갱신 중", { exact: true })).toBeVisible();
  await expect.poll(() => gov24IntervalCount(page)).toBe(1);

  await runGov24Intervals(page);
  await expect.poll(async () => (await counts()).status).toBe(2);
  await runGov24Intervals(page);
  await expect.poll(async () => (await counts()).status).toBe(3);
  await page.evaluate(() => (
    window as typeof window & {
      __resolveGov24Status: (requestNumber: number, state: "ready" | "syncing", total: number) => void;
    }
  ).__resolveGov24Status(3, "ready", 333));
  await expect(page.getByText("기준 데이터 확인됨", { exact: true })).toBeVisible();
  await expect(page.getByText("333건", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => (
    window as typeof window & {
      __resolveGov24Status: (requestNumber: number, state: "ready" | "syncing", total: number) => void;
    }
  ).__resolveGov24Status(2, "syncing", 222));
  await settleFrame();
  await expect(page.getByText("기준 데이터 확인됨", { exact: true })).toBeVisible();
  await expect(page.getByText("333건", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("222건", { exact: true })).toHaveCount(0);
  await expect.poll(() => gov24IntervalCount(page)).toBe(0);

  await completeGov24Form(page);
  await page.getByRole("button", { name: "지금 기준으로 보기" }).click();
  await expect(page.getByText("검색된 혜택이 없습니다")).toBeVisible();
  expect((await counts()).search).toBe(1);

  await page.getByRole("button", { name: "지금 기준으로 다시 찾기" }).click();
  await expect.poll(async () => (await counts()).search).toBe(2);
  await page.locator("select").last().selectOption("central");
  await expect.poll(async () => (await counts()).search).toBe(3);
  await page.evaluate(() => (
    window as typeof window & { __resolveGov24Search: (requestNumber: number, title: string) => void }
  ).__resolveGov24Search(3, "최신 혜택"));
  await expect(page.getByText("최신 혜택", { exact: true })).toBeVisible();

  await page.evaluate(() => (
    window as typeof window & { __resolveGov24Search: (requestNumber: number, title: string) => void }
  ).__resolveGov24Search(2, "오래된 혜택"));
  await settleFrame();
  await expect(page.getByText("최신 혜택", { exact: true })).toBeVisible();
  await expect(page.getByText("오래된 혜택", { exact: true })).toHaveCount(0);
});
