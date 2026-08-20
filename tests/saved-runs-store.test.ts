import { describe, expect, it } from "vitest";
import {
  buildRunFromRecommend,
  clearRuns,
  getRun,
  listRuns,
  removeRun,
  saveRun,
  saveRunFromRecommend,
  type SavedRunInput,
  type SavedRunProfile,
} from "../src/lib/recommend/savedRunsStore";
import {
  recommendOwnerId,
  recommendOwnerStorageKey,
} from "../src/lib/recommend/ownerNamespace";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(): MemoryStorage {
  const bag = new Map<string, string>();
  return {
    getItem(key) {
      return bag.has(key) ? (bag.get(key) ?? null) : null;
    },
    setItem(key, value) {
      bag.set(key, value);
    },
    removeItem(key) {
      bag.delete(key);
    },
  };
}

function makeInput(index: number): SavedRunInput {
  const savedAt = new Date(Date.UTC(2026, 1, 1, 0, index, 0)).toISOString();
  return {
    runId: `run-${index}`,
    savedAt,
    profile: {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 5,
      candidatePool: "unified",
      candidateSources: ["finlife"],
      depositProtection: "any",
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
      planning: {
        runId: "run_20260316_001",
        summary: {
          stage: "DEBT",
          overallStatus: "SUCCESS",
        },
      },
      planningContext: {
        monthlyIncomeKrw: 4_200_000,
        monthlyExpenseKrw: 2_600_000,
        liquidAssetsKrw: 6_000_000,
        debtBalanceKrw: 20_000_000,
      },
    },
    items: [
      {
        unifiedId: `finlife:P-${index}`,
        providerName: "테스트은행",
        productName: `테스트상품-${index}`,
        kind: "deposit",
        termMonths: 12,
        appliedRate: 3 + index * 0.01,
        rank: 1,
        finalScore: 0.8,
      },
    ],
  };
}

describe("saved runs store", () => {
  it("supports save/list/get/remove/clear with max 50 cap", () => {
    const storage = createMemoryStorage();
    const ownerId = recommendOwnerId("alice");

    for (let i = 0; i < 55; i += 1) {
      saveRun(ownerId, makeInput(i), storage);
    }

    const runs = listRuns(ownerId, storage);
    expect(runs).toHaveLength(50);
    expect(runs[0]?.runId).toBe("run-54");
    expect(runs[0]?.profile.planning?.runId).toBe("run_20260316_001");
    expect(runs[0]?.profile.planning?.summary.stage).toBe("DEBT");
    expect(runs[0]?.profile.planningContext?.monthlyIncomeKrw).toBe(4_200_000);
    expect(getRun(ownerId, "run-54", storage)?.runId).toBe("run-54");
    expect(getRun(ownerId, "run-0", storage)).toBeNull();

    removeRun(ownerId, "run-54", storage);
    expect(getRun(ownerId, "run-54", storage)).toBeNull();

    clearRuns(ownerId, storage);
    expect(listRuns(ownerId, storage)).toEqual([]);
  });

  it("updates existing runId instead of duplicating", () => {
    const storage = createMemoryStorage();
    const ownerId = recommendOwnerId("alice");

    saveRun(ownerId, makeInput(1), storage);
    saveRun(ownerId, {
      ...makeInput(1),
      items: [
        {
          unifiedId: "finlife:P-1",
          providerName: "테스트은행",
          productName: "변경상품",
          kind: "deposit",
          termMonths: 24,
          appliedRate: 4.1,
          rank: 1,
          finalScore: 0.9,
        },
      ],
    }, storage);

    const runs = listRuns(ownerId, storage);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.items[0]?.productName).toBe("변경상품");
  });

  it("buildRunFromRecommend enforces unifiedId rule with fallback", () => {
    const profile: SavedRunProfile = {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 5,
      candidatePool: "unified",
      candidateSources: ["finlife", "datago_kdb"],
      depositProtection: "any",
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
    };
    const ownerId = recommendOwnerId("alice");
    const run = buildRunFromRecommend(ownerId, profile, {
      items: [
        {
          sourceId: "finlife",
          finPrdtCd: "P-001",
          providerName: "은행A",
          productName: "상품A",
          kind: "deposit",
          finalScore: 0.9,
          selectedOption: { saveTrm: "12개월", appliedRate: 3.5 },
        },
        {
          finPrdtCd: "P-002",
          providerName: "은행B",
          productName: "상품B",
          kind: "saving",
          finalScore: 0.8,
          selectedOption: { termMonths: 24, appliedRate: 4.0 },
        },
      ],
    });

    expect(run.items[0]?.unifiedId).toBe("finlife:P-001");
    expect(run.ownerId).toBe(ownerId);
    expect(run.items[0]?.termMonths).toBe(12);
    expect(run.items[1]?.unifiedId).toBe("unknown:P-002");
    expect(run.items[1]?.termMonths).toBe(24);
  });

  it("saveRunFromRecommend returns runId and stores run", () => {
    const storage = createMemoryStorage();
    const ownerId = recommendOwnerId("alice");
    const profile: SavedRunProfile = {
      purpose: "emergency",
      kind: "deposit",
      preferredTerm: 3,
      liquidityPref: "high",
      rateMode: "max",
      topN: 3,
      candidatePool: "unified",
      candidateSources: ["finlife"],
      depositProtection: "any",
      weights: { rate: 0.6, term: 0.25, liquidity: 0.15 },
    };
    const runId = saveRunFromRecommend(ownerId, profile, {
      items: [
        {
          unifiedId: "finlife:EM-001",
          providerName: "은행E",
          productName: "비상금E",
          kind: "deposit",
          finalScore: 0.77,
          selectedOption: { termMonths: 3, appliedRate: 2.9 },
        },
      ],
    }, storage);

    expect(typeof runId).toBe("string");
    const saved = getRun(ownerId, runId, storage);
    expect(saved?.items[0]?.unifiedId).toBe("finlife:EM-001");
  });

  it("isolates account switches and quarantines the legacy global key", () => {
    const storage = createMemoryStorage();
    const alice = recommendOwnerId("alice");
    const bob = recommendOwnerId("bob");

    storage.setItem("recommend_saved_runs_v1", JSON.stringify([{ ...makeInput(99), ownerId: "alice" }]));
    saveRun(alice, makeInput(1), storage);
    saveRun(bob, makeInput(2), storage);

    expect(listRuns(alice, storage).map((run) => run.runId)).toEqual(["run-1"]);
    expect(listRuns(bob, storage).map((run) => run.runId)).toEqual(["run-2"]);
    expect(storage.getItem("recommend_saved_runs_v1")).not.toBeNull();

    storage.setItem(
      recommendOwnerStorageKey(bob, "saved-runs"),
      storage.getItem(recommendOwnerStorageKey(alice, "saved-runs")) ?? "[]",
    );
    expect(listRuns(bob, storage)).toEqual([]);
    expect(listRuns(alice, storage).map((run) => run.runId)).toEqual(["run-1"]);
  });
});
