import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("../src/lib/db/prisma", () => ({
  prisma: {
    product: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => database.rows.find((row) => (
        Object.entries(where).every(([key, value]) => row[key] === value)
      )) ?? null,
      findMany: async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => database.rows.filter((row) => {
        if (where?.kind && row.kind !== where.kind) return false;
        if (typeof where?.finPrdtCd === "string" && row.finPrdtCd !== where.finPrdtCd) return false;
        if (where && Object.hasOwn(where, "identityKey") && row.identityKey !== where.identityKey) return false;
        return true;
      }).slice(0, take ?? database.rows.length),
    },
    externalProductMatch: { findMany: async () => [] },
    externalSourceSnapshot: { findUnique: async () => null, findMany: async () => [] },
  },
}));

vi.mock("../src/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: () => null,
  loadFinlifeSyncAttempt: () => null,
}));
vi.mock("../src/lib/finlife/persistentSync", () => ({ runFinlifePersistentSync: vi.fn() }));

import { getUnifiedProductById, UnifiedInputError, UnifiedRetiredProductError } from "../src/lib/sources/unified";
import { DEFAULT_UNIFIED_SOURCE_LOADERS } from "../src/lib/sources/unifiedLoaders";

function row(id: number, company: string, identityKey: string | null, finPrdtCd = "SAME") {
  return {
    id,
    finPrdtCd,
    identityKey,
    kind: "saving",
    name: `상품 ${company}`,
    raw: { fin_co_no: company, fin_prdt_cd: finPrdtCd, kor_co_nm: `은행 ${company}`, fin_prdt_nm: `상품 ${company}` },
    provider: { code: company, name: `은행 ${company}` },
    options: [{ saveTrm: "12", intrRate: 2, intrRate2: 3, raw: {} }],
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-10T00:00:00Z"),
  };
}

describe("FINLIFE scoped identity in unified consumers", () => {
  beforeEach(() => {
    database.rows = [
      row(1, "0000001", "finlife:saving:0000001:SAME"),
      row(2, "0000002", "finlife:saving:0000002:SAME"),
    ];
  });

  it("looks up the correct company by scoped identity", async () => {
    const item = await getUnifiedProductById({ id: "finlife:saving:0000002:SAME" });
    expect(item?.providerName).toBe("은행 0000002");
    expect(item?.stableId).toBe("finlife:saving:0000002:SAME");
  });

  it.each(["SAME", "finlife:SAME"])("rejects ambiguous legacy lookup %s", async (id) => {
    await expect(getUnifiedProductById({ id })).rejects.toBeInstanceOf(UnifiedInputError);
  });

  it("resolves an unambiguous legacy code without changing its stored product", async () => {
    database.rows = [row(3, "0000003", "finlife:saving:0000003:OLD", "OLD")];
    const item = await getUnifiedProductById({ id: "OLD" });
    expect(item?.stableId).toBe("finlife:saving:0000003:OLD");
    expect(item?.externalKey).toBe("OLD");
  });

  it("keeps both company identities while exposing original recommendation codes", async () => {
    const loader = DEFAULT_UNIFIED_SOURCE_LOADERS.finlife!;
    const result = await loader.query({
      kind: "saving", cursor: null, q: null, onlyNew: false, changedSince: null,
      includeTimestamps: false, includeRecommendDetail: true, limit: 10, sort: "name", qMode: "contains", debug: false,
    });
    expect(result.items.map((item) => item.stableId)).toEqual([
      "finlife:saving:0000001:SAME",
      "finlife:saving:0000002:SAME",
    ]);
    expect(result.items.map((item) => item.recommendDetail?.finPrdtCd)).toEqual(["SAME", "SAME"]);
  });

  it("computes a scoped identity for a nullable legacy row with complete metadata", async () => {
    database.rows = [row(3, "0000003", null, "OLD")];
    const item = await getUnifiedProductById({ id: "OLD" });
    expect(item?.stableId).toBe("finlife:saving:0000003:OLD");
  });

  it("opens a scoped link emitted from a legacy row before identity backfill", async () => {
    database.rows = [row(3, "0000003", null, "OLD")];
    const item = await getUnifiedProductById({ id: "finlife:saving:0000003:OLD" });
    expect(item?.productName).toBe("상품 0000003");
  });

  it("uses the stored provider company when legacy raw company metadata is absent", async () => {
    const legacy = row(3, "0000003", null, "OLD");
    database.rows = [{ ...legacy, raw: { fin_prdt_nm: "상품 0000003" } }];
    const item = await getUnifiedProductById({ id: "OLD" });
    expect(item?.stableId).toBe("finlife:saving:0000003:OLD");
  });

  it("keeps credit subtypes distinct within one company and product code", async () => {
    database.rows = ["2", "3"].map((subtype, index) => ({
      ...row(index + 1, "0010016", `finlife:credit-loan:0010016:WR0002F:${subtype}`, "WR0002F"),
      kind: "credit-loan",
      raw: { fin_co_no: "0010016", fin_prdt_cd: "WR0002F", crdt_prdt_type: subtype },
    }));
    const item = await getUnifiedProductById({ id: "finlife:credit-loan:0010016:WR0002F:3" });
    expect(item?.stableId).toBe("finlife:credit-loan:0010016:WR0002F:3");
    await expect(getUnifiedProductById({ id: "WR0002F" })).rejects.toBeInstanceOf(UnifiedInputError);
  });

  it("refuses stored FINLIFE pension rows as retired instead of serving old data", async () => {
    const pension = {
      ...row(5, "0010003", "finlife:pension:0010003:PEN", "PEN"),
      kind: "pension",
      raw: { fin_co_no: "0010003", fin_prdt_cd: "PEN", pnsn_kind: "1", prdt_type: "1" },
    };
    database.rows = [pension];
    await expect(getUnifiedProductById({ id: "finlife:pension:0010003:PEN" })).rejects.toMatchObject({
      name: "UnifiedRetiredProductError",
      replacementHref: "/products/pension",
    });
    // A scoped pension id is retired even when the row is gone, and a legacy bare code still resolves to the pension row.
    await expect(getUnifiedProductById({ id: "finlife:pension:0010009:GONE" })).rejects.toBeInstanceOf(UnifiedRetiredProductError);
    await expect(getUnifiedProductById({ id: "PEN" })).rejects.toBeInstanceOf(UnifiedRetiredProductError);
  });

  it("rejects malformed scoped identities without falling back to bare codes", async () => {
    await expect(getUnifiedProductById({ id: "finlife:saving:1:SAME" })).rejects.toBeInstanceOf(UnifiedInputError);
  });
});
