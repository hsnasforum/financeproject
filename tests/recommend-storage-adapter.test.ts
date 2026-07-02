import { describe, expect, it } from "vitest";
import {
  buildRecommendAutorunSignature,
  buildRecommendRequest,
  buildStoredRecommendResult,
  parseStoredRecommendResult,
  readRecommendAutorunSessionPayload,
  RECOMMEND_AUTORUN_SIG_SESSION_KEY,
  writeRecommendAutorunSessionPayload,
} from "../src/lib/recommend/recommendStorageAdapter";
import { defaults as recommendProfileDefaults } from "../src/lib/schemas/recommendProfile";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("recommend storage adapter", () => {
  it("builds and parses stored recommend result v1", () => {
    const profile = recommendProfileDefaults();
    const stored = buildStoredRecommendResult({
      profile,
      meta: { kind: "deposit" },
      now: new Date("2026-07-01T00:00:00.000Z"),
      items: [
        {
          sourceId: "finlife",
          finPrdtCd: "P1",
          productName: "테스트 예금",
          providerName: "테스트 은행",
          selectedOption: { appliedRate: 3.45, saveTrm: null, termMonths: 12 },
        },
      ],
    });

    expect(stored.items[0]).toMatchObject({
      key: "finlife::P1",
      rank: 1,
      saveTrm: "12",
    });
    expect(parseStoredRecommendResult(JSON.stringify(stored))).toEqual(stored);
  });

  it("handles autorun session payload and request build without a component", () => {
    const profile = recommendProfileDefaults();
    const storage = memoryStorage();
    const sig = buildRecommendAutorunSignature(profile);

    writeRecommendAutorunSessionPayload({ sig, runId: "run-1" }, storage);

    expect(storage.getItem(RECOMMEND_AUTORUN_SIG_SESSION_KEY)).toContain("run-1");
    expect(readRecommendAutorunSessionPayload(storage)).toEqual({ sig, runId: "run-1" });

    const request = buildRecommendRequest({ profile });
    expect(request.url).toBe(`/api/recommend?topN=${profile.topN}`);
    expect(request.init.method).toBe("POST");
    expect(request.init.body).toBe(JSON.stringify(profile));
  });
});
