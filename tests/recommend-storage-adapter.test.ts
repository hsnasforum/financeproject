import { describe, expect, it } from "vitest";
import {
  buildRecommendAutorunSignature,
  buildRecommendRequest,
  buildStoredRecommendProfile,
  buildStoredRecommendResult,
  parseStoredRecommendProfile,
  parseStoredRecommendResult,
  readRecommendAutorunSessionPayload,
  recommendAutorunSessionKey,
  recommendProfileStorageKey,
  recommendResultStorageKey,
  writeRecommendAutorunSessionPayload,
} from "../src/lib/recommend/recommendStorageAdapter";
import { isRecommendOwner, recommendOwnerId } from "../src/lib/recommend/ownerNamespace";
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
  it("builds and parses owner-scoped stored recommend result v2", () => {
    const ownerId = recommendOwnerId("alice");
    const profile = recommendProfileDefaults();
    const stored = buildStoredRecommendResult({
      ownerId,
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
    expect(parseStoredRecommendResult(ownerId, JSON.stringify(stored))).toEqual(stored);
  });

  it("handles autorun session payload and request build without a component", () => {
    const profile = recommendProfileDefaults();
    const storage = memoryStorage();
    const ownerId = recommendOwnerId("alice");
    const sig = buildRecommendAutorunSignature(profile);

    writeRecommendAutorunSessionPayload(ownerId, { sig, runId: "run-1" }, storage);

    expect(storage.getItem(recommendAutorunSessionKey(ownerId))).toContain("run-1");
    expect(readRecommendAutorunSessionPayload(ownerId, storage)).toEqual({ sig, runId: "run-1" });

    const request = buildRecommendRequest({ profile });
    expect(request.url).toBe(`/api/recommend?topN=${profile.topN}`);
    expect(request.init.method).toBe("POST");
    expect(request.init.body).toBe(JSON.stringify(profile));
  });

  it("isolates profile, result, and autorun state by owner without reading legacy globals", () => {
    const storage = memoryStorage();
    const alice = recommendOwnerId("alice");
    const bob = recommendOwnerId("bob");
    const aliceProfile = { ...recommendProfileDefaults(), topN: 3 };
    const bobProfile = { ...recommendProfileDefaults(), topN: 7 };
    const aliceStoredProfile = buildStoredRecommendProfile(alice, aliceProfile);
    const bobStoredProfile = buildStoredRecommendProfile(bob, bobProfile);
    const aliceResult = buildStoredRecommendResult({ ownerId: alice, profile: aliceProfile });
    const bobResult = buildStoredRecommendResult({ ownerId: bob, profile: bobProfile });

    storage.setItem("recommend_profile_v1", JSON.stringify(aliceProfile));
    storage.setItem("recommend_last_result_v1", JSON.stringify({ version: 1, profile: aliceProfile, items: [] }));
    storage.setItem("recommend_autorun_sig", JSON.stringify({ sig: "legacy", runId: "legacy-run" }));
    storage.setItem(recommendProfileStorageKey(alice), JSON.stringify(aliceStoredProfile));
    storage.setItem(recommendProfileStorageKey(bob), JSON.stringify(bobStoredProfile));
    storage.setItem(recommendResultStorageKey(alice), JSON.stringify(aliceResult));
    storage.setItem(recommendResultStorageKey(bob), JSON.stringify(bobResult));
    writeRecommendAutorunSessionPayload(alice, { sig: "alice-sig", runId: "alice-run" }, storage);
    writeRecommendAutorunSessionPayload(bob, { sig: "bob-sig", runId: "bob-run" }, storage);

    expect(parseStoredRecommendProfile(alice, storage.getItem(recommendProfileStorageKey(alice)))?.profile.topN).toBe(3);
    expect(parseStoredRecommendProfile(bob, storage.getItem(recommendProfileStorageKey(bob)))?.profile.topN).toBe(7);
    expect(parseStoredRecommendResult(alice, storage.getItem(recommendResultStorageKey(alice)))?.ownerId).toBe(alice);
    expect(parseStoredRecommendResult(bob, storage.getItem(recommendResultStorageKey(bob)))?.ownerId).toBe(bob);
    expect(readRecommendAutorunSessionPayload(alice, storage)).toEqual({ sig: "alice-sig", runId: "alice-run" });
    expect(readRecommendAutorunSessionPayload(bob, storage)).toEqual({ sig: "bob-sig", runId: "bob-run" });

    expect(parseStoredRecommendProfile(bob, storage.getItem(recommendProfileStorageKey(alice)))).toBeNull();
    expect(parseStoredRecommendResult(bob, storage.getItem(recommendResultStorageKey(alice)))).toBeNull();
    expect(isRecommendOwner(alice, "alice")).toBe(true);
    expect(isRecommendOwner(alice, "bob")).toBe(false);
    expect(isRecommendOwner(alice, undefined)).toBe(false);
    expect(storage.getItem("recommend_profile_v1")).not.toBeNull();
    expect(storage.getItem("recommend_last_result_v1")).not.toBeNull();
    expect(storage.getItem("recommend_autorun_sig")).not.toBeNull();
  });
});
