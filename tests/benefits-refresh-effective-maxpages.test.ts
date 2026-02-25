import { afterEach, describe, expect, it } from "vitest";
import { scanPagedOdcloud } from "../src/lib/publicApis/odcloudScan";

const ORIGINAL_HARD_CAP = process.env.BENEFITS_SCAN_HARD_CAP_PAGES;

afterEach(() => {
  if (ORIGINAL_HARD_CAP === undefined) {
    delete process.env.BENEFITS_SCAN_HARD_CAP_PAGES;
  } else {
    process.env.BENEFITS_SCAN_HARD_CAP_PAGES = ORIGINAL_HARD_CAP;
  }
});

describe("benefits refresh effective max pages", () => {
  it("uses neededPagesEstimate when auto and hard cap is sufficient", async () => {
    process.env.BENEFITS_SCAN_HARD_CAP_PAGES = "200";
    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: "auto",
      maxMatches: 20_000,
      fetchPage: async (pageNo) => ({
        ok: true as const,
        rows: pageNo <= 55 ? [{ serviceId: `svc-${pageNo}` }] : [],
        totalCount: 10_875,
        perPage: 200,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.neededPagesEstimate).toBe(55);
    expect(result.meta.effectiveMaxPages).toBe(55);
    expect(result.meta.pagesFetched).toBe(55);
    expect(result.meta.truncatedByHardCap).toBe(false);
  });

  it("marks hard-cap truncation when neededPagesEstimate exceeds hard cap", async () => {
    process.env.BENEFITS_SCAN_HARD_CAP_PAGES = "30";
    const result = await scanPagedOdcloud({
      mode: "all",
      maxPages: "auto",
      maxMatches: 20_000,
      fetchPage: async (pageNo) => ({
        ok: true as const,
        rows: pageNo <= 60 ? [{ serviceId: `svc-${pageNo}` }] : [],
        totalCount: 10_875,
        perPage: 200,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.neededPagesEstimate).toBe(55);
    expect(result.meta.effectiveMaxPages).toBe(30);
    expect(result.meta.pagesFetched).toBe(30);
    expect(result.meta.truncatedByHardCap).toBe(true);
  });
});

