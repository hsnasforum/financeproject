import { describe, expect, it } from "vitest";
import { extractOdcloudRows, scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("odcloud scan utils", () => {
  it("extracts rows from multiple json shapes", () => {
    const a = extractOdcloudRows({ data: [{ a: 1 }] });
    expect("rows" in a ? a.rows.length : 0).toBe(1);

    const b = extractOdcloudRows({ rows: [{ b: 2 }] });
    expect("rows" in b ? b.rows.length : 0).toBe(1);

    const c = extractOdcloudRows([{ c: 3 }]);
    expect("rows" in c ? c.rows.length : 0).toBe(1);
  });

  it("scans pages and finds matches", async () => {
    const pages: Record<number, Array<Record<string, unknown>>> = {
      1: [{ title: "청년 지원" }],
      2: [{ title: "주거 안정 패키지" }],
      3: [],
    };
    const scanned = await scanPagedOdcloud({
      queryText: "주거",
      fetchPage: async (pageNo) => ({
        ok: true as const,
        rows: pages[pageNo] ?? [],
        totalCount: 2,
      }),
    });

    expect(scanned.ok).toBe(true);
    if (!scanned.ok) return;
    expect(scanned.meta.scannedPages).toBe(2);
    expect(scanned.meta.scannedRows).toBe(2);
    expect(scanned.meta.matchedRows).toBe(1);
  });
});
