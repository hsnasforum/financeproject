import { describe, expect, it, vi } from "vitest";
import {
  createRunRetentionStore,
  type RunRetentionStoreDependencies,
} from "../../src/lib/planning/store/runRetentionStore";

function entry(id: string, profileId: string, createdAt: string) {
  return { id, profileId, createdAt };
}

describe("planning run retention store", () => {
  it("deletes retention targets through injected delete boundary and returns successful removals", async () => {
    const listIndexEntries = vi.fn<RunRetentionStoreDependencies["listIndexEntries"]>(async () => [
      entry("new", "profile-1", "2026-07-04T00:03:00.000Z"),
      entry("mid", "profile-1", "2026-07-04T00:02:00.000Z"),
      entry("old", "profile-1", "2026-07-04T00:01:00.000Z"),
    ]);
    const deleteRun = vi.fn<RunRetentionStoreDependencies["deleteRun"]>(async (id) => id !== "mid");
    const store = createRunRetentionStore({
      defaultMaxPerProfile: 50,
      deleteRun,
      listIndexEntries,
    });

    await expect(store.purgeRunsByRetention({ maxPerProfile: 1 })).resolves.toEqual(["old"]);

    expect(listIndexEntries).toHaveBeenCalledTimes(1);
    expect(deleteRun).toHaveBeenCalledTimes(2);
    expect(deleteRun).toHaveBeenNthCalledWith(1, "mid");
    expect(deleteRun).toHaveBeenNthCalledWith(2, "old");
  });

  it("trims profile filters and falls back to the default max when max is invalid", async () => {
    const listIndexEntries = vi.fn<RunRetentionStoreDependencies["listIndexEntries"]>(async () => [
      entry("a-new", "a", "2026-07-04T00:03:00.000Z"),
      entry("a-old", "a", "2026-07-04T00:01:00.000Z"),
      entry("b-new", "b", "2026-07-04T00:03:00.000Z"),
      entry("b-old", "b", "2026-07-04T00:01:00.000Z"),
    ]);
    const deleteRun = vi.fn<RunRetentionStoreDependencies["deleteRun"]>(async () => true);
    const store = createRunRetentionStore({
      defaultMaxPerProfile: 1,
      deleteRun,
      listIndexEntries,
    });

    await expect(store.purgeRunsByRetention({
      profileId: " b ",
      maxPerProfile: Number.NaN,
    })).resolves.toEqual(["b-old"]);

    expect(deleteRun).toHaveBeenCalledTimes(1);
    expect(deleteRun).toHaveBeenCalledWith("b-old");
  });
});
