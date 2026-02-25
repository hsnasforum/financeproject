import { afterEach, describe, expect, it, vi } from "vitest";
import { odcloudFetchWithAuth } from "../src/lib/publicApis/odcloud";

describe("odcloud auth fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tries query serviceKey first and falls back to Authorization header on auth error", async () => {
    const calls: Array<{ url: string; auth?: string | null }> = [];
    const mock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        calls.push({ url: String(input), auth: headers.get("authorization") });
        return new Response(JSON.stringify({ code: "AUTH_ERROR" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        calls.push({ url: String(input), auth: headers.get("authorization") });
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
    vi.stubGlobal("fetch", mock);

    const url = new URL("https://api.odcloud.kr/api/gov24/v3/serviceList?page=1");
    const result = await odcloudFetchWithAuth(url, "abc+def=");
    expect(result.authMode).toBe("header-fallback");
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain("serviceKey=abc%2Bdef%3D");
    expect(calls[0].auth).toBeNull();
    expect(calls[1].url).not.toContain("serviceKey=");
    expect(calls[1].auth).toBeTruthy();
  });
});
