import { describe, expect, it } from "vitest";
import { mergeUnifiedCatalogRows, type UnifiedMergeItem } from "../src/lib/sources/unifiedEnrichPolicy";

function sampleRows(): UnifiedMergeItem[] {
  return [
    {
      stableId: "FIN-002",
      sourceId: "finlife",
      externalKey: "FIN-002",
      providerName: "다은행",
      productName: "A예금",
      updatedAt: "2026-02-25T09:00:00.000Z",
    },
    {
      stableId: "FIN-001",
      sourceId: "finlife",
      externalKey: "FIN-001",
      providerName: "가은행",
      productName: "B예금",
      updatedAt: "2026-02-25T09:00:00.000Z",
    },
    {
      stableId: "FIN-001",
      sourceId: "datago_kdb",
      externalKey: "KDB-001",
      providerName: "가은행",
      productName: "B예금",
      updatedAt: "2026-02-24T09:00:00.000Z",
    },
    {
      stableId: "datago_kdb:KDB-ONLY",
      sourceId: "datago_kdb",
      externalKey: "KDB-ONLY",
      providerName: "나은행",
      productName: "단독예금",
      updatedAt: "2026-02-23T09:00:00.000Z",
    },
  ];
}

describe("unified dedup stability", () => {
  it("returns stable IDs and order regardless of input row order", () => {
    const original = sampleRows();
    const shuffled = [original[3], original[1], original[2], original[0]];

    const mergedA = mergeUnifiedCatalogRows({ items: original, sort: "recent" });
    const mergedB = mergeUnifiedCatalogRows({ items: shuffled, sort: "recent" });

    expect(mergedA.map((item) => item.stableId)).toEqual(mergedB.map((item) => item.stableId));
    expect(mergedA.map((item) => `${item.providerName}/${item.productName}`)).toEqual(
      mergedB.map((item) => `${item.providerName}/${item.productName}`),
    );
  });
});
