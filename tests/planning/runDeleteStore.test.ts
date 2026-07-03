import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "../../src/lib/planning/store/paths";
import { createRunDeleteStore } from "../../src/lib/planning/store/runDeleteStore";
import { writeRunMetaRecord } from "../../src/lib/planning/store/runMetaWriter";
import { fromStoredPayload } from "../../src/lib/planning/store/runRecordCodec";
import { listPlanningTrash } from "../../src/lib/planning/store/trash";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalProfilePartitionsDir = process.env.PLANNING_PROFILE_PARTITIONS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;

function resultDto() {
  return buildResultDtoV1({
    generatedAt: "2026-07-04T00:00:00.000Z",
    simulate: {
      summary: {
        endNetWorthKrw: 1_000_000,
        worstCashKrw: 100_000,
        worstCashMonthIndex: 1,
        goalsAchievedCount: 0,
        goalsMissedCount: 0,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [],
      timeline: [],
    },
  });
}

function sampleRun(overrides: Partial<PlanningRunRecord> = {}): PlanningRunRecord {
  return {
    version: 1,
    schemaVersion: 2,
    id: "run-1",
    profileId: "profile-1",
    title: "Run 1",
    createdAt: "2026-07-04T00:00:00.000Z",
    input: { horizonMonths: 12 },
    meta: { snapshot: { missing: true } },
    outputs: {
      resultDto: resultDto(),
    },
    ...overrides,
  };
}

async function readStoredRun(filePath: string): Promise<PlanningRunRecord | null> {
  try {
    const raw = JSON.parse(await fsPromises.readFile(filePath, "utf-8")) as unknown;
    const decoded = await fromStoredPayload(raw);
    return decoded.payload as PlanningRunRecord;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

describe("planning run delete store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-delete-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_PARTITIONS_DIR = path.join(root, "vault", "profiles");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalProfilePartitionsDir === "string") env.PLANNING_PROFILE_PARTITIONS_DIR = originalProfilePartitionsDir;
    else delete env.PLANNING_PROFILE_PARTITIONS_DIR;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("moves run meta to trash and restores index state through injected boundaries", async () => {
    const run = sampleRun();
    await writeRunMetaRecord(run);

    const removeIndexEntry = vi.fn(async () => undefined);
    const upsertIndexEntry = vi.fn(async () => undefined);
    const store = createRunDeleteStore({
      getRun: async () => readStoredRun(resolveProfileRunMetaPath(run.profileId, run.id)),
      removeIndexEntry,
      upsertIndexEntry,
    });

    await expect(store.deleteRun(run.id)).resolves.toBe(true);

    expect(fs.existsSync(resolveProfileRunMetaPath(run.profileId, run.id))).toBe(false);
    expect(fs.existsSync(resolveProfileRunDir(run.profileId, run.id))).toBe(false);
    expect(removeIndexEntry).toHaveBeenCalledWith(run.id);
    await expect(listPlanningTrash("runs", 50, root)).resolves.toEqual([
      expect.objectContaining({ id: run.id, kind: "runs" }),
    ]);

    await expect(store.restoreRunFromTrash(run.id)).resolves.toBe(true);

    expect(fs.existsSync(resolveProfileRunMetaPath(run.profileId, run.id))).toBe(true);
    expect(upsertIndexEntry).toHaveBeenCalledWith(expect.objectContaining({
      id: run.id,
      profileId: run.profileId,
    }));
  });

  it("removes index entries only when hard delete removes stored run files", async () => {
    const run = sampleRun({ id: "hard-delete-run" });
    await writeRunMetaRecord(run);

    const removeIndexEntry = vi.fn(async () => undefined);
    const store = createRunDeleteStore({
      getRun: async () => run,
      removeIndexEntry,
      upsertIndexEntry: vi.fn(async () => undefined),
    });

    await expect(store.hardDeleteRun(run.id)).resolves.toBe(true);
    expect(fs.existsSync(resolveProfileRunDir(run.profileId, run.id))).toBe(false);
    expect(removeIndexEntry).toHaveBeenCalledWith(run.id);

    removeIndexEntry.mockClear();
    await expect(store.hardDeleteRun(run.id)).resolves.toBe(false);
    expect(removeIndexEntry).not.toHaveBeenCalled();
  });
});
