import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchLiveFinlife: vi.fn(),
  fetchLiveFinlifeDetailed: vi.fn(),
  saveFinlifeSnapshot: vi.fn(),
  loadFinlifeSnapshot: vi.fn(),
  writeFinlifeFixture: vi.fn(),
}));

vi.mock("../src/lib/finlife/fetchLive", () => ({
  fetchLiveFinlife: mocks.fetchLiveFinlife,
  fetchLiveFinlifeDetailed: mocks.fetchLiveFinlifeDetailed,
}));
vi.mock("../src/lib/finlife/snapshot", () => ({
  saveFinlifeSnapshot: mocks.saveFinlifeSnapshot,
  loadFinlifeSnapshot: mocks.loadFinlifeSnapshot,
}));
vi.mock("../src/lib/finlife/fixtures", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/finlife/fixtures")>(),
  writeFinlifeFixture: mocks.writeFinlifeFixture,
}));

function response(division = "D") {
  const identity = { fin_co_no: "0001234", fin_prdt_cd: "SAME", dcls_month: "202609" };
  return {
    result: {
      prdt_div: division,
      err_cd: "000",
      err_msg: "정상",
      now_page_no: 1,
      max_page_no: 1,
      total_count: 1,
      baseList: [{ ...identity, kor_co_nm: "은행 A", fin_prdt_nm: "예금" }],
      optionList: [{ ...identity, save_trm: "12", intr_rate: "2.1", intr_rate_type: "S" }],
    },
  };
}

function serve(raw: unknown) {
  mocks.fetchLiveFinlife.mockResolvedValue(raw);
  mocks.fetchLiveFinlifeDetailed.mockResolvedValue({ raw, status: 200, elapsedMs: 1, cacheKey: "public-fss-response" });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.loadFinlifeSnapshot.mockReturnValue(null);
  vi.stubEnv("FINLIFE_MODE", "live");
  vi.stubEnv("FINLIFE_API_KEY", "test-only-key");
  vi.stubEnv("FINLIFE_FAIL_OPEN_TO_MOCK", "1");
  vi.stubEnv("FINLIFE_TOPFIN_GRP_LIST", "020000");
  vi.stubEnv("FINLIFE_RECORD_FIXTURES", "1");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FINLIFE_REPLAY", "0");
  serve(response());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("FINLIFE live integrity boundaries", () => {
  it("rejects wrong-kind data before recording fixtures, fallback or caching", async () => {
    serve(response("S"));
    const { getFinlifeProducts } = await import("../src/lib/finlife/source");

    const first = await getFinlifeProducts("deposit");
    const second = await getFinlifeProducts("deposit");

    expect(first).toMatchObject({ ok: false, mode: "live", meta: { fallbackUsed: false }, error: { code: "SCHEMA_MISMATCH" } });
    expect(second.ok).toBe(false);
    expect(mocks.fetchLiveFinlife).toHaveBeenCalledTimes(2);
    expect(mocks.writeFinlifeFixture).not.toHaveBeenCalled();
  });

  it("keeps a schema failure visible when a previous HTTP cache exists", async () => {
    const { getFinlifeProductsForHttp, __test__ } = await import("../src/lib/finlife/productsHttp");
    const request = new Request("http://localhost/api/finlife/deposit?force=1");
    const valid = await getFinlifeProductsForHttp("deposit", request);
    expect(valid.status).toBe(200);

    serve(response("S"));
    const invalid = await getFinlifeProductsForHttp("deposit", request);

    expect(invalid.status).toBe(502);
    expect(invalid.payload).toMatchObject({ ok: false, error: { code: "SCHEMA_MISMATCH" }, meta: { fallbackUsed: false, fallback: { mode: "LIVE" } } });
    expect(__test__.liveCache.size).toBe(1);
    expect([...__test__.liveCache.values()][0]?.payload.data[0]?.fin_co_no).toBe("0001234");
  });

  it("keeps same-code companies separate in the real HTTP normalization path", async () => {
    const raw = response();
    raw.result.total_count = 2;
    raw.result.baseList.push({ ...raw.result.baseList[0]!, fin_co_no: "0007654", kor_co_nm: "은행 B" });
    raw.result.optionList.push({ ...raw.result.optionList[0]!, fin_co_no: "0007654", intr_rate: "3.1" });
    serve(raw);
    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");

    const result = await getFinlifeProductsForHttp("deposit", new Request("http://localhost/api/finlife/deposit?force=1"));

    expect(result.status).toBe(200);
    expect(result.payload.data.map((product) => [product.fin_co_no, product.options.map((option) => option.intr_rate)])).toEqual([
      ["0001234", [2.1]],
      ["0007654", [3.1]],
    ]);
  });

  it.each(["wrong-division", "missing-company", "orphan-month", "empty-nonzero"])(
    "preserves the snapshot when live %s data is invalid even with fail-open enabled",
    async (failure) => {
      const raw = response();
      if (failure === "wrong-division") raw.result.prdt_div = "S";
      if (failure === "missing-company") raw.result.baseList[0]!.fin_co_no = "";
      if (failure === "orphan-month") raw.result.optionList[0]!.dcls_month = "202608";
      if (failure === "empty-nonzero") { raw.result.baseList = []; raw.result.optionList = []; }
      serve(raw);
      const { runFinlifeSnapshotSync } = await import("../src/lib/finlife/syncRunner");

      const result = await runFinlifeSnapshotSync("deposit");

      expect(result).toMatchObject({ ok: false, error: { code: "UPSTREAM_SCHEMA_MISMATCH" } });
      expect(mocks.saveFinlifeSnapshot).not.toHaveBeenCalled();
    },
  );

  it("reports nonzero upstream result codes as failures without exposing the upstream message or fallback", async () => {
    const raw = response();
    raw.result.err_cd = "100";
    raw.result.err_msg = "test-only private upstream detail";
    serve(raw);
    const { getFinlifeProducts } = await import("../src/lib/finlife/source");
    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");
    const { runFinlifeSnapshotSync } = await import("../src/lib/finlife/syncRunner");

    const source = await getFinlifeProducts("deposit");
    const http = await getFinlifeProductsForHttp("deposit", new Request("http://localhost/api/finlife/deposit?force=1"));
    const sync = await runFinlifeSnapshotSync("deposit");

    expect(source).toMatchObject({ ok: false, mode: "live", error: { code: "LIVE_FETCH_FAILED" }, meta: { fallbackUsed: false } });
    expect(http.status).toBe(502);
    expect(http.payload).toMatchObject({ ok: false, error: { code: "LIVE_FETCH_FAILED" }, meta: { fallbackUsed: false, fallback: { mode: "LIVE" } } });
    expect(sync).toMatchObject({ ok: false, error: { code: "UPSTREAM_FETCH_FAILED" } });
    expect(JSON.stringify([source, http, sync])).not.toContain(raw.result.err_msg);
    expect(mocks.saveFinlifeSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeFinlifeFixture).not.toHaveBeenCalled();
  });

  it("accepts a structurally valid empty result as empty", async () => {
    const raw = response();
    raw.result.total_count = 0;
    raw.result.baseList = [];
    raw.result.optionList = [];
    serve(raw);
    const { getFinlifeProductsForHttp } = await import("../src/lib/finlife/productsHttp");

    const result = await getFinlifeProductsForHttp("deposit", new Request("http://localhost/api/finlife/deposit?force=1"));

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ ok: true, data: [], meta: { totalProducts: 0, totalOptions: 0, totalCount: 0 } });
  });
});
