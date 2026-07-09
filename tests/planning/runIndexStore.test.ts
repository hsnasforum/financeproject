import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunIndexStore } from "../../src/lib/planning/store/runIndexStore";
import { toRunIndexEntry, type RunIndexEntry } from "../../src/lib/planning/store/runIndex";
import {
  resolveProfileRunDir,
  resolveRunsDir,
  resolveRunsIndexPath,
} from "../../src/lib/planning/store/paths";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalStorageJournalPath = process.env.PLANNING_STORAGE_JOURNAL_PATH;

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

function createStore(runs: PlanningRunRecord[], calls?: Array<{ id: string; profileIdHint?: string }>) {
  const byPartition = new Map(runs.map((run) => [`${run.profileId}:${run.id}`, run]));
  const byId = new Map(runs.map((run) => [run.id, run]));
  return createRunIndexStore({
    readRunMeta: async (id, profileIdHint) => {
      calls?.push({
        id,
        ...(profileIdHint ? { profileIdHint } : {}),
      });
      if (profileIdHint) return byPartition.get(`${profileIdHint}:${id}`) ?? null;
      return byId.get(id) ?? null;
    },
  });
}

async function touchFile(filePath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, "{}\n", "utf-8");
}

async function readIndexIds(): Promise<string[]> {
  const store = createRunIndexStore({ readRunMeta: async () => null });
  const entries = await store.read();
  return entries.map((entry) => entry.id);
}

describe("planning run index store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-index-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, "storage", "journal.ndjson");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalStorageJournalPath === "string") env.PLANNING_STORAGE_JOURNAL_PATH = originalStorageJournalPath;
    else delete env.PLANNING_STORAGE_JOURNAL_PATH;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans profile partitions and legacy run files through the injected reader", async () => {
    await fsPromises.mkdir(resolveProfileRunDir("profile-1", "run-partition"), { recursive: true });
    await touchFile(path.join(resolveRunsDir(), "run-legacy.json"));

    const calls: Array<{ id: string; profileIdHint?: string }> = [];
    const store = createStore([
      sampleRun({
        id: "run-partition",
        profileId: "profile-1",
        createdAt: "2026-07-03T00:00:00.000Z",
      }),
      sampleRun({
        id: "run-legacy",
        profileId: "profile-legacy",
        createdAt: "2026-07-02T00:00:00.000Z",
      }),
    ], calls);

    await expect(store.scan()).resolves.toMatchObject([
      { id: "run-partition", profileId: "profile-1" },
      { id: "run-legacy", profileId: "profile-legacy" },
    ]);
    expect(calls).toContainEqual({ id: "run-partition", profileIdHint: "profile-1" });
    expect(calls).toContainEqual({ id: "run-legacy" });
  });

  it("repairs a missing index by scanning disk and keeping the stored index contract", async () => {
    await fsPromises.mkdir(resolveProfileRunDir("profile-1", "run-repair"), { recursive: true });
    const store = createStore([
      sampleRun({ id: "run-repair", profileId: "profile-1" }),
    ]);

    const repaired = await store.read({ repair: true });

    expect(repaired.map((entry) => entry.id)).toEqual(["run-repair"]);
    expect(fs.existsSync(resolveRunsIndexPath())).toBe(true);
    await expect(readIndexIds()).resolves.toEqual(["run-repair"]);
  });

  it("upserts and removes entries without changing index entry ordering", async () => {
    const store = createStore([]);
    const oldEntry: RunIndexEntry = toRunIndexEntry(sampleRun({
      id: "old",
      createdAt: "2026-07-01T00:00:00.000Z",
    }));
    const newEntry: RunIndexEntry = toRunIndexEntry(sampleRun({
      id: "new",
      createdAt: "2026-07-02T00:00:00.000Z",
    }));

    await store.upsert(oldEntry);
    await store.upsert(newEntry);
    await expect(readIndexIds()).resolves.toEqual(["new", "old"]);

    await store.remove("new");
    await expect(readIndexIds()).resolves.toEqual(["old"]);
  });
});
