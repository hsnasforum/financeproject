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
});
