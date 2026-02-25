import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFinlifeProducts } from "../src/lib/finlife/source";
import { buildFixtureKey } from "../src/lib/finlife/fixtures";
import { fetchEximExchange } from "../src/lib/publicApis/providers/exchange";
import { scanBenefitsPages } from "../src/lib/publicApis/providers/benefits";

const tmpDir = path.resolve(process.cwd(), "tmp/test-schema-drift-safe-error");

function resetEnv() {
  delete process.env.EXIM_EXCHANGE_API_KEY;
  delete process.env.EXIM_EXCHANGE_API_URL;
  delete process.env.EXIM_EXCHANGE_KEY_PARAM;
  delete process.env.FINLIFE_MODE;
  delete process.env.FINLIFE_FIXTURE_DIR;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("schema drift safe error", () => {
  it("returns standardized safe diagnostics for exchange parse failure", async () => {
    process.env.EXIM_EXCHANGE_API_KEY = "SECRET_EXIM_KEY";
    process.env.EXIM_EXCHANGE_API_URL = "https://example.com/exchangeJSON";
    process.env.EXIM_EXCHANGE_KEY_PARAM = "authkey";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } })),
    );

    const result = await fetchEximExchange({ dateYYYYMMDD: "20260225" });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("SCHEMA_MISMATCH");
    expect(result.error.message).toContain("응답 형식");
    const diagnostics = result.error.diagnostics as Record<string, unknown>;
    expect(diagnostics.source).toBe("exchange");
    expect(diagnostics.stage).toBe("http_html");
    expect(String(diagnostics.endpoint ?? "")).toBe("https://example.com/exchangeJSON");
    expect(String(diagnostics.endpoint ?? "")).not.toContain("authkey");
    expect(String(diagnostics.endpoint ?? "")).not.toContain("SECRET_EXIM_KEY");
  });

  it("returns standardized safe diagnostics for gov24 parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>error</html>", { status: 200, headers: { "content-type": "text/html" } })),
    );

    const result = await scanBenefitsPages({
      endpoint: new URL("https://api.odcloud.kr/api/gov24/v3/serviceList"),
      apiKey: "SECRET_ODCLOUD_KEY",
      mode: "all",
      scanPages: 1,
      rows: 50,
      maxMatches: 50,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("SCHEMA_MISMATCH");
    expect(result.error.message).toContain("응답 형식");
    const diagnostics = result.error.diagnostics as Record<string, unknown>;
    expect(diagnostics.source).toBe("gov24");
    expect(diagnostics.stage).toBe("http_html");
    expect(String(diagnostics.endpoint ?? "")).toBe("https://api.odcloud.kr/api/gov24/v3/serviceList");
    expect(String(diagnostics.endpoint ?? "")).not.toContain("serviceKey");
    expect(String(diagnostics.endpoint ?? "")).not.toContain("SECRET_ODCLOUD_KEY");
  });

  it("returns standardized safe diagnostics for finlife parse failure", async () => {
    process.env.FINLIFE_MODE = "fixture";
    process.env.FINLIFE_FIXTURE_DIR = tmpDir;
    fs.mkdirSync(tmpDir, { recursive: true });
    const fixtureKey = buildFixtureKey({ scope: "product", kind: "deposit", topFinGrpNo: "020000", pageNo: 1 });
    fs.writeFileSync(path.join(tmpDir, fixtureKey), JSON.stringify({
      scope: "product",
      kind: "deposit",
      raw: {
        result: {
          baseList: { invalid: true },
          optionList: [],
        },
      },
    }), "utf8");

    const result = await getFinlifeProducts("deposit", { topFinGrpNo: "020000", pageNo: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error?.code).toBe("SCHEMA_MISMATCH");
    expect(result.error?.message).toContain("응답 형식");
    const diagnostics = (result.error?.diagnostics ?? {}) as Record<string, unknown>;
    expect(diagnostics.source).toBe("finlife");
    expect(diagnostics.stage).toBe("extract_rows");
    expect(String(diagnostics.note ?? "")).toContain("reason=baseList_not_array");
  });
});
