import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUnifiedSourceStatuses } from "../src/lib/sources/status";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  externalSourceSnapshot: {
    findUnique: vi.fn(),
  },
  externalProduct: {
    count: vi.fn(),
  },
}));
const finlifeMock = vi.hoisted(() => ({
  loadFinlifeSnapshot: vi.fn(),
  loadFinlifeSyncAttempt: vi.fn(),
}));

vi.mock("../src/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: finlifeMock.loadFinlifeSnapshot,
  loadFinlifeSyncAttempt: finlifeMock.loadFinlifeSyncAttempt,
}));

describe("getUnifiedSourceStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finlifeMock.loadFinlifeSnapshot.mockReturnValue(null);
    finlifeMock.loadFinlifeSyncAttempt.mockReturnValue(null);
    prismaMock.externalSourceSnapshot.findUnique.mockResolvedValue(null);
  });

  it("keeps source status response usable when DATAGO storage is not initialized", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const datago = rows.find((row) => row.sourceId === "datago_kdb");

    expect(rows).toHaveLength(3);
    expect(datago).toMatchObject({
      sourceId: "datago_kdb",
      kind: "deposit",
      lastSyncedAt: null,
      ageMs: null,
      isFresh: false,
      counts: 0,
      lastError: {
        message: "공공데이터 저장소가 아직 준비되지 않았습니다. 데이터 소스 설정에서 동기화를 다시 실행해주세요.",
      },
    });
    expect(datago?.lastAttemptAt).toEqual(expect.any(String));
    expect(prismaMock.externalSourceSnapshot.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.externalProduct.count).not.toHaveBeenCalled();
  });

  it("marks FINLIFE stale when an incomplete DB sync attempt exists", async () => {
    const now = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: {
            generatedAt: now,
            ttlMs: 43_200_000,
          },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    finlifeMock.loadFinlifeSyncAttempt.mockImplementation((kind: string) => kind === "deposit"
      ? {
          status: "failed",
          phase: "snapshot",
          startedAt: now,
          updatedAt: now,
          errorCode: "SNAPSHOT_WRITE_FAILED",
        }
      : null);
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => input.where.sourceId_kind.kind === "deposit"
      ? {
          lastSyncedAt: new Date(now),
          ttlMs: 43_200_000,
          metaJson: {
            evidenceType: "finlife-prisma-product-sync",
            completionState: "complete",
            completionRate: 1,
            truncatedByHardCap: false,
            source: "finlife",
            fallbackUsed: false,
            lastAttemptAt: now,
          },
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: now,
      lastAttemptAt: now,
      isFresh: false,
      counts: 1,
      lastError: {
        at: now,
        message: "FINLIFE 동기화가 완료되지 않았습니다. 표시 데이터와 상태 시점이 다를 수 있으니 동기화를 다시 실행해주세요.",
      },
    });
  });

  it("keeps legacy snapshot status until the first completion evidence exists", async () => {
    const generatedAt = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: {
            generatedAt,
            ttlMs: 43_200_000,
            completionRate: 1,
            truncatedByHardCap: false,
            source: "finlife",
            fallbackUsed: false,
          },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: generatedAt,
      isFresh: true,
      counts: 1,
    });
    expect(finlife?.lastError).toBeUndefined();
  });

  it.each([
    ["low completion", { completionRate: 0.8, truncatedByHardCap: false, source: "finlife", fallbackUsed: false }],
    ["hard-cap truncation", { completionRate: 1, truncatedByHardCap: true, source: "finlife", fallbackUsed: false }],
    ["mock fallback", { completionRate: 1, truncatedByHardCap: false, source: "mock", fallbackUsed: true }],
  ])("does not mark legacy %s snapshots as fresh", async (_label, snapshotMeta) => {
    const generatedAt = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: {
            generatedAt,
            ttlMs: 43_200_000,
            ...snapshotMeta,
          },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: generatedAt,
      isFresh: false,
      counts: 1,
    });
    expect(finlife?.lastError).toBeUndefined();
  });

  it("uses complete FINLIFE evidence for freshness while preserving snapshot counts", async () => {
    const completedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: { generatedAt: startedAt, ttlMs: 43_200_000 },
          items: [
            { fin_prdt_cd: "FIN-001" },
            { fin_prdt_cd: "FIN-002" },
          ],
        }
      : null);
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => input.where.sourceId_kind.kind === "deposit"
      ? {
          lastSyncedAt: new Date(completedAt),
          ttlMs: 43_200_000,
          metaJson: {
            evidenceType: "finlife-prisma-product-sync",
            completionState: "complete",
            completionRate: 1,
            truncatedByHardCap: false,
            source: "finlife",
            fallbackUsed: false,
            lastAttemptAt: completedAt,
            lastRun: {
              startedAt,
              finishedAt: completedAt,
              fetchedItems: 7,
              upsertedItems: 6,
              resultCode: "OK",
            },
          },
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: completedAt,
      lastAttemptAt: completedAt,
      isFresh: true,
      counts: 2,
      lastRun: {
        startedAt,
        finishedAt: completedAt,
        fetchedItems: 7,
        upsertedItems: 6,
        resultCode: "OK",
      },
    });
  });

  it("keeps db-complete evidence stale without over-reporting a failure", async () => {
    const dbCompletedAt = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: { generatedAt: dbCompletedAt, ttlMs: 43_200_000 },
          items: [{ fin_prdt_cd: "PREVIOUS-001" }],
        }
      : null);
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => input.where.sourceId_kind.kind === "deposit"
      ? {
          lastSyncedAt: new Date(0),
          ttlMs: 43_200_000,
          metaJson: {
            evidenceType: "finlife-prisma-product-sync",
            completionState: "db-complete",
            lastAttemptAt: dbCompletedAt,
            lastRun: {
              startedAt: dbCompletedAt,
              fetchedItems: 4,
              upsertedItems: 4,
              resultCode: "DB_COMPLETED",
            },
          },
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: null,
      lastAttemptAt: dbCompletedAt,
      ageMs: null,
      isFresh: false,
      counts: 1,
      lastRun: {
        resultCode: "DB_COMPLETED",
      },
    });
    expect(finlife?.lastError).toBeUndefined();
  });

  it.each([
    ["low completion", { completionRate: 0.8, truncatedByHardCap: false, source: "finlife", fallbackUsed: false }],
    ["hard-cap truncation", { completionRate: 1, truncatedByHardCap: true, source: "finlife", fallbackUsed: false }],
    ["mock fallback", { completionRate: 1, truncatedByHardCap: false, source: "mock", fallbackUsed: true }],
  ])("does not mark %s evidence as fresh", async (_label, evidenceMeta) => {
    const completedAt = new Date().toISOString();
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => input.where.sourceId_kind.kind === "deposit"
      ? {
          lastSyncedAt: new Date(completedAt),
          ttlMs: 43_200_000,
          metaJson: {
            evidenceType: "finlife-prisma-product-sync",
            completionState: "complete",
            ...evidenceMeta,
            lastAttemptAt: completedAt,
          },
        }
      : null);
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: { generatedAt: completedAt, ttlMs: 43_200_000 },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: completedAt,
      isFresh: false,
      counts: 1,
    });
    expect(finlife?.lastError).toBeUndefined();
  });

  it("keeps the status route usable when FINLIFE evidence lookup fails", async () => {
    const generatedAt = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: {
            generatedAt,
            ttlMs: 43_200_000,
            completionRate: 1,
            truncatedByHardCap: false,
            source: "finlife",
            fallbackUsed: false,
          },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => {
      if (input.where.sourceId_kind.kind === "deposit") throw new Error("database unavailable");
      return null;
    });
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(rows).toHaveLength(3);
    expect(finlife).toMatchObject({
      lastSyncedAt: generatedAt,
      isFresh: false,
      counts: 1,
      lastError: {
        message: "FINLIFE 상품 저장소 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.",
      },
    });
    expect(finlife?.lastAttemptAt).toBeUndefined();
  });

  it("falls back to the legacy snapshot when the evidence table is missing", async () => {
    const generatedAt = new Date().toISOString();
    finlifeMock.loadFinlifeSnapshot.mockImplementation((kind: string) => kind === "deposit"
      ? {
          meta: {
            generatedAt,
            ttlMs: 43_200_000,
            completionRate: 1,
            truncatedByHardCap: false,
            source: "finlife",
            fallbackUsed: false,
          },
          items: [{ fin_prdt_cd: "FIN-001" }],
        }
      : null);
    prismaMock.externalSourceSnapshot.findUnique.mockImplementation(async (input: {
      where: { sourceId_kind: { sourceId: string; kind: string } };
    }) => {
      if (input.where.sourceId_kind.kind === "deposit") {
        throw new Error("The table `main.ExternalSourceSnapshot` does not exist in the current database.");
      }
      return null;
    });
    prismaMock.$queryRaw.mockResolvedValue([]);

    const rows = await getUnifiedSourceStatuses();
    const finlife = rows.find((row) => row.sourceId === "finlife" && row.kind === "deposit");

    expect(finlife).toMatchObject({
      lastSyncedAt: generatedAt,
      isFresh: true,
      counts: 1,
    });
    expect(finlife?.lastAttemptAt).toBeUndefined();
    expect(finlife?.lastError).toBeUndefined();
  });
});
