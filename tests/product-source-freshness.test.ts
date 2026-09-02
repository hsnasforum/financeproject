import { describe, expect, it } from "vitest";
import { applyProductSourceIssues, buildProductFreshnessSummary } from "../src/lib/sources/productFreshness";

describe("product source freshness", () => {
  it("keeps the response check time separate from the source basis", () => {
    const result = buildProductFreshnessSummary({
      kind: "deposit",
      sourceIds: ["finlife", "datago_kdb"],
      checkedAt: "2026-08-26T03:00:00.000Z",
      statuses: [{
        sourceId: "finlife",
        kind: "deposit",
        lastSyncedAt: "2026-06-22T15:58:01.146Z",
        ttlMs: 43_200_000,
        ageMs: 5_000_000_000,
        isFresh: false,
        fallbackUsed: false,
        counts: 10,
      }],
    });

    expect(result.checkedAt).toBe("2026-08-26T03:00:00.000Z");
    expect(result.overall).toBe("partial");
    expect(result.sources[0]).toMatchObject({
      sourceAsOf: "2026-06-22T15:58:01.146Z",
      checkedAt: "2026-08-26T03:00:00.000Z",
      freshness: "stale",
      fallbackUsed: false,
    });
    expect(result.sources[1]).toMatchObject({
      sourceId: "datago_kdb",
      sourceAsOf: null,
      freshness: "unavailable",
    });
  });

  it("marks sample data as an explicit replay-style fallback", () => {
    const result = buildProductFreshnessSummary({
      kind: "deposit",
      sourceIds: ["samplebank"],
      checkedAt: "2026-08-26T03:00:00.000Z",
      statuses: [],
    });

    expect(result.overall).toBe("stale");
    expect(result.sources[0]).toMatchObject({
      freshness: "sample",
      fallbackUsed: true,
      sourceAsOf: null,
    });
  });

  it("projects refresh fallback and query failure into the captured public status", () => {
    const base = buildProductFreshnessSummary({
      kind: "deposit",
      sourceIds: ["finlife", "datago_kdb"],
      checkedAt: "2026-08-26T03:00:00.000Z",
      statuses: [
        { sourceId: "finlife", kind: "deposit", lastSyncedAt: "2026-08-26T02:50:00.000Z", ttlMs: 3_600_000, ageMs: 600_000, isFresh: true, counts: 1 },
        { sourceId: "datago_kdb", kind: "deposit", lastSyncedAt: "2026-08-26T02:40:00.000Z", ttlMs: 3_600_000, ageMs: 1_200_000, isFresh: true, counts: 1 },
      ],
    });

    const result = applyProductSourceIssues(base, [
      { sourceId: "finlife", phase: "refresh", code: "SOURCE_REFRESH_FAILED", fallbackUsed: true, message: "이전 저장 데이터" },
      { sourceId: "datago_kdb", phase: "query", code: "SOURCE_QUERY_FAILED", fallbackUsed: false, message: "조회 실패" },
    ]);

    expect(result.overall).toBe("partial");
    expect(result.sources[0]).toMatchObject({ freshness: "stale", fallbackUsed: true, message: "이전 저장 데이터" });
    expect(result.sources[1]).toMatchObject({ freshness: "unavailable", sourceAsOf: null, message: "조회 실패" });
  });
});
