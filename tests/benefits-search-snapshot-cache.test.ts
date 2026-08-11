import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

const mocked = vi.hoisted(() => ({
  getSnapshotOrNull: vi.fn(),
}));

vi.mock("../src/lib/publicApis/benefitsSnapshot", () => ({
  getSnapshotOrNull: mocked.getSnapshotOrNull,
}));

import { GET } from "../src/app/api/public/benefits/search/route";

function makeItem(id: string): BenefitCandidate {
  return {
    id,
    title: `혜택 ${id}`,
    summary: "저장된 혜택 설명",
    eligibilityHints: [],
    region: { scope: "NATIONWIDE", tags: ["전국"] },
    source: "gov24",
    fetchedAt: "2026-08-11T00:00:00.000Z",
  };
}

function makeSnapshot(id: string, isStale: boolean) {
  return {
    fromCache: "memory" as const,
    isStale,
    snapshot: {
      meta: {
        generatedAt: "2026-08-11T00:00:00.000Z",
        totalItemsInSnapshot: 1,
        uniqueCount: 1,
        completionRate: 1,
      },
      items: [makeItem(id)],
    },
  };
}

async function call(snapshotTtlSec: number) {
  const response = await GET(new Request(
    `http://localhost/api/public/benefits/search?scan=all&snapshotTtlSec=${snapshotTtlSec}`,
  ));
  return await response.json() as {
    data?: { items?: Array<{ id?: string }> };
    meta?: { cache?: string; snapshot?: { isStale?: boolean } };
  };
}

describe("benefits snapshot search cache", () => {
  beforeEach(() => {
    mocked.getSnapshotOrNull.mockReset();
  });

  it("does not let the result cache hide snapshot replacement or a custom TTL stale transition", async () => {
    mocked.getSnapshotOrNull
      .mockReturnValueOnce(makeSnapshot("old", false))
      .mockReturnValueOnce(makeSnapshot("new", true));

    const longTtl = await call(7 * 24 * 60 * 60);
    const shortTtl = await call(60);

    expect(mocked.getSnapshotOrNull).toHaveBeenNthCalledWith(1, { ttlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(mocked.getSnapshotOrNull).toHaveBeenNthCalledWith(2, { ttlMs: 60 * 1000 });
    expect(longTtl.data?.items?.[0]?.id).toBe("old");
    expect(longTtl.meta?.snapshot?.isStale).toBe(false);
    expect(longTtl.meta?.cache).toBe("bypass");
    expect(shortTtl.data?.items?.[0]?.id).toBe("new");
    expect(shortTtl.meta?.snapshot?.isStale).toBe(true);
    expect(shortTtl.meta?.cache).toBe("bypass");
  });
});
