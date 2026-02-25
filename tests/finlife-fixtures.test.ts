import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFixtureKey, getFinlifeFixtureDir, readFinlifeFixture, writeFinlifeFixture } from "../src/lib/finlife/fixtures";
import { getFinlifeCompanies } from "../src/lib/finlife/companySource";
import { getFinlifeProducts } from "../src/lib/finlife/source";

const tmpDir = path.resolve(process.cwd(), "tmp/test-finlife-fixtures");

function resetEnv() {
  delete process.env.FINLIFE_FIXTURE_DIR;
  delete process.env.FINLIFE_MODE;
  delete process.env.FINLIFE_RECORD_FIXTURES;
  delete process.env.FINLIFE_API_KEY;
  delete process.env.FINLIFE_BASE_URL;
}

afterEach(() => {
  resetEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("finlife fixtures", () => {
  it("builds safe fixture key", () => {
    const key = buildFixtureKey({
      scope: "product",
      kind: "credit-loan",
      topFinGrpNo: "../../020000",
      pageNo: 1,
    });
    expect(key).toBe("product__credit-loan__.._.._020000__1.json");
    expect(key.includes("/")).toBe(false);
    expect(key.includes("\\")).toBe(false);
  });

  it("writes and reads fixture payload raw data", () => {
    process.env.FINLIFE_FIXTURE_DIR = tmpDir;
    const key = buildFixtureKey({ scope: "product", kind: "deposit", topFinGrpNo: "020000", pageNo: 1 });
    const raw = { result: { baseList: [{ fin_prdt_cd: "D1" }], optionList: [] } };
    writeFinlifeFixture(key, {
      fetchedAt: "2026-02-19T00:00:00.000Z",
      scope: "product",
      kind: "deposit",
      params: { topFinGrpNo: "020000", pageNo: 1 },
      raw,
    });

    const restored = readFinlifeFixture(key) as { result?: { baseList?: unknown[] } };
    expect(restored?.result?.baseList).toHaveLength(1);
    expect(getFinlifeFixtureDir()).toBe(tmpDir);
  });

  it("returns FIXTURE_MISSING when product fixture is absent", async () => {
    process.env.FINLIFE_MODE = "fixture";
    process.env.FINLIFE_FIXTURE_DIR = tmpDir;

    const result = await getFinlifeProducts("deposit", { topFinGrpNo: "020000", pageNo: 31 });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("fixture");
    expect(result.error?.code).toBe("FIXTURE_MISSING");
  });

  it("returns FIXTURE_MISSING when company fixture is absent", async () => {
    process.env.FINLIFE_MODE = "fixture";
    process.env.FINLIFE_FIXTURE_DIR = tmpDir;

    const result = await getFinlifeCompanies({ topFinGrpNo: "020000", pageNo: 31 });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("fixture");
    expect(result.error?.code).toBe("FIXTURE_MISSING");
  });
});
