import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/apiCache", () => ({
  getApiCacheRecord: vi.fn(() => null),
  makeApiCacheKey: vi.fn(() => "mock-key"),
  setApiCache: vi.fn(() => ({ fetchedAt: "2026-02-25T00:00:00.000Z", expiresAt: "2026-02-26T00:00:00.000Z" })),
}));

vi.mock("@/lib/publicApis/providers/exchange", () => ({
  fetchEximExchange: vi.fn(async () => ({ ok: true, data: { asOf: "2026-02-25", rates: {} } })),
  getKstTodayYYYYMMDD: vi.fn(() => "20260225"),
}));

vi.mock("@/lib/publicApis/errorContract", async () => await import("../src/lib/publicApis/errorContract"));

vi.mock("@/lib/publicApis/benefitsSnapshot", () => ({
  getSnapshotOrNull: vi.fn(() => null),
}));

vi.mock("@/lib/publicApis/gov24SearchView", () => ({
  buildGov24SearchPayload: vi.fn(() => ({
    data: {
      items: [],
      totalMatched: 0,
      page: { cursor: 0, pageSize: 50, nextCursor: null, hasMore: false },
    },
  })),
}));

vi.mock("@/lib/publicApis/gov24SyncState", () => ({
  isGov24SyncInFlight: vi.fn(() => false),
}));

vi.mock("@/lib/gov24/orgClassifier", () => ({
  classifyOrgType: vi.fn(() => "UNKNOWN"),
}));

vi.mock("@/lib/gov24/regionFilter", () => ({
  isRegionMatch: vi.fn(() => true),
}));

vi.mock("@/lib/regions/kr", () => ({
  normalizeSido: vi.fn((input: string) => (input || null)),
}));

import { GET as exchangeGet } from "../src/app/api/public/exchange/route";
import { GET as gov24SearchGet } from "../src/app/api/gov24/search/route";

type ErrorEnvelope = {
  ok?: boolean;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

function expectStandardFailureEnvelope(payload: ErrorEnvelope): void {
  expect(payload.ok).toBe(false);
  expect(typeof payload.error?.code).toBe("string");
  expect((payload.error?.code as string).length).toBeGreaterThan(0);
  expect(typeof payload.error?.message).toBe("string");
  expect((payload.error?.message as string).length).toBeGreaterThan(0);
}

describe("external api error contract", () => {
  it("returns standardized failure envelope for invalid exchange input", async () => {
    const req = new Request("http://localhost/api/public/exchange?date=2026-02-25");
    const res = await exchangeGet(req);
    const json = (await res.json()) as ErrorEnvelope;

    expect(res.status).toBe(400);
    expectStandardFailureEnvelope(json);
    expect(json.error?.code).toBe("INPUT");
  });

  it("returns standardized failure envelope for invalid gov24 search input", async () => {
    const req = new Request("http://localhost/api/gov24/search?pageSize=0&cursor=abc");
    const res = await gov24SearchGet(req);
    const json = (await res.json()) as ErrorEnvelope;

    expect(res.status).toBe(400);
    expectStandardFailureEnvelope(json);
    expect(json.error?.code).toBe("INPUT");
  });
});
