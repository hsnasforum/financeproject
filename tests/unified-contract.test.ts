import { describe, expect, it } from "vitest";
import {
  buildStableUnifiedId,
  mergeUnifiedCatalogRows,
  type UnifiedMergeItem,
} from "../src/lib/sources/unifiedEnrichPolicy";

describe("unified catalog contract", () => {
  it("keeps stableId contract for finlife/matched/unmatched rows", () => {
    expect(buildStableUnifiedId({ sourceId: "finlife", externalKey: "FIN-001" })).toBe("FIN-001");
    expect(buildStableUnifiedId({ sourceId: "datago_kdb", externalKey: "KDB-1", canonicalFinPrdtCd: "FIN-001" })).toBe("FIN-001");
    expect(buildStableUnifiedId({ sourceId: "datago_kdb", externalKey: "KDB-2" })).toBe("datago_kdb:KDB-2");
  });

  it("returns merged row shape with stableId and term-sorted options", () => {
    const rows: UnifiedMergeItem[] = [
      {
        stableId: "FIN-001",
        sourceId: "finlife",
        externalKey: "FIN-001",
        providerName: "가은행",
        productName: "슈퍼예금",
        updatedAt: "2026-02-25T12:00:00.000Z",
        options: [
          { sourceId: "finlife", termMonths: 24, saveTrm: "24", intrRate: 3.2, intrRate2: 3.6 },
          { sourceId: "finlife", termMonths: 12, saveTrm: "12", intrRate: 3.1, intrRate2: 3.5 },
        ],
      },
      {
        stableId: "FIN-001",
        sourceId: "datago_kdb",
        externalKey: "KDB-AAA",
        providerName: "가은행",
        productName: "슈퍼예금",
        updatedAt: "2026-02-24T12:00:00.000Z",
        options: [
          { sourceId: "datago_kdb", termMonths: 12, saveTrm: "12개월", intrRate: 3.3, intrRate2: 3.9 },
          { sourceId: "datago_kdb", termMonths: 6, saveTrm: "6개월", intrRate: 2.8, intrRate2: 3.1 },
        ],
      },
      {
        stableId: "datago_kdb:KDB-ONLY",
        sourceId: "datago_kdb",
        externalKey: "KDB-ONLY",
        providerName: "나은행",
        productName: "별도예금",
        updatedAt: "2026-02-23T12:00:00.000Z",
      },
    ];

    const merged = mergeUnifiedCatalogRows({ items: rows, sort: "recent" });
    expect(merged.length).toBe(2);

    const first = merged[0];
    expect(first).toEqual(expect.objectContaining({
      stableId: "FIN-001",
      sourceId: "finlife",
      providerName: "가은행",
      productName: "슈퍼예금",
    }));
    expect(Array.isArray(first.options)).toBe(true);
    expect(first.options?.map((option) => option.termMonths)).toEqual([6, 12, 24]);
    expect(first.options?.find((option) => option.termMonths === 12)?.intrRate2).toBe(3.9);
  });
});
