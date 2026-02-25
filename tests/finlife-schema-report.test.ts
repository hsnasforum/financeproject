import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFinlifeSchemaReport } from "../src/lib/finlife/schemaReport";

const tmpDir = path.resolve(process.cwd(), "tmp/test-finlife-schema-report");

function writeFixture(filename: string, payload: unknown) {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, filename), JSON.stringify(payload, null, 2), "utf8");
}

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("finlife schema report", () => {
  it("counts baseList and optionList keys by kind", () => {
    writeFixture("product__pension__020000__1.json", {
      scope: "product",
      kind: "pension",
      raw: {
        result: {
          baseList: [{ fin_prdt_cd: "P1", fin_prdt_nm: "A" }, { fin_prdt_cd: "P2", join_way: "online" }],
          optionList: [{ fin_prdt_cd: "P1", intr_rate: "2.3" }, { fin_prdt_cd: "P1", save_trm: "12" }],
        },
      },
    });

    const report = buildFinlifeSchemaReport({ dir: tmpDir, topN: 10 });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const pension = report.report.product.pension;
    expect(pension?.baseKeys).toContainEqual(["fin_prdt_cd", 2]);
    expect(pension?.optionKeys).toContainEqual(["fin_prdt_cd", 2]);
    expect(pension?.optionKeys).toContainEqual(["intr_rate", 1]);
    expect(pension?.optionKeys).toContainEqual(["save_trm", 1]);
  });
});
