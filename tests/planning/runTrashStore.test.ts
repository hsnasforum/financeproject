import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteRunMetaFromTrash,
  hardDeleteRunFiles,
  moveRunMetaToTrash,
  restoreRunMetaFromTrash,
} from "../../src/lib/planning/store/runTrashStore";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
  resolveRunPath,
} from "../../src/lib/planning/store/paths";
import { resolveTrashKindDir } from "../../src/lib/planning/store/trash";
import { toStoredPayload } from "../../src/lib/planning/store/runRecordCodec";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;

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

async function writeStoredJson(filePath: string, payload: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(await toStoredPayload(payload), null, 2)}\n`, "utf-8");
}

describe("planning run trash store boundary", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-trash-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("moves partitioned run meta to trash and restores it by stored profile id", async () => {
    const run = sampleRun();
    const metaPath = resolveProfileRunMetaPath(run.profileId, run.id);
    const runDir = resolveProfileRunDir(run.profileId, run.id);
    const blobPath = path.join(runDir, "blobs", "simulate.json");
    await writeStoredJson(metaPath, run);
    await writeStoredJson(blobPath, { rows: [1, 2, 3] });

    await expect(moveRunMetaToTrash({
      id: run.id,
      existing: run,
    })).resolves.toBe(true);

    expect(fs.existsSync(metaPath)).toBe(false);
    expect(fs.existsSync(runDir)).toBe(false);
    expect(fs.existsSync(path.join(resolveTrashKindDir("runs"), `${run.id}.json`))).toBe(true);

    await expect(restoreRunMetaFromTrash(run.id)).resolves.toBe(true);

    expect(fs.existsSync(metaPath)).toBe(true);
    expect(fs.existsSync(path.join(resolveTrashKindDir("runs"), `${run.id}.json`))).toBe(false);
  });

  it("falls back to legacy run files and can permanently delete trash metadata", async () => {
    const run = sampleRun({
      id: "legacy-run",
      profileId: "legacy-profile",
    });
    const legacyPath = resolveRunPath(run.id);
    await writeStoredJson(legacyPath, run);

    await expect(moveRunMetaToTrash({
      id: run.id,
      existing: null,
    })).resolves.toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(path.join(resolveTrashKindDir("runs"), `${run.id}.json`))).toBe(true);

    await expect(deleteRunMetaFromTrash(run.id)).resolves.toBe(true);
    await expect(deleteRunMetaFromTrash(run.id)).resolves.toBe(false);
  });

  it("hard-deletes partition directories and legacy files without touching the index", async () => {
    const partitionRun = sampleRun({ id: "partition-run" });
    const partitionMetaPath = resolveProfileRunMetaPath(partitionRun.profileId, partitionRun.id);
    await writeStoredJson(partitionMetaPath, partitionRun);

    await expect(hardDeleteRunFiles({
      id: partitionRun.id,
      existing: partitionRun,
    })).resolves.toBe(true);
    expect(fs.existsSync(resolveProfileRunDir(partitionRun.profileId, partitionRun.id))).toBe(false);

    const legacyRun = sampleRun({
      id: "legacy-hard-delete",
      profileId: "legacy-profile",
    });
    const legacyPath = resolveRunPath(legacyRun.id);
    await writeStoredJson(legacyPath, legacyRun);

    await expect(hardDeleteRunFiles({
      id: legacyRun.id,
      existing: null,
    })).resolves.toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
    await expect(hardDeleteRunFiles({
      id: legacyRun.id,
      existing: null,
    })).resolves.toBe(false);
  });
});
