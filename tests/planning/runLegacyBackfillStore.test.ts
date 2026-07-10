import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunLegacyBackfillStore } from "../../src/lib/planning/store/runLegacyBackfillStore";
import {
  type LegacyRunBackfillAnomaly,
  type LegacyRunBackfillCandidate,
} from "../../src/lib/planning/store/runLegacyBackfillService";
import { type RunIndexEntry } from "../../src/lib/planning/store/runIndex";
import { type JsonFileDetailedReadResult } from "../../src/lib/planning/store/runRecordCodec";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

function sampleRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Run 1",
    createdAt: "2026-07-03T00:00:00.000Z",
    input: { horizonMonths: 12 },
    meta: { snapshot: { missing: true } },
    outputs: {},
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createStore(input: {
  rows?: RunIndexEntry[];
  rawByPath?: Map<string, PlanningRunRecord | null>;
  detailedByPath?: Map<string, JsonFileDetailedReadResult>;
  calls?: string[];
  readRunForCandidate?: (
    candidate: LegacyRunBackfillCandidate,
    options?: { persistMigrations?: boolean },
  ) => Promise<PlanningRunRecord | null>;
  ensureStartupMigrations?: () => Promise<void>;
}) {
  return createRunLegacyBackfillStore({
    listIndexEntries: async () => input.rows ?? [],
    readRunForCandidate: input.readRunForCandidate ?? (async () => null),
    ensureStartupMigrations: input.ensureStartupMigrations ?? (async () => undefined),
    isEngineEnvelopeLike: (value) => {
      if (!isRecord(value)) return false;
      return value.stage === "DEBT"
        && isRecord(value.financialStatus)
        && isRecord(value.stageDecision);
    },
    readJsonFile: async (filePath) => {
      input.calls?.push(filePath);
      if (!input.rawByPath?.has(filePath)) return null;
      const payload = input.rawByPath.get(filePath);
      return payload ? { payload } : null;
    },
    ...(input.detailedByPath ? {
      readJsonFileDetailed: async (filePath: string) => {
        input.calls?.push(filePath);
        return input.detailedByPath?.get(filePath) ?? { status: "missing" as const };
      },
    } : {}),
    decodeStoredPayload: async (loaded) => {
      return loaded as { payload: unknown };
    },
    normalizeRawRun: (value) => {
      return value && typeof value === "object" ? value as PlanningRunRecord : null;
    },
  });
}

