import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError, fetchExternal } from "../src/lib/http/fetchExternal";

describe("fetchExternal timeout/retry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries 429 and succeeds on next attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: true }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "0",
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternal("https://example.com/test", {
      retries: 1,
      timeoutMs: 50,
      sourceKey: "test",
    });

    expect(result.status).toBe(200);
    expect(result.kind).toBe("json");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails with timeout metadata when request aborts", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const error = await fetchExternal("https://example.com/slow", {
      retries: 0,
      timeoutMs: 10,
      sourceKey: "test-timeout",
    }).then(() => null).catch((caught) => caught);

    expect(error).toBeInstanceOf(ExternalApiError);
    const typed = error as ExternalApiError;
    expect(typed.detail.code).toBe("UPSTREAM");
    expect(typed.timeout).toBe(true);
  });

  it("preserves status and Retry-After when an error response has malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "13",
      },
    })));

    const returned = await fetchExternal("https://example.com/rate-limited", {
      retries: 0,
      sourceKey: "malformed-rate-limit",
      throwOnHttpError: false,
    });
    expect(returned).toMatchObject({
      body: "{not-json",
      kind: "text",
      ok: false,
      retryAfterSeconds: 13,
      status: 429,
    });

    const error = await fetchExternal("https://example.com/rate-limited", {
      retries: 0,
      sourceKey: "malformed-rate-limit",
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      retryAfterSeconds: 13,
      status: 429,
    });
  });

  it("does not add retries when the caller handles non-2xx responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternal("https://example.com/caller-owned-error", {
      retries: 1,
      retryOn: () => true,
      throwOnHttpError: false,
    });

    expect(result.status).toBe(503);
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a non-2xx response body before retrying", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(body, {
        status: 429,
        headers: { "retry-after": "0" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternal("https://example.com/release-before-retry", {
      retries: 1,
      timeoutMs: 1_000,
    })).resolves.toMatchObject({ status: 200, attempts: 2 });

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
