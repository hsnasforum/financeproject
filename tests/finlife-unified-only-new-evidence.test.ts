import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFinlifeSnapshot: vi.fn(),
  findCompletionEvidence: vi.fn(),
  findProducts: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    externalSourceSnapshot: {
      findUnique: mocks.findCompletionEvidence,
    },
    product: {
      findMany: mocks.findProducts,
    },
  },
}));

vi.mock("@/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: mocks.loadFinlifeSnapshot,
  loadFinlifeSyncAttempt: vi.fn(),
}));

import { finlifeUnifiedSourceLoader } from "../src/lib/sources/unifiedLoaders";

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
