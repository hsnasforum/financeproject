import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError } from "../src/lib/http/fetchExternal";
import { fetchLiveFinlifeCompany, fetchLiveFinlifeDetailed } from "../src/lib/finlife/fetchLive";

const params = {
  pageNo: 1,
  topFinGrpNo: "020000",
  scan: "page" as const,
  scanMaxPages: "auto" as const,
};

describe("FINLIFE live fetch timeout metadata", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.FINLIFE_API_KEY;
    delete process.env.FINLIFE_BASE_URL;
  });

  it("preserves HTTP status and Retry-After even when the error body is malformed", async () => {
    process.env.FINLIFE_API_KEY = "test-key";
    process.env.FINLIFE_BASE_URL = "https://example.test/finlifeapi";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "17",
      },
    })));

    const error = await fetchLiveFinlifeDetailed("deposit", params)
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 17, timeout: false });
  });

  it("rejects a successful non-JSON response instead of treating it as product data", async () => {
    process.env.FINLIFE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("service unavailable", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })));

    const error = await fetchLiveFinlifeDetailed("deposit", params)
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ status: 200, timeout: false });
  });

  it("uses an abortable total deadline for product fetches", async () => {
    vi.useFakeTimers();
    process.env.FINLIFE_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.signal) throw new Error("missing AbortSignal");
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchLiveFinlifeDetailed("deposit", params)
      .then(() => null, (caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ timeout: true });
  });

  it("uses the same abortable total deadline for company fetches", async () => {
    vi.useFakeTimers();
    process.env.FINLIFE_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.signal) throw new Error("missing AbortSignal");
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchLiveFinlifeCompany(params)
      .then(() => null, (caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ timeout: true });
  });
});
