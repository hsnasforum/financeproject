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

vi.mock("../src/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/lib/finlife/snapshot", () => ({
  loadFinlifeSnapshot: vi.fn(() => null),
}));

describe("getUnifiedSourceStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
