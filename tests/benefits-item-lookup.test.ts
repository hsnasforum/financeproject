import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAMPLE_ITEM = {
  id: "119200000109",
  title: "테스트 혜택",
  summary: "요약",
  eligibilityHints: [],
  region: { scope: "UNKNOWN" as const, tags: [] as string[] },
  source: "test",
  fetchedAt: "2026-02-28T00:00:00.000Z",
};

describe("getBenefitItem lookup", () => {
  const originalApiKey = process.env.MOIS_BENEFITS_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.MOIS_BENEFITS_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalApiKey === "string") process.env.MOIS_BENEFITS_API_KEY = originalApiKey;
    else delete process.env.MOIS_BENEFITS_API_KEY;
  });

  it("returns item from snapshot without upstream search", async () => {
    vi.doMock("../src/lib/publicApis/benefitsSnapshot", () => ({
      getSnapshotOrNull: () => ({
        snapshot: {
          meta: {
            generatedAt: "2026-02-28T00:00:00.000Z",
            totalItemsInSnapshot: 1,
          },
          items: [SAMPLE_ITEM],
        },
        fromCache: "memory",
        isStale: false,
      }),
    }));

    const { getBenefitItem } = await import("../src/lib/publicApis/providers/benefits");
    const result = await getBenefitItem("119200000109");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.item.id).toBe("119200000109");
    }
  });

  it("returns upstream env error when snapshot is missing", async () => {
    vi.doMock("../src/lib/publicApis/benefitsSnapshot", () => ({
      getSnapshotOrNull: () => null,
    }));

    const { getBenefitItem } = await import("../src/lib/publicApis/providers/benefits");
    const result = await getBenefitItem("119200000109");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ENV_MISSING");
    }
  });
});
