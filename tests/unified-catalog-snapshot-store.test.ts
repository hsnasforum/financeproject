import { describe, expect, it, vi } from "vitest";
import {
  BoundedCatalogSnapshotStore,
  decodeUnifiedCatalogPageCursor,
  encodeUnifiedCatalogPageCursor,
} from "../src/lib/sources/unifiedCatalogSnapshotStore";

type Snapshot = {
  signature: string;
  items: Array<{ id: string }>;
};

function snapshot(signature: string, rows: number): Snapshot {
  return {
    signature,
    items: Array.from({ length: rows }, (_, index) => ({ id: `${signature}-${index}` })),
  };
}

function createStore(input: Partial<{
  ttlMs: number;
  maxSnapshots: number;
  maxRetainedRows: number;
  maxEstimatedBytes: number;
  now: () => number;
  estimateBytes: (value: Snapshot) => number;
  createId: () => string;
  schedule: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  cancel: (handle: ReturnType<typeof setInterval>) => void;
}> = {}) {
  let id = 0;
  return new BoundedCatalogSnapshotStore<Snapshot>({
    ttlMs: input.ttlMs ?? 1_000,
    sweepIntervalMs: 100,
    maxSnapshots: input.maxSnapshots ?? 4,
    maxRetainedRows: input.maxRetainedRows ?? 100,
    maxEstimatedBytes: input.maxEstimatedBytes ?? 1_000,
    now: input.now,
    estimateBytes: input.estimateBytes ?? ((value) => value.items.length * 10),
    createId: input.createId ?? (() => `snapshot-${++id}`),
    schedule: input.schedule,
    cancel: input.cancel,
  });
}

describe("bounded unified catalog snapshot store", () => {
  it("uses a signed opaque page cursor with only snapshot identity and offset", () => {
    const cursor = encodeUnifiedCatalogPageCursor({ snapshotId: "snapshot-123", offset: 40 });
    const [payload, mac] = cursor.split(".");
    const tamperedMac = `${mac.startsWith("a") ? "b" : "a"}${mac.slice(1)}`;

    expect(decodeUnifiedCatalogPageCursor(cursor)).toEqual({ snapshotId: "snapshot-123", offset: 40 });
    expect(decodeUnifiedCatalogPageCursor(`${payload}.${tamperedMac}`)).toBeNull();
    expect(decodeUnifiedCatalogPageCursor("not-a-cursor")).toBeNull();
    expect(JSON.stringify(decodeUnifiedCatalogPageCursor(cursor))).not.toContain("items");
  });

  it("reuses one snapshot per signature without retaining page cursor state", () => {
    const store = createStore();
    const first = store.put(snapshot("same", 3));
    const repeated = store.put(snapshot("same", 9));

    expect(first.stored).toBe(true);
    expect(repeated.stored).toBe(true);
    if (!first.stored || !repeated.stored) throw new Error("snapshot should be stored");
    expect(repeated.reused).toBe(true);
    expect(repeated.entry.id).toBe(first.entry.id);
    expect(store.stats()).toEqual({
      snapshotCount: 1,
      retainedCursorCount: 0,
      retainedRows: 3,
      estimatedBytes: 30,
      lruSnapshotIds: [first.entry.id],
    });
    store.dispose();
  });

  it("evicts the least recently used snapshot when the count budget is full", () => {
    const store = createStore({ maxSnapshots: 2 });
    const first = store.put(snapshot("first", 1));
    const second = store.put(snapshot("second", 1));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)?.value.signature).toBe("first");
    const third = store.put(snapshot("third", 1));
    if (!third.stored) throw new Error("snapshot should be stored");

    expect(store.getById(second.entry.id)).toBeNull();
    expect(store.getById(first.entry.id)?.value.signature).toBe("first");
    expect(store.getById(third.entry.id)?.value.signature).toBe("third");
    store.dispose();
  });

  it("enforces the aggregate row budget and rejects one row-oversized snapshot", () => {
    const store = createStore({
      maxRetainedRows: 4,
      maxEstimatedBytes: 1_000,
    });
    const first = store.put(snapshot("first", 2));
    const second = store.put(snapshot("second", 3));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)).toBeNull();
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 3,
      estimatedBytes: 30,
    }));

    const oversized = store.put(snapshot("oversized", 5));
    expect(oversized).toEqual({
      stored: false,
      reason: "SNAPSHOT_RESOURCE_LIMIT",
      retainedRows: 5,
      estimatedBytes: 50,
    });
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 3,
      estimatedBytes: 30,
    }));
    store.dispose();
  });

  it("enforces the aggregate estimated-byte budget and rejects one byte-oversized snapshot", () => {
    const store = createStore({
      maxRetainedRows: 100,
      maxEstimatedBytes: 35,
    });
    const first = store.put(snapshot("first", 2));
    const second = store.put(snapshot("second", 2));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)).toBeNull();
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 2,
      estimatedBytes: 20,
    }));

    const oversized = store.put(snapshot("oversized", 4));
    expect(oversized).toEqual({
      stored: false,
      reason: "SNAPSHOT_RESOURCE_LIMIT",
      retainedRows: 4,
      estimatedBytes: 40,
    });
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 2,
      estimatedBytes: 20,
    }));
    store.dispose();
  });

  it("keeps repeated large inserts inside the aggregate retained-resource ceiling", () => {
    const store = createStore({
      maxSnapshots: 10,
      maxRetainedRows: 5,
      maxEstimatedBytes: 50,
    });

    for (let index = 0; index < 10; index += 1) {
      expect(store.put(snapshot(`large-${index}`, 2)).stored).toBe(true);
      expect(store.stats().retainedRows).toBeLessThanOrEqual(5);
      expect(store.stats().estimatedBytes).toBeLessThanOrEqual(50);
    }

    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 2,
      retainedRows: 4,
      estimatedBytes: 40,
      retainedCursorCount: 0,
    }));
    store.dispose();
  });

  it("actively sweeps expired snapshots with an unref timer", () => {
    let now = 0;
    let sweep: (() => void) | undefined;
    const unref = vi.fn();
    const cancel = vi.fn();
    const timer = { unref } as unknown as ReturnType<typeof setInterval>;
    const store = createStore({
      ttlMs: 100,
      now: () => now,
      schedule: (callback) => {
        sweep = callback;
        return timer;
      },
      cancel,
    });

    expect(store.put(snapshot("expiring", 1)).stored).toBe(true);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(store.stats().snapshotCount).toBe(1);

    now = 101;
    sweep?.();

    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      retainedRows: 0,
      estimatedBytes: 0,
    }));
    expect(cancel).toHaveBeenCalledWith(timer);
    store.dispose();
  });
});
