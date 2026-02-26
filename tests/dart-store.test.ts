import { describe, expect, it } from "vitest";
import {
  add,
  addFavorite,
  dartStoreConfig,
  isFavorite,
  list,
  listFavorites,
  listRecent,
  pushRecent,
  remove,
  removeFavorite,
} from "../src/lib/dart/dartStore";

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

describe("dartStore favorites/recent", () => {
  it("adds/removes favorites and checks membership", () => {
    const storage = createStorage();
    expect(listFavorites(storage)).toEqual([]);
    expect(isFavorite("00126380", storage)).toBe(false);

    addFavorite({ corpCode: "00126380", corpName: "삼성전자" }, storage);
    addFavorite({ corpCode: "00164779", corpName: "삼성물산" }, storage);

    expect(isFavorite("00126380", storage)).toBe(true);
    expect(listFavorites(storage).map((item) => item.corpCode)).toEqual(["00164779", "00126380"]);
    expect(storage.getItem(dartStoreConfig.favoritesKey)).not.toBeNull();

    removeFavorite("00126380", storage);
    expect(isFavorite("00126380", storage)).toBe(false);
    expect(listFavorites(storage).map((item) => item.corpCode)).toEqual(["00164779"]);
  });

  it("supports alias api add/remove/list", () => {
    const storage = createStorage();
    add({ corpCode: "00126380", corpName: "삼성전자" }, storage);
    add({ corpCode: "00164779", corpName: "삼성물산" }, storage);
    expect(list(storage).map((item) => item.corpCode)).toEqual(["00164779", "00126380"]);

    remove("00164779", storage);
    expect(list(storage).map((item) => item.corpCode)).toEqual(["00126380"]);
  });

  it("pushes recent with dedupe and max 20", () => {
    const storage = createStorage();
    for (let i = 0; i < 24; i += 1) {
      const corpCode = String(10000000 + i);
      pushRecent({ corpCode, corpName: `회사${i}` }, storage);
    }

    const recent = listRecent(storage);
    expect(recent.length).toBe(20);
    expect(recent[0]?.corpCode).toBe("10000023");
    expect(recent[19]?.corpCode).toBe("10000004");

    pushRecent({ corpCode: "10000010", corpName: "회사10-갱신" }, storage);
    const deduped = listRecent(storage);
    expect(deduped.length).toBe(20);
    expect(deduped[0]?.corpCode).toBe("10000010");
    expect(deduped.filter((item) => item.corpCode === "10000010")).toHaveLength(1);
  });
});
