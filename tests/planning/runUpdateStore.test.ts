import { describe, expect, it, vi } from "vitest";

import { createRunUpdateStore } from "../../src/lib/planning/store/runUpdateStore";
import { type RunIndexEntry } from "../../src/lib/planning/store/runIndex";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function makeActionCenter(runId = "run-1"): NonNullable<PlanningRunRecord["actionCenter"]> {
  return {
    plan: {
      version: 1,
      runId,
      generatedAt: "2026-01-01T00:00:00.000Z",
      items: [],
    },
    progress: {
      version: 1,
      runId,
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [],
    },
  };
}

function makeRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Original run",
    createdAt: "2026-01-01T00:00:00.000Z",
    overallStatus: "RUNNING",
    input: {
      horizonMonths: 12,
      runScenarios: true,
    },
    meta: {
      snapshot: {
        missing: true,
      },
    },
    outputs: {
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/planning/runs/run-1/blobs/simulate.json",
        },
        summary: {
          endNetWorthKrw: 1000,
        },
      },
    },
    actionCenter: makeActionCenter(),
    ...overrides,
  };
}

describe("planning run update store", () => {
  it("merges update patches, canonicalizes the record, writes meta, and upserts the index", async () => {
    const current = makeRun();
    const normalizedRecords: PlanningRunRecord[] = [];
    const normalized = makeRun({
      title: "Updated run",
      schemaVersion: 2,
      actionCenter: undefined,
      input: {
        horizonMonths: 24,
        runScenarios: true,
        getActions: true,
      },
      meta: {
        snapshot: {
          id: "snapshot-2",
          missing: false,
        },
      },
      outputs: {
        ...current.outputs,
        actions: {
          ref: {
            name: "actions",
            path: ".data/planning/runs/run-1/blobs/actions.json",
          },
          actions: [],
        },
      },
    });
    const indexEntry: RunIndexEntry = {
      id: "run-1",
      profileId: "profile-1",
      title: "Updated run",
      createdAt: current.createdAt,
      overallStatus: "SUCCESS",
    };
    const writeMetaRecord = vi.fn(async () => ({
      metaPath: "/vault/profiles/profile-1/runs/run-1/meta.json",
      runDir: "/vault/profiles/profile-1/runs/run-1",
    }));
    const toIndexEntry = vi.fn(() => indexEntry);
    const upsertIndexEntry = vi.fn(async () => undefined);

    const store = createRunUpdateStore({
      getRun: vi.fn(async () => current),
      normalizeRecord: vi.fn((record) => {
        normalizedRecords.push(record);
        return normalized;
      }),
      writeMetaRecord,
      toIndexEntry,
      upsertIndexEntry,
    });

    await expect(store.updateRun("run-1", {
      title: "Updated run",
      overallStatus: "SUCCESS",
      input: {
        horizonMonths: 24,
        getActions: true,
      },
      meta: {
        snapshot: {
          id: "snapshot-2",
          missing: false,
        },
      },
      outputs: {
        actions: {
          ref: {
            name: "actions",
            path: ".data/planning/runs/run-1/blobs/actions.json",
          },
          actions: [],
        },
      },
      actionCenter: null,
    })).resolves.toBe(normalized);

    expect(normalizedRecords).toHaveLength(1);
    expect(normalizedRecords[0]).toMatchObject({
      id: "run-1",
      profileId: "profile-1",
      title: "Updated run",
      createdAt: current.createdAt,
      overallStatus: "SUCCESS",
      version: 1,
      input: {
        horizonMonths: 24,
        runScenarios: true,
        getActions: true,
      },
      meta: {
        snapshot: {
          id: "snapshot-2",
          missing: false,
        },
      },
      outputs: {
        simulate: current.outputs.simulate,
        actions: {
          ref: {
            name: "actions",
            path: ".data/planning/runs/run-1/blobs/actions.json",
          },
          actions: [],
        },
      },
    });
    expect(normalizedRecords[0]?.actionCenter).toBeUndefined();
    expect(writeMetaRecord).toHaveBeenCalledWith(normalized);
    expect(toIndexEntry).toHaveBeenCalledWith(normalized);
    expect(upsertIndexEntry).toHaveBeenCalledWith(indexEntry);
  });

  it("keeps the existing action center when the patch omits actionCenter", async () => {
    const current = makeRun();
    const store = createRunUpdateStore({
      getRun: vi.fn(async () => current),
      normalizeRecord: vi.fn((record) => record),
      writeMetaRecord: vi.fn(async () => ({ metaPath: "/meta.json", runDir: "/run" })),
      toIndexEntry: vi.fn((record) => ({
        id: record.id,
        profileId: record.profileId,
        createdAt: record.createdAt,
      })),
      upsertIndexEntry: vi.fn(async () => undefined),
    });

    const updated = await store.updateRun("run-1", { title: "Title only" });

    expect(updated?.actionCenter).toEqual(current.actionCenter);
  });

  it("returns null without writes when the run does not exist", async () => {
    const writeMetaRecord = vi.fn(async () => ({ metaPath: "/meta.json", runDir: "/run" }));
    const upsertIndexEntry = vi.fn(async () => undefined);
    const store = createRunUpdateStore({
      getRun: vi.fn(async () => null),
      writeMetaRecord,
      upsertIndexEntry,
    });

    await expect(store.updateRun("missing-run", { title: "Missing" })).resolves.toBeNull();

    expect(writeMetaRecord).not.toHaveBeenCalled();
    expect(upsertIndexEntry).not.toHaveBeenCalled();
  });
});
