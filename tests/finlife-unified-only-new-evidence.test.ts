import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFinlifeSnapshot: vi.fn(),
  findCompletionEvidence: vi.fn(),
  findProducts: vi.fn(),
  findSourceSnapshots: vi.fn(),
  findExternalProducts: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    externalSourceSnapshot: {
      findUnique: mocks.findCompletionEvidence,
      findMany: mocks.findSourceSnapshots,
    },
    product: {
      findMany: mocks.findProducts,
    },
    externalProduct: {
      findMany: mocks.findExternalProducts,
    },
  },
}));

vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: mocks.loadFinlifeSnapshot,
  loadFinlifeSyncAttempt: vi.fn(),
}));

import { datagoKdbUnifiedSourceLoader, finlifeUnifiedSourceLoader } from "../src/lib/sources/unifiedLoaders";

const QUERY_INPUT = {
  kind: "deposit" as const,
  cursor: null,
  q: null,
  onlyNew: true,
  changedSince: null,
  includeTimestamps: false,
  limit: 20,
  sort: "name" as const,
  qMode: "contains" as const,
  debug: false,
};

function onlyNewThreshold(): Date | undefined {
  const input = mocks.findProducts.mock.calls[0]?.[0] as {
    where?: { createdAt?: { gte?: Date } };
  } | undefined;
  return input?.where?.createdAt?.gte;
}

