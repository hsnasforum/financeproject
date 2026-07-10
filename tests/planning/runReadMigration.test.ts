import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  migrateLegacyRunToPartition,
  migrateLegacyRunToPartitionDetailed,
} from "../../src/lib/planning/store/runReadMigration";
import { getRunPaths } from "../../src/lib/planning/store/runReadSources";
import {
  fromStoredPayload,
  toStoredPayload,
} from "../../src/lib/planning/store/runRecordCodec";
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

async function writeStoredJson(filePath: string, payload: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(await toStoredPayload(payload), null, 2)}\n`, "utf-8");
}

async function readStoredRun(filePath: string): Promise<PlanningRunRecord> {
  const raw = JSON.parse(await fsPromises.readFile(filePath, "utf-8")) as unknown;
  const decoded = await fromStoredPayload(raw);
  return decoded.payload as PlanningRunRecord;
}

describe("planning run read migration", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-read-migration-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("moves a legacy run meta into the profile partition without changing the stored run", async () => {
    const run = sampleRun();
    const paths = getRunPaths(run.id, run.profileId);
    await writeStoredJson(paths.legacyMetaPath, run);
    await writeStoredJson(paths.legacyFilePath, run);

    await expect(migrateLegacyRunToPartition({ record: run, paths })).resolves.toBe(true);

    expect(paths.partitionMetaPath).toBeTruthy();
    expect(fs.existsSync(paths.partitionMetaPath ?? "")).toBe(true);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(false);
    expect(fs.existsSync(paths.legacyFilePath)).toBe(false);
    await expect(readStoredRun(paths.partitionMetaPath ?? "")).resolves.toEqual(run);
  });

  it("returns a detailed migrated result without changing the stored run", async () => {
    const run = sampleRun({ id: "detailed-migrated-run" });
    const paths = getRunPaths(run.id, run.profileId);
    await writeStoredJson(paths.legacyMetaPath, run);

    await expect(migrateLegacyRunToPartitionDetailed({ record: run, paths })).resolves.toEqual({
      migrated: true,
    });

    await expect(readStoredRun(paths.partitionMetaPath ?? "")).resolves.toEqual(run);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(false);
  });

  it("does not overwrite an existing partition meta file", async () => {
    const run = sampleRun();
    const existing = sampleRun({ title: "Existing partition run" });
    const paths = getRunPaths(run.id, run.profileId);
    await writeStoredJson(paths.partitionMetaPath ?? "", existing);
    await writeStoredJson(paths.legacyMetaPath, run);

    await expect(migrateLegacyRunToPartition({ record: run, paths })).resolves.toBe(false);

    await expect(readStoredRun(paths.partitionMetaPath ?? "")).resolves.toEqual(existing);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(true);
  });

  it("reports the skip reason when a readable partition meta file blocks migration", async () => {
    const run = sampleRun({ id: "existing-partition-run" });
    const existing = sampleRun({
      id: run.id,
      title: "Existing partition run",
    });
    const paths = getRunPaths(run.id, run.profileId);
    await writeStoredJson(paths.partitionMetaPath ?? "", existing);
    await writeStoredJson(paths.legacyMetaPath, run);

    await expect(migrateLegacyRunToPartitionDetailed({ record: run, paths })).resolves.toEqual({
      migrated: false,
      reason: "partition-meta-readable",
    });

    await expect(readStoredRun(paths.partitionMetaPath ?? "")).resolves.toEqual(existing);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(true);
  });

  it("preserves the existing behavior of replacing malformed partition meta", async () => {
    const run = sampleRun({ id: "malformed-partition-run" });
    const paths = getRunPaths(run.id, run.profileId);
    await fsPromises.mkdir(paths.partitionRunDir ?? "", { recursive: true });
    await fsPromises.writeFile(paths.partitionMetaPath ?? "", "{invalid-json", "utf-8");
    await writeStoredJson(paths.legacyMetaPath, run);

    await expect(migrateLegacyRunToPartitionDetailed({ record: run, paths })).resolves.toEqual({
      migrated: true,
    });

    await expect(readStoredRun(paths.partitionMetaPath ?? "")).resolves.toEqual(run);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(false);
  });

  it("skips migration when no profile partition target is available", async () => {
    const run = sampleRun();
    const paths = getRunPaths(run.id);

    await expect(migrateLegacyRunToPartition({ record: run, paths })).resolves.toBe(false);
    expect(fs.existsSync(paths.legacyMetaPath)).toBe(false);
  });

  it("reports the skip reason when no profile partition target is available", async () => {
    const run = sampleRun({ id: "missing-target-run" });
    const paths = getRunPaths(run.id);

    await expect(migrateLegacyRunToPartitionDetailed({ record: run, paths })).resolves.toEqual({
      migrated: false,
      reason: "missing-partition-target",
    });
  });
});
