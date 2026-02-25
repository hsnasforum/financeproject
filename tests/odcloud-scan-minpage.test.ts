import { describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("odcloud scan min page behavior", () => {
  it("always fetches page 1 even when maxPages is 0", async () => {
    const called: number[] = [];
    const result = await scanPagedOdcloud({
      maxPages: 0,
      fetchPage: async (pageNo) => {
        called.push(pageNo);
        return { ok: true as const, rows: [], totalCount: 0 };
      },
    });
    expect(called).toEqual([1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.scannedPages).toBe(1);
  });
});

