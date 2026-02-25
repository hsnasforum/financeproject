import { describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("benefits scan-all merge", () => {
  it("collects rows across multiple pages until empty page", async () => {
    const pages: Record<number, Array<Record<string, unknown>>> = {
      1: [{ id: 1 }, { id: 2 }],
      2: [{ id: 3 }],
      3: [],
    };

    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: 10,
      maxMatches: 100,
      fetchPage: async (pageNo) => ({ ok: true, rows: pages[pageNo] ?? [] }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rowsMatched.length).toBe(3);
    expect(result.meta.scannedPages).toBe(3);
  });
});