describe("planning run legacy backfill store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-legacy-backfill-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prefers partition raw meta before legacy paths", async () => {
    const run = sampleRun();
    const partitionPath = path.join(root, "vault", "profiles", "profile-1", "runs", "run-1", "run.json");
    const calls: string[] = [];
    const store = createStore({
      rawByPath: new Map([[partitionPath, run]]),
      calls,
    });

    await expect(store.readRawRunForIndexEntry({ id: "run-1", profileId: "profile-1" })).resolves.toEqual(run);
    expect(calls).toEqual([partitionPath]);
  });

  it("falls back from partition raw meta to legacy run meta", async () => {
    const run = sampleRun();
    const partitionPath = path.join(root, "vault", "profiles", "profile-1", "runs", "run-1", "run.json");
    const legacyMetaPath = path.join(root, "runs", "run-1", "run.json");
    const calls: string[] = [];
    const store = createStore({
      rawByPath: new Map([[legacyMetaPath, run]]),
      calls,
    });

    await expect(store.readRawRunForIndexEntry({ id: "run-1", profileId: "profile-1" })).resolves.toEqual(run);
    expect(calls).toEqual([partitionPath, legacyMetaPath]);
  });

  it("falls back from legacy run meta to legacy file", async () => {
    const run = sampleRun();
    const partitionPath = path.join(root, "vault", "profiles", "profile-1", "runs", "run-1", "run.json");
    const legacyMetaPath = path.join(root, "runs", "run-1", "run.json");
    const legacyFilePath = path.join(root, "runs", "run-1.json");
    const calls: string[] = [];
    const store = createStore({
      rawByPath: new Map([[legacyFilePath, run]]),
      calls,
    });

    await expect(store.readRawRunForIndexEntry({ id: "run-1", profileId: "profile-1" })).resolves.toEqual(run);
    expect(calls).toEqual([partitionPath, legacyMetaPath, legacyFilePath]);
  });

  it("wires legacy backfill summary, candidate listing, and migration reads", async () => {
    const rawLegacy = sampleRun({
      id: "legacy",
      profileId: "profile-1",
      createdAt: "2026-07-02T00:00:00.000Z",
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    });
    const migrated = sampleRun({
      id: "legacy",
      profileId: "profile-1",
      outputs: {
        engineSchemaVersion: 1,
        engine: { stage: "DEBT", financialStatus: {}, stageDecision: {} } as PlanningRunRecord["outputs"]["engine"],
      },
    });
    const rawPath = path.join(root, "vault", "profiles", "profile-1", "runs", "legacy", "run.json");
    const readOptions: Array<{ persistMigrations?: boolean } | undefined> = [];
    let migrationsEnsured = 0;
    const store = createStore({
      rows: [
        {
          id: "legacy",
          profileId: "profile-1",
          createdAt: "2026-07-02T00:00:00.000Z",
          title: "Legacy",
        },
      ],
      rawByPath: new Map([[rawPath, rawLegacy]]),
      readRunForCandidate: async (_candidate, options) => {
        readOptions.push(options);
        return migrated;
      },
      ensureStartupMigrations: async () => {
        migrationsEnsured += 1;
      },
    });

    await expect(store.summarize()).resolves.toMatchObject({
      totalRuns: 1,
      legacyCandidates: 1,
      resultDtoOnlyCandidates: 1,
    });
    await expect(store.listCandidates()).resolves.toMatchObject([
      { id: "legacy", profileId: "profile-1", reason: "resultDtoOnly" },
    ]);
    await expect(store.backfill()).resolves.toMatchObject({
      selected: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(migrationsEnsured).toBe(1);
    expect(readOptions).toEqual([{ persistMigrations: true }]);
  });

  it("records privacy-safe skipped and post-check failure anomalies", async () => {
    const rawLegacy = sampleRun({
      id: "legacy",
      profileId: "profile-1",
      createdAt: "2026-07-02T00:00:00.000Z",
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    });
    const rawPath = path.join(root, "vault", "profiles", "profile-1", "runs", "legacy", "run.json");
    const anomalies: LegacyRunBackfillAnomaly[] = [];
    const store = createStore({
      rows: [
        {
          id: "unreadable",
          profileId: "profile-1",
          createdAt: "2026-07-03T00:00:00.000Z",
          title: "Unreadable",
        },
        {
          id: "legacy",
          profileId: "profile-1",
          createdAt: "2026-07-02T00:00:00.000Z",
          title: "Legacy",
        },
      ],
      rawByPath: new Map([[rawPath, rawLegacy]]),
      readRunForCandidate: async () => sampleRun({ id: "legacy", profileId: "profile-1", outputs: {} }),
    });

    await expect(store.backfill({
      recordBackfillAnomaly: (event) => anomalies.push(event),
    })).resolves.toMatchObject({
      selected: 2,
      migrated: 0,
      skipped: 1,
      failed: 1,
    });
    expect(anomalies).toEqual([
      {
        candidateReason: "unreadableMeta",
        outcome: "skipped",
        reason: "unreadableMeta",
        runKind: "user",
      },
      {
        candidateReason: "resultDtoOnly",
        outcome: "failed",
        reason: "postCheckMissingEngine",
        runKind: "user",
      },
    ]);
    expect(JSON.stringify(anomalies)).not.toContain("profile-1");
    expect(JSON.stringify(anomalies)).not.toContain("legacy");
  });

  it("records one privacy-safe raw read reason per recovered or skipped candidate", async () => {
    const recovered = sampleRun({
      id: "recovered",
      createdAt: "2026-07-02T00:00:00.000Z",
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    });
    const recoveredPartitionPath = path.join(
      root,
      "vault",
      "profiles",
      "profile-1",
      "runs",
      "recovered",
      "run.json",
    );
    const recoveredLegacyMetaPath = path.join(root, "runs", "recovered", "run.json");
    const unreadablePartitionPath = path.join(
      root,
      "vault",
      "profiles",
      "profile-1",
      "runs",
      "unreadable",
      "run.json",
    );
    const anomalies: LegacyRunBackfillAnomaly[] = [];
    const store = createStore({
      rows: [
        {
          id: "unreadable",
          profileId: "profile-1",
          createdAt: "2026-07-03T00:00:00.000Z",
          title: "Unreadable",
        },
        {
          id: "recovered",
          profileId: "profile-1",
          createdAt: recovered.createdAt,
          title: "Recovered",
        },
      ],
      detailedByPath: new Map([
        [unreadablePartitionPath, { status: "found", value: "invalid-run" }],
        [recoveredPartitionPath, { status: "invalid-json" }],
        [recoveredLegacyMetaPath, { status: "found", value: { payload: recovered } }],
      ]),
      readRunForCandidate: async () => sampleRun({
        id: "recovered",
        outputs: {
          engineSchemaVersion: 1,
          engine: {
            stage: "DEBT",
            financialStatus: {},
            stageDecision: {},
          } as PlanningRunRecord["outputs"]["engine"],
        },
      }),
    });

    await expect(store.backfill({
      recordBackfillAnomaly: (event) => anomalies.push(event),
    })).resolves.toMatchObject({
      selected: 2,
      migrated: 1,
      skipped: 1,
      failed: 0,
    });
    expect(anomalies).toEqual([
      {
        candidateReason: "unreadableMeta",
        outcome: "skipped",
        reason: "rawInvalidRunRecord",
        runKind: "user",
        source: "partition-meta",
      },
      {
        candidateReason: "resultDtoOnly",
        outcome: "recovered",
        reason: "rawInvalidJson",
        runKind: "user",
        source: "partition-meta",
      },
    ]);
    const serialized = JSON.stringify(anomalies);
    expect(serialized).not.toContain('"profileId"');
    expect(serialized).not.toContain('"id"');
  });

  it("records read fallback events only for candidates selected after sorting and limit", async () => {
    const newer = sampleRun({
      id: "newer",
      createdAt: "2026-07-03T00:00:00.000Z",
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    });
    const older = sampleRun({
      id: "older",
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    const newerPartitionPath = path.join(
      root,
      "vault",
      "profiles",
      "profile-1",
      "runs",
      newer.id,
      "run.json",
    );
    const newerLegacyMetaPath = path.join(root, "runs", newer.id, "run.json");
    const olderPartitionPath = path.join(
      root,
      "vault",
      "profiles",
      "profile-1",
      "runs",
      older.id,
      "run.json",
    );
    const anomalies: LegacyRunBackfillAnomaly[] = [];
    const store = createStore({
      rows: [
        {
          id: older.id,
          profileId: older.profileId,
          createdAt: older.createdAt,
        },
        {
          id: newer.id,
          profileId: newer.profileId,
          createdAt: newer.createdAt,
        },
      ],
      detailedByPath: new Map([
        [newerPartitionPath, { status: "invalid-json" }],
        [newerLegacyMetaPath, { status: "found", value: { payload: newer } }],
        [olderPartitionPath, { status: "found", value: "invalid-run" }],
      ]),
      readRunForCandidate: async () => sampleRun({
        id: newer.id,
        outputs: {
          engineSchemaVersion: 1,
          engine: {
            stage: "DEBT",
            financialStatus: {},
            stageDecision: {},
          } as PlanningRunRecord["outputs"]["engine"],
        },
      }),
    });

    await expect(store.backfill({
      limit: 1,
      recordBackfillAnomaly: (event) => anomalies.push(event),
    })).resolves.toMatchObject({
      selected: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(anomalies).toEqual([
      {
        candidateReason: "resultDtoOnly",
        outcome: "recovered",
        reason: "rawInvalidJson",
        runKind: "user",
        source: "partition-meta",
      },
    ]);
  });

  it("records only an error name and isolates recorder failures", async () => {
    const rawLegacy = sampleRun({
      id: "legacy",
      profileId: "profile-1",
      createdAt: "2026-07-02T00:00:00.000Z",
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    });
    const rawPath = path.join(root, "vault", "profiles", "profile-1", "runs", "legacy", "run.json");
    const anomalies: LegacyRunBackfillAnomaly[] = [];
    const store = createStore({
      rows: [
        {
          id: "legacy",
          profileId: "profile-1",
          createdAt: "2026-07-02T00:00:00.000Z",
          title: "Legacy",
        },
      ],
      rawByPath: new Map([[rawPath, rawLegacy]]),
      readRunForCandidate: async () => {
        throw new TypeError("sensitive path and payload details");
      },
    });

    await expect(store.backfill({
      recordBackfillAnomaly: (event) => {
        anomalies.push(event);
        return Promise.reject(new Error("recorder failed"));
      },
    })).resolves.toMatchObject({
      selected: 1,
      migrated: 0,
      skipped: 0,
      failed: 1,
    });
    expect(anomalies).toEqual([
      {
        candidateReason: "resultDtoOnly",
        errorName: "TypeError",
        outcome: "failed",
        reason: "readException",
        runKind: "user",
      },
    ]);
    expect(JSON.stringify(anomalies)).not.toContain("sensitive path");
  });

  it("distinguishes missing run and missing engine schema post-check failures", async () => {
    const rawRuns = ["missing-run", "missing-schema"].map((id, index) => sampleRun({
      id,
      profileId: "profile-1",
      createdAt: `2026-07-0${3 - index}T00:00:00.000Z`,
      outputs: { resultDto: { version: 1 } as PlanningRunRecord["outputs"]["resultDto"] },
    }));
    const rawByPath = new Map(rawRuns.map((run) => [
      path.join(root, "vault", "profiles", "profile-1", "runs", run.id, "run.json"),
      run,
    ]));
    const anomalies: LegacyRunBackfillAnomaly[] = [];
    const store = createStore({
      rows: rawRuns.map((run) => ({
        id: run.id,
        profileId: run.profileId,
        createdAt: run.createdAt,
        title: run.title,
      })),
      rawByPath,
      readRunForCandidate: async (candidate) => {
        if (candidate.id === "missing-run") return null;
        return sampleRun({
          id: candidate.id,
          profileId: candidate.profileId,
          outputs: {
            engine: {
              stage: "DEBT",
              financialStatus: {},
              stageDecision: {},
            } as PlanningRunRecord["outputs"]["engine"],
          },
        });
      },
    });

    await expect(store.backfill({
      recordBackfillAnomaly: (event) => anomalies.push(event),
    })).resolves.toMatchObject({ failed: 2, migrated: 0, selected: 2, skipped: 0 });
    expect(anomalies.map((event) => event.reason)).toEqual([
      "postCheckMissingRun",
      "postCheckMissingEngineSchema",
    ]);
  });

  it("does not await an unresolved async anomaly recorder", async () => {
    const store = createStore({
      rows: [
        {
          id: "unreadable",
          profileId: "profile-1",
          createdAt: "2026-07-03T00:00:00.000Z",
          title: "Unreadable",
        },
      ],
    });

    await expect(store.backfill({
      recordBackfillAnomaly: () => new Promise<void>(() => undefined),
    })).resolves.toMatchObject({ selected: 1, migrated: 0, skipped: 1, failed: 0 });
  });
});
