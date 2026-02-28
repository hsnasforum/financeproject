import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEcosKeyStatisticList } from "../../src/lib/planning/assumptions/fetchers/ecosClient";

describe("fetchEcosKeyStatisticList", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ECOS_API_KEY;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    process.env.ECOS_API_KEY = "test-ecos-secret-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "string") process.env.ECOS_API_KEY = originalApiKey;
    else delete process.env.ECOS_API_KEY;
  });

  it("returns rows from KeyStatisticList payload", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      KeyStatisticList: {
        row: [{
          CLASS_NAME: "금리",
          KEYSTAT_NAME: "한국은행 기준금리",
          DATA_VALUE: "2.50",
          CYCLE: "20260215",
          UNIT_NAME: "%",
        }],
      },
    }), { status: 200 }));

    const rows = await fetchEcosKeyStatisticList();
    expect(rows).toEqual([{
      CLASS_NAME: "금리",
      KEYSTAT_NAME: "한국은행 기준금리",
      DATA_VALUE: "2.50",
      CYCLE: "20260215",
      UNIT_NAME: "%",
    }]);
  });

  it("throws sanitized error without leaking API key", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      RESULT: {
        CODE: "ERROR-100",
        MESSAGE: "invalid key",
      },
    }), { status: 200 }));

    const error = await fetchEcosKeyStatisticList().catch((reason) => reason as Error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("ECOS API returned an error response.");
    expect(error.message).not.toContain("test-ecos-secret-key");
  });
});
