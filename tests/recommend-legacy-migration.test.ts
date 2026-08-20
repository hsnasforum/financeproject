import { describe, expect, it } from "vitest";
import {
  buildLegacyRecommendBackupRestore,
  buildLegacyRecommendMigration,
  countLegacyRecommendStorageEntries,
  LEGACY_RECOMMEND_PROFILE_KEY,
  LEGACY_RECOMMEND_RESULT_KEY,
  LEGACY_RECOMMEND_SAVED_RUNS_KEY,
  migrateLegacyRecommendStorage,
} from "../src/lib/recommend/legacyStorageMigration";
import {
  recommendOwnerId,
  recommendOwnerStorageKey,
} from "../src/lib/recommend/ownerNamespace";
import {
  buildStoredRecommendProfile,
  parseStoredRecommendProfile,
  parseStoredRecommendResult,
  recommendProfileStorageKey,
  recommendResultStorageKey,
} from "../src/lib/recommend/recommendStorageAdapter";
import { defaults as recommendProfileDefaults } from "../src/lib/schemas/recommendProfile";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
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

function legacyRun(runId: string, ownerId?: string) {
  return {
    ...(ownerId ? { ownerId } : {}),
    runId,
    savedAt: "2026-07-01T00:00:00.000Z",
    profile: recommendProfileDefaults(),
    items: [{
      unifiedId: `finlife:${runId}`,
      providerName: "테스트 은행",
      productName: "테스트 예금",
      kind: "deposit",
      termMonths: 12,
      appliedRate: 3.2,
      rank: 1,
      finalScore: 0.8,
    }],
  };
}

function legacyResult(userId?: string) {
  return {
    version: 1,
    savedAt: "2026-07-01T00:00:00.000Z",
    profile: recommendProfileDefaults(),
    meta: userId ? { userId } : {},
    items: [{
      key: "finlife::P1",
      sourceId: "finlife",
      finPrdtCd: "P1",
      productName: "테스트 예금",
      providerName: "테스트 은행",
      rank: 1,
      appliedRate: 3.2,
      saveTrm: "12",
    }],
  };
}

