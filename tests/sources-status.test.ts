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
    expect(prismaMock.externalSourceSnapshot.findUnique).not.toHaveBeenCalled();
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
        message: "FINLIFE 동기화가 완료되지 않았습니다. 이전 데이터는 유지되며 동기화를 다시 실행해주세요.",
      },
    });
  });
});
