import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJsonWithDiag } from "../scripts/finlife_cli_common.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FINLIFE CLI diagnostic fetch", () => {
  it("retries transient fetch failures before returning a successful diagnostic", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout(1000ms)"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { err_cd: "000", baseList: [{}] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const diag = await fetchJsonWithDiag("https://example.test/finlife", {
      timeoutMs: 1_000,
      retries: 1,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(diag).not.toBeNull();
    if (!diag) throw new Error("diagnostic result missing");
    expect(diag.status).toBe(200);
    expect(diag.errCd).toBe("000");
    expect(diag.attempts).toBe(2);
  });

  it("does not retry FINLIFE business errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ result: { err_cd: "101", err_msg: "invalid group" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const diag = await fetchJsonWithDiag("https://example.test/finlife", {
      timeoutMs: 1_000,
      retries: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(diag).not.toBeNull();
    if (!diag) throw new Error("diagnostic result missing");
    expect(diag.status).toBe(200);
    expect(diag.errCd).toBe("101");
    expect(diag.attempts).toBe(1);
  });
});
