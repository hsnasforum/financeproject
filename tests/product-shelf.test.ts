import { afterEach, describe, expect, it } from "vitest";
import {
  loadShelf,
  migrateProductShelf,
  productShelfConfig,
  saveShelf,
  type ProductShelfState,
} from "../src/lib/state/productShelf";

describe("productShelf load/save/migrate", () => {
  it("loads empty shelf for malformed input", () => {
    const loaded = loadShelf("{bad-json");
    expect(loaded.schemaVersion).toBe(productShelfConfig.schemaVersion);
    expect(loaded.favorites.size).toBe(0);
    expect(loaded.recentViewed).toEqual([]);
    expect(loaded.compareBasket).toEqual([]);
  });

  it("migrates legacy v0 fields into v1 shape", () => {
    const migrated = migrateProductShelf({
      favorites: ["A", "A", "B"],
      recentViewed: ["p1", "p2"],
      compareIds: ["x", "y", "y"],
    });
    expect(migrated.schemaVersion).toBe(1);
    expect([...migrated.favorites]).toEqual(["A", "B"]);
    expect(migrated.recentViewed).toEqual(["p1", "p2"]);
    expect(migrated.compareBasket).toEqual(["x", "y"]);
  });

  it("saves and loads with max recent/compare limits", () => {
    const input: ProductShelfState = {
      schemaVersion: 1,
      favorites: new Set(["fav-a", "fav-b"]),
      recentViewed: Array.from({ length: 35 }).map((_, idx) => `r${idx + 1}`),
      compareBasket: ["c1", "c2", "c3", "c4", "c5"],
    };
    const raw = saveShelf(input);
    const loaded = loadShelf(raw);

    expect([...loaded.favorites]).toEqual(["fav-a", "fav-b"]);
    expect(loaded.recentViewed).toHaveLength(productShelfConfig.maxRecentViewed);
    expect(loaded.recentViewed[0]).toBe("r6");
    expect(loaded.compareBasket).toEqual(["c2", "c3", "c4", "c5"]);
  });
});

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    return;
  }
  Reflect.deleteProperty(globalThis, "window");
});
