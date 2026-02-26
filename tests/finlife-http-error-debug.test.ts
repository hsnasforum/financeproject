import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finlife/best", () => ({
  ensureProductBest: vi.fn(),
}));

vi.mock("@/lib/finlife/fetchLive", () => ({
  fetchLiveFinlifeDetailed: vi.fn(async () => ({ status: 500, elapsedMs: 1, raw: { result: { baseList: [], optionList: [] } } })),
}));

vi.mock("@/lib/finlife/fetchMock", () => ({
  fetchMockFinlife: vi.fn(() => ({ result: { baseList: [], optionList: [] } })),
}));

vi.mock("@/lib/finlife/httpCache", () => ({
  buildFinlifeHttpCacheKey: vi.fn(() => "mock-cache-key"),
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
  loadFinlifeSnapshot: vi.fn(() => null),
}));

vi.mock("@/lib/http/apiError", async () => await import("../src/lib/http/apiError"));
vi.mock("@/lib/http/fallbackMeta", async () => await import("../src/lib/http/fallbackMeta"));
vi.mock("@/lib/http/rateLimitCooldown", async () => await import("../src/lib/http/rateLimitCooldown"));

vi.mock("@/lib/publicApis/errorContract", () => ({
  statusFromExternalApiErrorCode: vi.fn((code: string | undefined) => {
    if (!code) return 502;
    if (code === "INPUT") return 400;
    return 502;
  }),
}));

vi.mock("@/lib/publicApis/schemaDrift", () => ({
  buildSchemaMismatchError: vi.fn(() => ({
    code: "SCHEMA_MISMATCH",
    message: "schema mismatch",
  })),
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalApiKey = process.env.FINLIFE_API_KEY;
const originalReplay = process.env.FINLIFE_REPLAY;

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
    return;
  }
  env[name] = value;
}

afterEach(() => {
  setEnv("NODE_ENV", originalNodeEnv);
  setEnv("FINLIFE_API_KEY", originalApiKey);
  setEnv("FINLIFE_REPLAY", originalReplay);
});

describe("finlife http error debug gating", () => {
  it("hides error.debug in production by default when FINLIFE_API_KEY is missing", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("FINLIFE_API_KEY", undefined);
    setEnv("FINLIFE_REPLAY", undefined);

    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");
    const request = new Request("http://localhost/api/finlife/deposit?force=1&pageNo=1&pageSize=50&topFinGrpNo=020000");
    const result = await getFinlifeProductsForHttp("deposit", request);

    expect(result.payload.ok).toBe(false);
    if (result.payload.ok) return;
    expect(result.payload.error?.code).toBe("CONFIG_MISSING");
    expect(result.payload.error?.message).toBe("FINLIFE_API_KEY가 설정되지 않았습니다.");
    expect(result.payload.error?.debug).toBeUndefined();
  });

  it("shows error.debug when debug=1 even in production", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("FINLIFE_API_KEY", undefined);
    setEnv("FINLIFE_REPLAY", undefined);

    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");
    const request = new Request("http://localhost/api/finlife/deposit?debug=1&force=1&pageNo=1&pageSize=50&topFinGrpNo=020000");
    const result = await getFinlifeProductsForHttp("deposit", request);

    expect(result.payload.ok).toBe(false);
    if (result.payload.ok) return;
    expect(result.payload.error?.code).toBe("CONFIG_MISSING");
    expect(result.payload.error?.debug).toMatchObject({
      reason: "missing_api_key",
      cacheKey: expect.any(String),
      pageNo: 1,
      pageSize: 50,
    });
  });
});