describe("legacy recommend storage migration", () => {
  it("converts a confirmed legacy profile, result, and saved runs into one owner namespace", () => {
    const ownerId = recommendOwnerId("alice");
    const plan = buildLegacyRecommendMigration(ownerId, {
      [LEGACY_RECOMMEND_PROFILE_KEY]: JSON.stringify(recommendProfileDefaults()),
      [LEGACY_RECOMMEND_RESULT_KEY]: JSON.stringify(legacyResult("alice")),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([legacyRun("run-legacy")]),
    });

    expect(plan.entries.map((entry) => entry.legacyKey)).toEqual([
      LEGACY_RECOMMEND_PROFILE_KEY,
      LEGACY_RECOMMEND_RESULT_KEY,
      LEGACY_RECOMMEND_SAVED_RUNS_KEY,
    ]);
    expect(parseStoredRecommendProfile(
      ownerId,
      plan.ownerStorageMap[recommendProfileStorageKey(ownerId)],
    )?.ownerId).toBe(ownerId);
    expect(parseStoredRecommendResult(
      ownerId,
      plan.ownerStorageMap[recommendResultStorageKey(ownerId)],
    )?.ownerId).toBe(ownerId);
    expect(JSON.parse(plan.ownerStorageMap[recommendOwnerStorageKey(ownerId, "saved-runs")]))
      .toEqual([expect.objectContaining({ ownerId, runId: "run-legacy" })]);
  });

  it("rejects legacy data that already identifies a different owner", () => {
    const ownerId = recommendOwnerId("alice");
    const plan = buildLegacyRecommendMigration(ownerId, {
      [LEGACY_RECOMMEND_RESULT_KEY]: JSON.stringify(legacyResult("bob")),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([legacyRun("run-bob", "bob")]),
    });

    expect(plan.entries).toEqual([]);
    expect(plan.skippedLegacyKeys).toEqual([
      LEGACY_RECOMMEND_RESULT_KEY,
      LEGACY_RECOMMEND_SAVED_RUNS_KEY,
    ]);
  });

  it("records the confirmed owner on an ownerless v1 result so the page owner check accepts it", () => {
    const ownerId = recommendOwnerId("alice");
    const plan = buildLegacyRecommendMigration(ownerId, {
      [LEGACY_RECOMMEND_RESULT_KEY]: JSON.stringify(legacyResult()),
    });
    const stored = parseStoredRecommendResult<{ purpose: string }, { userId?: string }>(
      ownerId,
      plan.ownerStorageMap[recommendResultStorageKey(ownerId)],
    );

    expect(stored?.ownerId).toBe(ownerId);
    expect(stored?.meta?.userId).toBe(ownerId);
  });

  it("keeps current owner values and merges non-conflicting legacy saved runs", () => {
    const ownerId = recommendOwnerId("alice");
    const currentProfile = { ...recommendProfileDefaults(), topN: 3 };
    const currentRun = { ...legacyRun("run-current"), ownerId };
    const ownerProfileKey = recommendProfileStorageKey(ownerId);
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const currentOwnerMap = {
      [ownerProfileKey]: JSON.stringify(buildStoredRecommendProfile(ownerId, currentProfile)),
      [ownerRunsKey]: JSON.stringify([currentRun]),
    };

    const plan = buildLegacyRecommendMigration(ownerId, {
      [LEGACY_RECOMMEND_PROFILE_KEY]: JSON.stringify(recommendProfileDefaults()),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([legacyRun("run-legacy")]),
    }, currentOwnerMap);

    expect(plan.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_PROFILE_KEY);
    expect(plan.ownerStorageMap[ownerProfileKey]).toBeUndefined();
    expect(JSON.parse(plan.ownerStorageMap[ownerRunsKey]).map((run: { runId: string }) => run.runId).sort())
      .toEqual(["run-current", "run-legacy"]);
  });

  it("removes only successfully copied legacy keys and preserves invalid source data", () => {
    const ownerId = recommendOwnerId("alice");
    const storage = memoryStorage({
      [LEGACY_RECOMMEND_PROFILE_KEY]: JSON.stringify(recommendProfileDefaults()),
      [LEGACY_RECOMMEND_RESULT_KEY]: "{broken",
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([legacyRun("run-legacy")]),
    });

    const result = migrateLegacyRecommendStorage(ownerId, storage);

    expect(result.migratedLegacyKeys).toEqual([
      LEGACY_RECOMMEND_PROFILE_KEY,
      LEGACY_RECOMMEND_SAVED_RUNS_KEY,
    ]);
    expect(result.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_RESULT_KEY);
    expect(storage.getItem(LEGACY_RECOMMEND_PROFILE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_RECOMMEND_SAVED_RUNS_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_RECOMMEND_RESULT_KEY)).toBe("{broken");
    expect(storage.getItem(recommendProfileStorageKey(ownerId))).not.toBeNull();
    expect(storage.getItem(recommendOwnerStorageKey(ownerId, "saved-runs"))).not.toBeNull();
  });

  it("keeps the legacy source when merging would exceed the saved-run limit", () => {
    const ownerId = recommendOwnerId("alice");
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const currentRuns = Array.from({ length: 50 }, (_, index) => ({
      ...legacyRun(`run-current-${index}`),
      ownerId,
    }));
    const storage = memoryStorage({
      [ownerRunsKey]: JSON.stringify(currentRuns),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([legacyRun("run-over-limit")]),
    });

    const result = migrateLegacyRecommendStorage(ownerId, storage);

    expect(result.migratedLegacyKeys).not.toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(result.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(storage.getItem(LEGACY_RECOMMEND_SAVED_RUNS_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(ownerRunsKey) ?? "[]")).toHaveLength(50);
  });

  it("keeps live owner values when adopting a v1-only backup and merges empty legacy runs without loss", () => {
    const ownerId = recommendOwnerId("alice");
    const ownerProfileKey = recommendProfileStorageKey(ownerId);
    const ownerResultKey = recommendResultStorageKey(ownerId);
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const currentRun = { ...legacyRun("run-current"), ownerId };
    const restore = buildLegacyRecommendBackupRestore(ownerId, {
      [LEGACY_RECOMMEND_PROFILE_KEY]: JSON.stringify(recommendProfileDefaults()),
      [LEGACY_RECOMMEND_RESULT_KEY]: JSON.stringify(legacyResult()),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: "[]",
    }, {
      [ownerProfileKey]: "current-profile",
      [ownerResultKey]: "current-result",
      [ownerRunsKey]: JSON.stringify([currentRun]),
    });

    expect(restore.clientStorageMap[ownerProfileKey]).toBeUndefined();
    expect(restore.clientStorageMap[ownerResultKey]).toBeUndefined();
    expect(JSON.parse(restore.clientStorageMap[ownerRunsKey] ?? "[]"))
      .toEqual([expect.objectContaining({ runId: "run-current", ownerId })]);
    expect(restore.skippedLegacyKeys).toEqual([
      LEGACY_RECOMMEND_PROFILE_KEY,
      LEGACY_RECOMMEND_RESULT_KEY,
    ]);
  });

  it("leaves duplicate legacy run IDs untouched instead of creating ambiguous history rows", () => {
    const ownerId = recommendOwnerId("alice");
    const plan = buildLegacyRecommendMigration(ownerId, {
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([
        legacyRun("run-duplicate"),
        legacyRun("run-duplicate"),
      ]),
    });

    expect(plan.entries).toEqual([]);
    expect(plan.skippedLegacyKeys).toEqual([LEGACY_RECOMMEND_SAVED_RUNS_KEY]);
  });

  it("preserves a legacy saved-runs source when the current owner has different content under the same run ID", () => {
    const ownerId = recommendOwnerId("alice");
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const currentRun = { ...legacyRun("run-conflict"), ownerId };
    const conflictingLegacyRun = {
      ...legacyRun("run-conflict"),
      items: [{
        ...legacyRun("run-conflict").items[0],
        productName: "다른 예금",
      }],
    };
    const storage = memoryStorage({
      [ownerRunsKey]: JSON.stringify([currentRun]),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([conflictingLegacyRun]),
    });

    const result = migrateLegacyRecommendStorage(ownerId, storage);

    expect(result.migratedLegacyKeys).not.toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(result.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(storage.getItem(LEGACY_RECOMMEND_SAVED_RUNS_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(ownerRunsKey) ?? "[]"))
      .toEqual([expect.objectContaining({ runId: "run-conflict", items: [expect.objectContaining({ productName: "테스트 예금" })] })]);
  });

  it("preserves the legacy source when a nested saved-run item is malformed", () => {
    const ownerId = recommendOwnerId("alice");
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const malformedRun = legacyRun("run-malformed");
    malformedRun.items.push({ unifiedId: "broken-item" } as typeof malformedRun.items[number]);
    const storage = memoryStorage({
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: JSON.stringify([malformedRun]),
    });

    const result = migrateLegacyRecommendStorage(ownerId, storage);

    expect(result.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(storage.getItem(LEGACY_RECOMMEND_SAVED_RUNS_KEY)).not.toBeNull();
    expect(storage.getItem(ownerRunsKey)).toBeNull();
  });

  it("does not truncate an over-limit live owner baseline while adopting an empty legacy list", () => {
    const ownerId = recommendOwnerId("alice");
    const ownerRunsKey = recommendOwnerStorageKey(ownerId, "saved-runs");
    const currentRuns = Array.from({ length: 51 }, (_, index) => ({
      ...legacyRun(`run-current-${index}`),
      ownerId,
    }));
    const storage = memoryStorage({
      [ownerRunsKey]: JSON.stringify(currentRuns),
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: "[]",
    });

    const result = migrateLegacyRecommendStorage(ownerId, storage);

    expect(result.skippedLegacyKeys).toContain(LEGACY_RECOMMEND_SAVED_RUNS_KEY);
    expect(storage.getItem(LEGACY_RECOMMEND_SAVED_RUNS_KEY)).toBe("[]");
    expect(JSON.parse(storage.getItem(ownerRunsKey) ?? "[]")).toHaveLength(51);
  });

  it("ignores null placeholders from old v1 backup bundles", () => {
    expect(countLegacyRecommendStorageEntries({
      [LEGACY_RECOMMEND_PROFILE_KEY]: null,
      [LEGACY_RECOMMEND_RESULT_KEY]: null,
      [LEGACY_RECOMMEND_SAVED_RUNS_KEY]: "[]",
    })).toBe(1);
  });
});