describe("unified FINLIFE onlyNew completion evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProducts.mockResolvedValue([]);
    mocks.findSourceSnapshots.mockResolvedValue([]);
    mocks.findExternalProducts.mockResolvedValue([]);
    mocks.loadFinlifeSnapshot.mockReturnValue({
      meta: { generatedAt: "2026-07-10T12:00:00.000Z" },
      items: [],
    });
  });

  it("uses the completed DB sync snapshot timestamp instead of a newer runtime snapshot", async () => {
    mocks.findCompletionEvidence.mockResolvedValue({
      lastSyncedAt: new Date("2026-07-10T11:00:01.000Z"),
      ttlMs: 43_200_000,
      metaJson: {
        evidenceType: "finlife-prisma-product-sync",
        completionState: "complete",
        snapshotGeneratedAt: "2026-07-10T11:00:00.000Z",
      },
    });

    await finlifeUnifiedSourceLoader.query(QUERY_INPUT);

    expect(onlyNewThreshold()?.toISOString()).toBe("2026-07-10T11:00:00.000Z");
  });

  it("keeps the legacy snapshot threshold when completion evidence is absent", async () => {
    mocks.findCompletionEvidence.mockResolvedValue(null);

    await finlifeUnifiedSourceLoader.query(QUERY_INPUT);

    expect(onlyNewThreshold()?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });

  it("keeps the previous snapshot threshold while DB persistence is incomplete", async () => {
    mocks.findCompletionEvidence.mockResolvedValue({
      lastSyncedAt: new Date(0),
      ttlMs: 43_200_000,
      metaJson: {
        evidenceType: "finlife-prisma-product-sync",
        completionState: "db-complete",
        snapshotGeneratedAt: "2026-07-10T13:00:00.000Z",
      },
    });

    await finlifeUnifiedSourceLoader.query(QUERY_INPUT);

    expect(onlyNewThreshold()?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });

  it("keeps the query usable when completion evidence lookup fails", async () => {
    mocks.findCompletionEvidence.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(finlifeUnifiedSourceLoader.query(QUERY_INPUT)).resolves.toMatchObject({
      sourceId: "finlife",
      count: 0,
    });

    expect(onlyNewThreshold()?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(consoleError).toHaveBeenCalledWith(
      "[unified] finlife completion evidence unavailable",
      {
        kind: "deposit",
        message: "database unavailable",
      },
    );
    consoleError.mockRestore();
  });

  it("pushes provider, term, and minimum-rate filters into the FINLIFE database query", async () => {
    mocks.findCompletionEvidence.mockResolvedValue(null);

    await finlifeUnifiedSourceLoader.query({
      ...QUERY_INPUT,
      onlyNew: false,
      provider: "테스트은행",
      termMonths: 12,
      minRate: 3.5,
    });

    expect(mocks.findProducts).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: { is: { name: "테스트은행" } },
        options: {
          some: {
            saveTrm: "12",
            OR: [
              { intrRate2: { gte: 3.5 } },
              { AND: [{ intrRate2: null }, { intrRate: { gte: 3.5 } }] },
            ],
          },
        },
      }),
    }));
  });

  it("pushes the KDB provider into storage and bounds unsupported option filters after reading", async () => {
    mocks.findExternalProducts.mockResolvedValue([
      {
        id: 1,
        sourceId: "datago_kdb",
        kind: "deposit",
        externalKey: "KDB-6",
        providerNameRaw: "테스트은행",
        productNameRaw: "6개월 상품",
        summary: null,
        rawJson: { prdJinTrmCone: "6개월", lowIrtCndCone: "3.0", hitIrtCndCone: "4.0" },
        firstSeenAt: new Date("2026-07-10T00:00:00.000Z"),
        lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
        updatedAt: new Date("2026-07-11T00:00:00.000Z"),
        matches: [],
      },
      {
        id: 2,
        sourceId: "datago_kdb",
        kind: "deposit",
        externalKey: "KDB-12",
        providerNameRaw: "테스트은행",
        productNameRaw: "12개월 상품",
        summary: null,
        rawJson: { prdJinTrmCone: "12개월", lowIrtCndCone: "3.0", hitIrtCndCone: "4.0" },
        firstSeenAt: new Date("2026-07-10T00:00:00.000Z"),
        lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
        updatedAt: new Date("2026-07-11T00:00:00.000Z"),
        matches: [],
      },
    ]);

    const result = await datagoKdbUnifiedSourceLoader.query({
      ...QUERY_INPUT,
      onlyNew: false,
      provider: "테스트은행",
      termMonths: 12,
      minRate: 3.5,
    });

    expect(mocks.findExternalProducts).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ providerNameRaw: "테스트은행" }),
      take: 21,
    }));
    expect(result.items.map((item) => item.externalKey)).toEqual(["KDB-12"]);
  });

  it("returns an internal allowlisted recommendation detail only when explicitly requested", async () => {
    const oversizedJoinWay = "x".repeat(2_500);
    mocks.findProducts.mockResolvedValue([
      {
        id: 1,
        finPrdtCd: "D-DETAIL",
        name: "상세 예금",
        createdAt: new Date("2026-07-10T00:00:00.000Z"),
        updatedAt: new Date("2026-07-11T00:00:00.000Z"),
        raw: {
          fin_co_no: "001",
          kor_co_nm: "테스트은행",
          fin_prdt_nm: "상세 예금",
          join_way: oversizedJoinWay,
          join_member: "개인",
          join_deny: "제한 조건",
          spcl_cnd: "우대 조건",
          etc_note: { nested_secret: "NESTED_PRODUCT_SECRET" },
          mtrt_int: "만기 후 금리",
          internal_secret: "do-not-expose",
        },
        options: [{
          saveTrm: "12",
          intrRate: 3.1,
          intrRate2: 3.5,
          raw: {
            intr_rate_type_nm: "단리",
            rsrv_type_nm: "정액적립식",
            rsrv_type: ["NESTED_OPTION_SECRET"],
            internal_option_code: "SECRET",
          },
        }],
        provider: { name: "테스트은행" },
      },
    ]);

    const internal = await finlifeUnifiedSourceLoader.query({
      ...QUERY_INPUT,
      onlyNew: false,
      includeRecommendDetail: true,
    });
    expect(internal.items[0].recommendDetail).toEqual({
      finPrdtCd: "D-DETAIL",
      finCoNo: "001",
      productRaw: {
        join_way: `${oversizedJoinWay.slice(0, 1_999)}…`,
        join_member: "개인",
        join_deny: "제한 조건",
        spcl_cnd: "우대 조건",
        mtrt_int: "만기 후 금리",
      },
      options: [{
        saveTrm: "12",
        intrRate: 3.1,
        intrRate2: 3.5,
        raw: { intr_rate_type_nm: "단리", rsrv_type_nm: "정액적립식" },
      }],
      sourceUpdatedAt: "2026-07-11T00:00:00.000Z",
    });
    expect(JSON.stringify(internal.items[0].recommendDetail)).not.toContain("SECRET");
    expect(internal.items[0].recommendDetail?.productRaw.join_way).toHaveLength(2_000);
    expect(internal.items[0].recommendDetail?.productRaw.join_way).toMatch(/…$/);

    const publicResult = await finlifeUnifiedSourceLoader.query({
      ...QUERY_INPUT,
      onlyNew: false,
      includeRecommendDetail: false,
    });
    expect(publicResult.items[0]).not.toHaveProperty("recommendDetail");
  });
});
