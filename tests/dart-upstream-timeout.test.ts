import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getDartCompanyRoute } from "../src/app/api/public/dart/company/route";
import { GET as getDartSearchRoute } from "../src/app/api/public/dart/search/route";
import { GET as getDisclosureCompanyRoute } from "../src/app/api/public/disclosure/company/route";
import { getDartCompany } from "../src/lib/publicApis/dart/company";
import { DartError, fetchDartJson } from "../src/lib/publicApis/dart/fetch";
import { toPublicDartError } from "../src/lib/publicApis/dart/opendartErrors";

describe("OpenDART upstream timeout metadata", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.OPENDART_API_KEY;
    delete process.env.OPENDART_BASE_URL;
  });

  it("preserves HTTP status and Retry-After before parsing an error body", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "11",
      },
    })));

    const error = await fetchDartJson("list.json", {})
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(DartError);
    expect((error as DartError).info).toMatchObject({
      code: "RATE_LIMIT",
      upstreamStatus: 429,
      retryAfterSeconds: 11,
    });
  });

  it("keeps the company deadline active through response body parsing", async () => {
    vi.useFakeTimers();
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      const payload = JSON.stringify({
        status: "000",
        corp_code: "00126380",
        corp_name: "삼성전자",
      });
      const waitForBody = () => new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve(payload), 20_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: waitForBody,
        json: async () => JSON.parse(await waitForBody()) as unknown,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = getDartCompany("00126380");
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: "UPSTREAM", timeout: true });
  });

  it("preserves Retry-After for mapped company maintenance errors", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "800",
      message: "maintenance",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "retry-after": "12",
      },
    })));

    const result = await getDartCompany("00126380");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "MAINTENANCE",
      retryAfterSeconds: 12,
      upstreamStatus: 200,
    });
  });

  it("keeps mapped list metadata in the public DART search route", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "800",
      message: "maintenance",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "retry-after": "13",
      },
    })));

    const response = await getDartSearchRoute(new Request(
      "http://localhost/api/public/dart/search?corp_code=00126380",
    ));
    const body = await response.json() as {
      error?: { code?: string; upstreamStatus?: number; retryAfterSeconds?: number };
    };

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "MAINTENANCE",
      upstreamStatus: 200,
      retryAfterSeconds: 13,
    });
  });

  it("keeps mapped company metadata across both public aliases without internal fields", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "800",
      message: "maintenance",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "retry-after": "14",
      },
    })));

    for (const route of [getDartCompanyRoute, getDisclosureCompanyRoute]) {
      const response = await route(new Request(
        "http://localhost/api/public/dart/company?corpCode=00126380",
      ));
      const body = await response.json() as {
        error?: Record<string, unknown>;
      };

      expect(response.status).toBe(503);
      expect(body.error).toMatchObject({
        code: "MAINTENANCE",
        retryAfterSeconds: 14,
        upstreamStatus: 200,
      });
      expect(Object.keys(body.error ?? {}).sort()).toEqual([
        "code",
        "message",
        "retryAfterSeconds",
        "upstreamStatus",
      ]);
    }
  });

  it("keeps upstream metadata in the public DART company alias", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "15" },
    })));

    const response = await getDartCompanyRoute(new Request(
      "http://localhost/api/public/dart/company?corpCode=00126380",
    ));
    const body = await response.json() as {
      error?: Record<string, unknown>;
    };

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({
      aborted: false,
      code: "RATE_LIMIT",
      retryAfterSeconds: 15,
      timeout: false,
      upstreamStatus: 429,
    });
    expect(Object.keys(body.error ?? {}).sort()).toEqual([
      "aborted",
      "code",
      "message",
      "retryAfterSeconds",
      "timeout",
      "upstreamStatus",
    ]);
  });

  it("forwards caller cancellation through every public OpenDART route", async () => {
    process.env.OPENDART_API_KEY = "test-key";
    process.env.OPENDART_BASE_URL = "https://example.test";

    const routeCases = [
      {
        route: getDartCompanyRoute,
        url: "http://localhost/api/public/dart/company?corpCode=00126380",
      },
      {
        route: getDisclosureCompanyRoute,
        url: "http://localhost/api/public/disclosure/company?corpCode=00126380",
      },
      {
        route: getDartSearchRoute,
        url: "http://localhost/api/public/dart/search?corp_code=00126380",
      },
    ];

    for (const { route, url } of routeCases) {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        init?.signal?.addEventListener("abort", onAbort, { once: true });
        if (init?.signal?.aborted) onAbort();
      }));
      vi.stubGlobal("fetch", fetchMock);

      const controller = new AbortController();
      const pending = route(new Request(url, { signal: controller.signal }));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      controller.abort(new Error("caller disconnected"));

      const response = await pending;
      const body = await response.json() as { error?: Record<string, unknown> };
      expect(response.status).toBe(502);
      expect(body.error).toMatchObject({
        aborted: true,
        code: "UPSTREAM",
        timeout: false,
      });
    }
  });

  it("removes internal debug fields from public DART errors", () => {
    expect(toPublicDartError({
      code: "UPSTREAM",
      message: "upstream failed",
      debug: { requestId: "internal-only" },
      upstreamStatus: 502,
    })).toEqual({
      code: "UPSTREAM",
      message: "upstream failed",
      upstreamStatus: 502,
    });
  });
});
