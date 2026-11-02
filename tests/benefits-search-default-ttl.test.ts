import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reader = vi.hoisted(() => ({ getSnapshotOrNull: vi.fn() }));
vi.mock("../src/lib/publicApis/benefitsSnapshot", () => reader);
import { GET } from "../src/app/api/public/benefits/search/route";
const { isSnapshotFresh } = await vi.importActual<typeof import("../src/lib/publicApis/benefitsSnapshot")>("../src/lib/publicApis/benefitsSnapshot");

describe("benefits search default snapshot TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
    reader.getSnapshotOrNull.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  async function search(query: string, ageMs = 36_000_000) {
    const generatedAt = new Date(Date.now() - ageMs).toISOString();
    reader.getSnapshotOrNull.mockImplementation(({ ttlMs }: { ttlMs: number }) => ({
      fromCache: "disk",
      isStale: !isSnapshotFresh(generatedAt, ttlMs),
      snapshot: {
        meta: { generatedAt, totalItemsInSnapshot: 0, uniqueCount: 0, completionRate: 1 },
        items: [],
      },
    }));
    const response = await GET(new Request(`http://localhost/api/public/benefits/search?scan=all${query}`));
    expect(response.status).toBe(200);
    return await response.json() as { meta: { snapshot: { isStale: boolean } } };
  }

  it.each(["", "&snapshotTtlSec=", "&snapshotTtlSec=%20%20"])("uses the two-day policy for omitted or blank TTL: %s", async (query) => {
    const result = await search(query);
    expect(reader.getSnapshotOrNull).toHaveBeenCalledWith({ ttlMs: 172_800_000 });
    expect(result.meta.snapshot.isStale).toBe(false);
  });
  it.each([
    ["60", 60_000], ["1", 60_000], ["9999999", 604_800_000], ["invalid", 172_800_000],
  ])("preserves the explicit/clamped/invalid TTL contract: %s", async (value, ttlMs) => {
    await search(`&snapshotTtlSec=${value}`);
    expect(reader.getSnapshotOrNull).toHaveBeenCalledWith({ ttlMs });
  });
  it.each([[172_800_000, false], [172_800_001, true]] as const)("uses the real freshness boundary at %i ms", async (age, stale) => {
    expect((await search("", age)).meta.snapshot.isStale).toBe(stale);
  });
});
