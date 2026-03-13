import { describe, expect, it } from "vitest";
import {
  dartDisclosureStoreConfig,
  diffNew,
  getDisclosureMonitorView,
  getDisclosureSettings,
  getLastCheckedAt,
  listSeenReceiptNos,
  markSeen,
  setDisclosureMonitorView,
  setDisclosureSettings,
  type DisclosureLikeItem,
} from "../src/lib/dart/dartDisclosureStore";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) ?? null : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function list(...receiptNos: string[]): DisclosureLikeItem[] {
  return receiptNos.map((rcept_no) => ({ rcept_no }));
}

describe("dartDisclosureStore", () => {
  it("detects new disclosures by receipt number and marks seen", () => {
    const storage = createStorage();
    const corpCode = "00126380";

    const firstList = list("20260225000001", "20260225000002");
    expect(diffNew(corpCode, firstList, storage).newItems.map((item) => item.rcept_no)).toEqual([
      "20260225000001",
      "20260225000002",
    ]);

    markSeen(corpCode, firstList, storage, "2026-02-25T10:00:00.000Z");
    expect(listSeenReceiptNos(corpCode, storage)).toEqual([
      "20260225000001",
      "20260225000002",
    ]);
    expect(getLastCheckedAt(corpCode, storage)).toBe("2026-02-25T10:00:00.000Z");

    expect(diffNew(corpCode, firstList, storage).newItems).toEqual([]);
    expect(diffNew(corpCode, firstList, storage).seenItems.map((item) => item.rcept_no)).toEqual([
      "20260225000001",
      "20260225000002",
    ]);

    const secondList = list("20260225000002", "20260225000003");
    expect(diffNew(corpCode, secondList, storage).newItems.map((item) => item.rcept_no)).toEqual([
      "20260225000003",
    ]);
    expect(diffNew(corpCode, secondList, storage).seenItems.map((item) => item.rcept_no)).toEqual([
      "20260225000002",
    ]);
  });

  it("limits seen receipt numbers and persists settings", () => {
    const storage = createStorage();
    const corpCode = "00126380";
    const largeList = Array.from({ length: dartDisclosureStoreConfig.maxSeenPerCorp + 20 }, (_, index) => ({
      receiptNo: `R${String(index + 1).padStart(5, "0")}`,
    }));
    markSeen(corpCode, largeList, storage);

    const seen = listSeenReceiptNos(corpCode, storage);
    expect(seen.length).toBe(dartDisclosureStoreConfig.maxSeenPerCorp);
    expect(seen[0]).toBe("R00001");

    const next = setDisclosureSettings(
      {
        from: "2026-01-01",
        to: "2026-02-25",
        type: "A",
        finalOnly: false,
        pageCount: 55,
      },
      storage,
    );
    expect(next.from).toBe("2026-01-01");
    expect(next.to).toBe("2026-02-25");
    expect(next.type).toBe("A");
    expect(next.finalOnly).toBe(false);
    expect(next.pageCount).toBe(55);

    const restored = getDisclosureSettings(storage);
    expect(restored).toEqual(next);
  });

  it("persists monitor view preferences separately from api filter settings", () => {
    const storage = createStorage();

    expect(getDisclosureMonitorView(storage)).toEqual({ focusMode: "all" });

    const nextView = setDisclosureMonitorView({ focusMode: "unchecked" }, storage);
    expect(nextView).toEqual({ focusMode: "unchecked" });
    expect(getDisclosureMonitorView(storage)).toEqual({ focusMode: "unchecked" });

    expect(getDisclosureSettings(storage)).toEqual({
      finalOnly: true,
      pageCount: 20,
    });
  });

  it("keeps legacy showPendingOnly view state readable", () => {
    const storage = createStorage();
    storage.setItem("dart_disclosure_store_v1", JSON.stringify({
      seenReceiptNos: {},
      lastCheckedAt: {},
      settings: {
        finalOnly: true,
        pageCount: 20,
      },
      view: {
        showPendingOnly: true,
      },
    }));

    expect(getDisclosureMonitorView(storage)).toEqual({ focusMode: "pending" });
  });
});
