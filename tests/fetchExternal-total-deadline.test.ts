import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError, fetchExternal } from "../src/lib/http/fetchExternal";

function abortError(message = "aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

describe("fetchExternal total deadline and cancellation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects an already-aborted external signal without calling fetch", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));

    const error = await fetchExternal("https://example.com/already-cancelled", {
      retries: 1,
      signal: controller.signal,
      timeoutMs: 1_000,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ aborted: true, timeout: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry when the external signal aborts during backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const pending = fetchExternal("https://example.com/cancel-backoff", {
      retries: 1,
      signal: controller.signal,
      timeoutMs: 2_000,
    }).then((value) => value, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.abort(new Error("caller cancelled"));
    await vi.advanceTimersByTimeAsync(500);

    const outcome = await pending;
    expect(outcome).toBeInstanceOf(ExternalApiError);
    expect(outcome).toMatchObject({ aborted: true, timeout: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies one deadline across Retry-After backoff and all attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "1" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchExternal("https://example.com/total-deadline", {
      retries: 1,
      timeoutMs: 50,
    }).then((value) => value, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(1_000);
    const outcome = await pending;

    expect(outcome).toBeInstanceOf(ExternalApiError);
    expect(outcome).toMatchObject({ aborted: false, timeout: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not leak an internal control error when network retry backoff hits the deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("socket closed");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchExternal("https://example.com/network-deadline", {
      retries: 1,
      retryOn: () => true,
      timeoutMs: 50,
    }).then((value) => value, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(500);
    const outcome = await pending;

    expect(outcome).toBeInstanceOf(ExternalApiError);
    expect(outcome).toMatchObject({ aborted: false, timeout: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the deadline active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchExternal("https://example.com/slow-body", {
      retries: 0,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(25);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ aborted: false, timeout: true });
  });

  it("preserves non-2xx status and Retry-After when caller-owned body reading times out", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return {
        ok: false,
        status: 429,
        headers: new Headers({
          "content-type": "application/json",
          "retry-after": "9",
        }),
        text: () => new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchExternal("https://example.com/slow-error-body", {
      retries: 0,
      throwOnHttpError: false,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(25);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: false,
      retryAfterSeconds: 9,
      status: 429,
      timeout: true,
    });
  });

  it("prefers an external abort that arrives while releasing an error response body", async () => {
    let markCancelStarted: (() => void) | undefined;
    const cancelStarted = new Promise<void>((resolve) => {
      markCancelStarted = resolve;
    });
    const body = new ReadableStream({
      cancel: () => {
        markCancelStarted?.();
        return new Promise<void>(() => undefined);
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
      status: 503,
      headers: { "retry-after": "4" },
    })));

    const controller = new AbortController();
    const callerReason = new Error("caller cancelled");
    const pending = fetchExternal("https://example.com/cancel-release", {
      retries: 0,
      signal: controller.signal,
      timeoutMs: 1_000,
    }).then(() => null, (caught: unknown) => caught);

    await cancelStarted;
    controller.abort(callerReason);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: true,
      retryAfterSeconds: 4,
      status: 503,
      timeout: false,
    });
    expect((error as Error & { cause?: unknown }).cause).toBe(callerReason);
  });

  it("preserves a caller cause that arrives after body release but before HTTP error classification", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", {
      status: 503,
      headers: { "retry-after": "5" },
    })));
    const controller = new AbortController();
    const callerReason = new Error("late caller cancellation");
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      if (message === "[external] upstream status") controller.abort(callerReason);
    });

    const error = await fetchExternal("https://example.com/late-cancel-after-release", {
      retries: 0,
      signal: controller.signal,
      timeoutMs: 1_000,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: true,
      retryAfterSeconds: 5,
      status: 503,
      timeout: false,
    });
    expect((error as Error & { cause?: unknown }).cause).toBe(callerReason);
  });

  it("keeps the total deadline while releasing an error response body", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream({
      cancel: () => new Promise<void>(() => undefined),
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
      status: 503,
      headers: { "retry-after": "6" },
    })));

    const pending = fetchExternal("https://example.com/deadline-release", {
      retries: 0,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(25);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: false,
      retryAfterSeconds: 6,
      status: 503,
      timeout: true,
    });
  });

  it("does not let a completed body cancel hide the internal deadline", async () => {
    vi.useFakeTimers();
    let fetchSignal: AbortSignal | undefined;
    const body = new ReadableStream({
      cancel: () => new Promise<void>((resolve) => {
        fetchSignal?.addEventListener("abort", () => resolve(), { once: true });
      }),
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      return new Response(body, {
        status: 503,
        headers: { "retry-after": "7" },
      });
    }));

    const pending = fetchExternal("https://example.com/deadline-cancel-resolves", {
      retries: 0,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(25);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: false,
      retryAfterSeconds: 7,
      status: 503,
      timeout: true,
    });
  });

  it("rechecks monotonic time after body cancellation settles at the deadline", async () => {
    let nowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    const body = new ReadableStream({
      cancel: () => {
        nowMs = 25;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
      status: 503,
      headers: { "retry-after": "10" },
    })));

    const error = await fetchExternal("https://example.com/cancel-settles-at-deadline", {
      retries: 0,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: false,
      retryAfterSeconds: 10,
      status: 503,
      timeout: true,
    });
  });

  it("keeps the first timeout cause when the caller aborts later", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        setTimeout(() => reject(abortError()), 1);
      }, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const lateCallerReason = new Error("late caller abort");
    const pending = fetchExternal("https://example.com/timeout-before-caller-abort", {
      retries: 0,
      signal: controller.signal,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(25);
    controller.abort(lateCallerReason);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ aborted: false, timeout: true });
    expect((error as Error & { cause?: unknown }).cause).not.toBe(lateCallerReason);
  });

  it("preserves non-2xx metadata without retrying when body reading fails", async () => {
    const bodyError = new TypeError("socket closed while reading body");
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({
        "content-type": "application/json",
        "retry-after": "8",
      }),
      body: null,
      text: async () => {
        throw bodyError;
      },
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const retryOn = vi.fn(() => true);

    const error = await fetchExternal("https://example.com/error-body-read", {
      retries: 2,
      retryOn,
      throwOnHttpError: false,
      timeoutMs: 1_000,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      aborted: false,
      retryAfterSeconds: 8,
      status: 429,
      timeout: false,
    });
    expect((error as Error & { cause?: unknown }).cause).toBe(bodyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryOn).not.toHaveBeenCalled();
  });

  it("checks elapsed monotonic time when the timeout callback is delayed", async () => {
    let nowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: null,
      text: async () => {
        nowMs = 30;
        return JSON.stringify({ ok: true });
      },
    }) as unknown as Response));

    const error = await fetchExternal("https://example.com/delayed-timeout-callback", {
      retries: 0,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ aborted: false, status: 200, timeout: true });
  });

  it("does not let a caller abort claim an already-expired deadline", async () => {
    let nowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    })));

    const controller = new AbortController();
    const pending = fetchExternal("https://example.com/expired-before-caller-abort", {
      retries: 0,
      signal: controller.signal,
      timeoutMs: 25,
    }).then(() => null, (caught: unknown) => caught);

    nowMs = 30;
    controller.abort(new Error("caller abort after deadline"));
    const error = await pending;

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ aborted: false, timeout: true });
  });
});
