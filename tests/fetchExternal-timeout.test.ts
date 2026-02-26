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
});
