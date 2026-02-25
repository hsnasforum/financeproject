import { describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("benefits auto maxPages", () => {
  it("uses neededPagesEstimate when maxPages is auto", async () => {
    const called: number[] = [];
    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: "auto",
      fetchPage: async (pageNo) => {
        called.push(pageNo);
        const rows = pageNo <= 6 ? [{ serviceId: `svc-${pageNo}` }] : [];
        return {
          ok: true as const,
          rows,
          totalCount: 550,
          perPage: 100,
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.neededPagesEstimate).toBe(6);
    expect(result.meta.autoMaxPagesApplied).toBe(true);
    expect(result.meta.scannedPages).toBe(6);
    expect(called).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

