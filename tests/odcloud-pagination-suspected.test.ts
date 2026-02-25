import { describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("odcloud pagination suspected", () => {
  it("flags paginationSuspected when page1/page2 first row id are same", async () => {
    const pages: Record<number, Array<Record<string, unknown>>> = {
      1: [{ serviceId: "svc-100" }, { serviceId: "svc-101" }],
      2: [{ serviceId: "svc-100" }, { serviceId: "svc-102" }],
      3: [],
    };
    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: 3,
      fetchPage: async (pageNo) => ({
        ok: true as const,
        rows: pages[pageNo] ?? [],
        totalCount: 300,
        perPage: 100,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.paginationSuspected).toBe(true);
    expect(result.meta.neededPagesEstimate).toBe(3);
    expect(result.meta.uniqueIds).toBe(3);
  });
});

