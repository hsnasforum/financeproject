import { afterEach, describe, expect, it, vi } from "vitest";
import { __test__ as cooldownTest } from "../src/lib/http/rateLimitCooldown";

const fetchLiveFinlifeDetailedMock = vi.fn(async () => {
  const error = new Error("HTTP 429") as Error & { status?: number };
  error.status = 429;
  throw error;
});

vi.mock("@/lib/finlife/best", () => ({
  ensureProductBest: vi.fn(),
}));

vi.mock("@/lib/finlife/fetchLive", () => ({
  fetchLiveFinlifeDetailed: fetchLiveFinlifeDetailedMock,
}));

vi.mock("@/lib/finlife/fetchMock", () => ({
  fetchMockFinlife: vi.fn(() => ({ result: { baseList: [], optionList: [] } })),
}));

vi.mock("@/lib/finlife/httpCache", () => ({
  buildFinlifeHttpCacheKey: vi.fn(() => "cache-key"),
  resolveFinlifeHttpCacheState: vi.fn(() => ({ state: "bypass", entry: null })),
}));

vi.mock("@/lib/finlife/meta", () => ({
  extractPagingMeta: vi.fn(() => ({ nowPage: 1, maxPage: 1, totalCount: 0 })),
}));

vi.mock("@/lib/finlife/mode", () => ({
  resolveFinlifeMode: vi.fn(() => "live"),
}));

vi.mock("@/lib/finlife/normalize", () => ({
  normalizeFinlifeProducts: vi.fn(() => []),
}));

vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: vi.fn(() => ({
    meta: {
      generatedAt: "2026-02-25T00:00:00.000Z",
      ttlMs: 1000,
      groupsScanned: ["020000"],
      pagesFetchedByGroup: { "020000": 1 },
      totalProducts: 1,
      totalOptions: 1,
      completionRate: 1,
      truncatedByHardCap: false,
      source: "finlife",
    },
    items: [{
      fin_prdt_cd: "P-001",
      fin_prdt_nm: "테스트 예금",
      kor_co_nm: "테스트 은행",
      options: [],
      raw: {
        topFinGrpNo: "020000",
      },
    }],
  })),
}));

vi.mock("@/lib/http/apiError", async () => await import("../src/lib/http/apiError"));
vi.mock("@/lib/http/fallbackMeta", async () => await import("../src/lib/http/fallbackMeta"));
vi.mock("@/lib/http/rateLimitCooldown", async () => await import("../src/lib/http/rateLimitCooldown"));

vi.mock("@/lib/publicApis/errorContract", () => ({
  statusFromExternalApiErrorCode: vi.fn((code: string | undefined) => {
    if (code === "CONFIG_MISSING" || code === "INPUT") return 400;
    return 502;
  }),
}));

vi.mock("@/lib/publicApis/schemaDrift", () => ({
  buildSchemaMismatchError: vi.fn(() => ({
    code: "SCHEMA_MISMATCH",
    message: "schema mismatch",
  })),
}));

const originalApiKey = process.env.FINLIFE_API_KEY;

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

afterEach(() => {
  cooldownTest.clear();
  fetchLiveFinlifeDetailedMock.mockClear();
  setEnv("FINLIFE_API_KEY", originalApiKey);
});

describe("finlife fallback mode", () => {
  it("uses REPLAY when api key is missing and snapshot is available", async () => {
    setEnv("FINLIFE_API_KEY", undefined);
    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");

    const req = new Request("http://localhost/api/finlife/deposit?pageNo=1&pageSize=50&topFinGrpNo=020000");
    const res = await getFinlifeProductsForHttp("deposit", req);

    expect(res.status).toBe(200);
    expect(res.payload.ok).toBe(true);
    if (!res.payload.ok) return;
    expect(res.payload.mode).toBe("fixture");
    expect(res.payload.meta.fallbackUsed).toBe(true);
    expect(res.payload.meta.fallback?.mode).toBe("REPLAY");
    expect(res.payload.meta.fallback?.reason).toBe("missing_api_key_replay");
  });

  it("sets cooldown on 429 and skips repeated live calls during cooldown", async () => {
    setEnv("FINLIFE_API_KEY", "dummy-key");
    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");

    const req = new Request("http://localhost/api/finlife/deposit?pageNo=1&pageSize=50&topFinGrpNo=020000");
    const first = await getFinlifeProductsForHttp("deposit", req);
    const second = await getFinlifeProductsForHttp("deposit", req);

    expect(first.payload.ok).toBe(true);
    expect(second.payload.ok).toBe(true);
    if (!first.payload.ok || !second.payload.ok) return;
    expect(first.payload.meta.fallback?.mode).toBe("REPLAY");
    expect(first.payload.meta.fallback?.nextRetryAt).toBeTruthy();
    expect(second.payload.meta.fallback?.mode).toBe("REPLAY");
    expect(fetchLiveFinlifeDetailedMock).toHaveBeenCalledTimes(1);
  });
});
