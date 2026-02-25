import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseKdbDepositXml } from "../src/lib/sources/datago/xml";

describe("parseKdbDepositXml", () => {
  it("parses kdb XML fixture", () => {
    const xml = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/kdb-deposit.sample.xml"), "utf-8");
    const parsed = parseKdbDepositXml(xml);

    expect(parsed.totalCount).toBe(2);
    expect(parsed.pageNo).toBe(1);
    expect(parsed.items).toHaveLength(2);
    expect(String(parsed.items[0]?.prdNm ?? "")).toContain("KDB 안심 정기예금");
  });
});
