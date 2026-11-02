import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadShelfFromSnapshot,
  PRODUCT_SHELF_UPDATED_EVENT,
  productShelfConfig,
  toggleCompare,
} from "../src/lib/state/productShelf";

// Control for the loan list compare button: pins what toggleCompare already does so the planned
// notice cannot change the FIFO, same-id removal, id trimming, the two storage keys or the event.
// Synthetic ids only; no product data.
const D = ["finlife:deposit:0010001:D1", "finlife:deposit:0010001:D2", "finlife:deposit:0010001:D3", "finlife:deposit:0010001:D4"];
const L1 = "finlife:mortgage-loan:0010002:L1";

type Recorded = { setItem: [string, string][]; events: { type: string; detail: unknown }[] };

function installWindow(initial: Record<string, string>): Recorded {
  const store = new Map(Object.entries(initial));
  const recorded: Recorded = { setItem: [], events: [] };
  // The node test environment has no DOM; this is the smallest window productShelf reads and writes.
  vi.stubGlobal("CustomEvent", class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        recorded.setItem.push([key, value]);
        store.set(key, value);
      },
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      recorded.events.push({ type: event.type, detail: event.detail });
      return true;
    },
  });
  return recorded;
}

function v1(compareBasket: string[]): Record<string, string> {
  return {
    [productShelfConfig.storageKey]: JSON.stringify({ schemaVersion: 1, favorites: [], recentViewed: [], compareBasket }),
    [productShelfConfig.legacyCompareStorageKey]: JSON.stringify(compareBasket),
  };
}

function storedBaskets(recorded: Recorded) {
  const last = (key: string) => [...recorded.setItem].reverse().find(([entry]) => entry === key)?.[1] ?? null;
  return {
    shelf: (JSON.parse(last(productShelfConfig.storageKey) ?? "null") as { compareBasket: string[] } | null)?.compareBasket ?? null,
    legacy: JSON.parse(last(productShelfConfig.legacyCompareStorageKey) ?? "null") as string[] | null,
  };
}

describe("productShelf toggleCompare control (current behaviour)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the storage keys, limit and event name the notice relies on", () => {
    expect(productShelfConfig.storageKey).toBe("products_shelf_v1");
    expect(productShelfConfig.legacyCompareStorageKey).toBe("products_compare_ids_v1");
    expect(productShelfConfig.maxCompareBasket).toBe(4);
    expect(PRODUCT_SHELF_UPDATED_EVENT).toBe("products:shelf-updated");
  });

  it("ignores a blank id without writing when the stored shelf is already v1", () => {
    const recorded = installWindow(v1(D.slice(0, 3)));
    expect(toggleCompare("   ").compareBasket).toEqual(D.slice(0, 3));
    expect(recorded.setItem).toEqual([]);
    expect(recorded.events).toEqual([]);
  });

  it("appends a trimmed new id to a basket of three and writes both keys with one event", () => {
    const recorded = installWindow(v1(D.slice(0, 3)));
    expect(toggleCompare(`  ${L1}  `).compareBasket).toEqual([...D.slice(0, 3), L1]);
    expect(storedBaskets(recorded)).toEqual({ shelf: [...D.slice(0, 3), L1], legacy: [...D.slice(0, 3), L1] });
    expect(recorded.events).toEqual([{ type: PRODUCT_SHELF_UPDATED_EVENT, detail: { compareCount: 4, favoriteCount: 0 } }]);
  });

  it("removes the same id when it is already in the basket", () => {
    const recorded = installWindow(v1([...D.slice(0, 3), L1]));
    expect(toggleCompare(L1).compareBasket).toEqual(D.slice(0, 3));
    expect(storedBaskets(recorded)).toEqual({ shelf: D.slice(0, 3), legacy: D.slice(0, 3) });
    expect(recorded.events).toHaveLength(1);
  });

  it("silently drops the oldest id when a fifth one is added (FIFO) and returns no dropped information", () => {
    const recorded = installWindow(v1(D));
    const next = toggleCompare(L1);
    expect(next.compareBasket).toEqual([D[1], D[2], D[3], L1]);
    expect(Object.keys(next).sort()).toEqual(["compareBasket", "favorites", "recentViewed", "schemaVersion"]);
    expect(storedBaskets(recorded)).toEqual({ shelf: [D[1], D[2], D[3], L1], legacy: [D[1], D[2], D[3], L1] });
    expect(recorded.events).toEqual([{ type: PRODUCT_SHELF_UPDATED_EVENT, detail: { compareCount: 4, favoriteCount: 0 } }]);
  });

  it("migrates a legacy-only basket with its own write before toggling, so one click writes twice", () => {
    const recorded = installWindow({ [productShelfConfig.legacyCompareStorageKey]: JSON.stringify(D) });
    expect(toggleCompare(L1).compareBasket).toEqual([D[1], D[2], D[3], L1]);
    expect(recorded.events).toHaveLength(2);
    // A blank id is not write-free here either: loading still persists the migrated shelf.
    const blank = installWindow({ [productShelfConfig.legacyCompareStorageKey]: JSON.stringify(D) });
    expect(toggleCompare(" ").compareBasket).toEqual(D);
    expect(blank.events).toHaveLength(1);
  });

  it("reads the stored basket in order from the two raw values without writing", () => {
    const recorded = installWindow(v1(D));
    const read = loadShelfFromSnapshot(
      window.localStorage.getItem(productShelfConfig.storageKey),
      window.localStorage.getItem(productShelfConfig.legacyCompareStorageKey),
    );
    expect(read.compareBasket).toEqual(D);
    expect(loadShelfFromSnapshot(null, JSON.stringify(D)).compareBasket).toEqual(D);
    expect(recorded.setItem).toEqual([]);
    expect(recorded.events).toEqual([]);
  });
});
