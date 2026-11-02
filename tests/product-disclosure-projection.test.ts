import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    product: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        stored.rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      findMany: async ({ where }: { where?: { kind?: string } }) =>
        stored.rows.filter((row) => !where?.kind || row.kind === where.kind),
    },
    externalProductMatch: { findMany: async () => [] },
    externalSourceSnapshot: { findMany: async () => [], findUnique: async () => null },
  },
}));
vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: () => null,
  loadFinlifeSyncAttempt: () => null,
}));
vi.mock("@/lib/finlife/persistentSync", () => ({ runFinlifePersistentSync: vi.fn() }));

import { getUnifiedProductById } from "@/lib/sources/unified";
import { DEFAULT_UNIFIED_SOURCE_LOADERS } from "@/lib/sources/unifiedLoaders";
import { mergeUnifiedCatalogRows } from "@/lib/sources/unifiedEnrichPolicy";

function productRow(kind: "deposit" | "saving", month: unknown) {
  return {
    id: 1,
    finPrdtCd: "MONTH-TEST",
    identityKey: `finlife:${kind}:0010001:MONTH-TEST`,
    kind,
    name: "공시월 검증 상품",
    provider: { code: "0010001", name: "검증 은행" },
    raw: {
      fin_co_no: "0010001", fin_prdt_cd: "MONTH-TEST",
      fin_prdt_nm: "공시월 검증 상품", kor_co_nm: "검증 은행",
      ...(month !== undefined ? { dcls_month: month } : {}),
      upstream_private_field: "not-public",
    },
    options: [{ saveTrm: "12", intrRate: 3, intrRate2: 3.4, raw: {} }],
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T01:00:00.000Z"),
  };
}

async function list(kind: "deposit" | "saving") {
  return DEFAULT_UNIFIED_SOURCE_LOADERS.finlife!.query({
    kind, cursor: null, q: null, onlyNew: false, changedSince: null,
    includeTimestamps: false, limit: 10, sort: "name", qMode: "contains", debug: false,
  });
}

beforeEach(() => { stored.rows = []; });

describe("FINLIFE original disclosure month in public product projections", () => {
  it.each(["deposit", "saving"] as const)(
    "keeps %s September disclosure separate from October storage timestamps in list and detail",
    async (kind) => {
      stored.rows = [productRow(kind, "202609")];
      const page = await list(kind);
      const detail = await getUnifiedProductById({
        id: `finlife:${kind}:0010001:MONTH-TEST`, includeTimestamps: false,
      });
      for (const item of [page.items[0], detail]) {
        expect(item).toHaveProperty("disclosureMonth", "202609");
        expect(item?.updatedAt).toBeUndefined();
        expect(item).not.toHaveProperty("raw");
        expect(item).not.toHaveProperty("recommendDetail");
        expect(JSON.stringify(item)).not.toContain("upstream_private_field");
      }
    },
  );

  it.each([undefined, null, "", "202600", "202613", "2026-09", "20260930", "000009", {}, 202609])(
    "keeps missing or invalid source month %j unknown despite October collection",
    async (month) => {
      stored.rows = [productRow("saving", month)];
      const page = await list("saving");
      const detail = await getUnifiedProductById({ id: "finlife:saving:0010001:MONTH-TEST" });
      expect(page.items[0]).toHaveProperty("disclosureMonth", null);
      expect(detail).toHaveProperty("disclosureMonth", null);
    },
  );

  it("keeps the FINLIFE disclosure month when matched public sources are merged", async () => {
    stored.rows = [productRow("deposit", "202609")];
    const page = await list("deposit");
    const merged = mergeUnifiedCatalogRows({
      sort: "recent",
      items: [
        ...page.items,
        {
          stableId: page.items[0].stableId, sourceId: "datago_kdb", externalKey: "KDB-TEST",
          providerName: "검증 은행", productName: "공시월 검증 상품",
          updatedAt: "2026-10-10T05:00:00.000Z",
        },
      ],
    });
    expect(merged[0]).toHaveProperty("disclosureMonth", "202609");
  });
});
