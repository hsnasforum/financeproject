import { describe, expect, it } from "vitest";

import {
  createProductShelfStorageSnapshot,
  projectProductShelfStorageSnapshot,
} from "../src/components/products/useProductShelfController";

describe("product shelf controller projection", () => {
  it("projects current storage with the existing normalization and compare limit", () => {
    const currentRaw = JSON.stringify({
      schemaVersion: 1,
      favorites: ["favorite-a", "favorite-a", "favorite-b"],
      recentViewed: ["recent-a", "recent-b"],
      compareBasket: ["compare-a", "compare-b", "compare-c", "compare-d", "compare-e"],
    });
    const snapshot = createProductShelfStorageSnapshot(currentRaw, null);
    const projection = projectProductShelfStorageSnapshot(snapshot);

    expect(JSON.parse(snapshot)).toEqual([currentRaw, null]);
    expect([...projection.favoriteIds]).toEqual(["favorite-a", "favorite-b"]);
    expect(projection.recentViewed).toEqual(["recent-a", "recent-b"]);
    expect([...projection.comparedIds]).toEqual(["compare-b", "compare-c", "compare-d", "compare-e"]);
    expect(projection.compareCount).toBe(4);
    expect(projection.compareLimit).toBe(4);
  });

  it("keeps the legacy compare fallback when current storage is absent", () => {
    const snapshot = createProductShelfStorageSnapshot(
      null,
      JSON.stringify(["legacy-a", "legacy-b", "legacy-b"]),
    );
    const projection = projectProductShelfStorageSnapshot(snapshot);

    expect([...projection.comparedIds]).toEqual(["legacy-a", "legacy-b"]);
    expect(projection.compareCount).toBe(2);
  });

  it("returns an empty projection for a malformed controller snapshot", () => {
    const projection = projectProductShelfStorageSnapshot("not-json");

    expect([...projection.favoriteIds]).toEqual([]);
    expect([...projection.comparedIds]).toEqual([]);
    expect(projection.recentViewed).toEqual([]);
    expect(projection.compareCount).toBe(0);
  });
});
