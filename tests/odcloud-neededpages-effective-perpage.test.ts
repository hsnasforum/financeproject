import { describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

describe("odcloud needed pages effective perpage", () => {
  it("uses effectivePerPage from actual rows length when it is lower than requested", async () => {
    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: "auto",
      requestedPerPage: 200,
      fetchPage: async (pageNo) => ({
        ok: true as const,
        rows: pageNo <= 109 ? Array.from({ length: 100 }, (_, idx) => ({ serviceId: `svc-${pageNo}-${idx}` })) : [],
        totalCount: 10_875,
        perPage: undefined,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.effectivePerPage).toBe(100);
    expect(result.meta.neededPagesEstimate).toBe(109);
  });
});
