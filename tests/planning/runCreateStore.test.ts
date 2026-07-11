import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveProfileRunBlobsDir,
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "../../src/lib/planning/store/paths";
import {
  createRunInFileStore,
  type CreateRunInFileStoreInput,
  type RunCreateStoreSource,
} from "../../src/lib/planning/store/runCreateStore";
import { type RunIndexEntry } from "../../src/lib/planning/store/runIndex";
import { fromStoredPayload } from "../../src/lib/planning/store/runRecordCodec";
import { readStorageJournalEvents } from "../../src/lib/planning/storage/journal";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalProfilePartitionsDir = process.env.PLANNING_PROFILE_PARTITIONS_DIR;
const originalStorageJournalPath = process.env.PLANNING_STORAGE_JOURNAL_PATH;

function resultDto() {
  return buildResultDtoV1({
    generatedAt: "2026-03-05T00:00:00.000Z",
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

function sampleRunSource(overrides: Partial<RunCreateStoreSource> = {}): RunCreateStoreSource {
  return {
    profileId: "profile-1",
    title: "  create store run  ",
    input: { horizonMonths: 12 },
    meta: { snapshot: { missing: true } },
    stages: [
      {
        id: "simulate",
        status: "SUCCESS",
        outputRef: {
          key: "simulate",
          hasData: true,
        },
      },
    ],
    outputs: {
      resultDto: resultDto(),
      simulate: {
        summary: { endNetWorthKrw: 1_000_000 },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [],
      },
    } as unknown as RunCreateStoreSource["outputs"],
    ...overrides,
  };
}

async function readStoredPayload<T>(filePath: string): Promise<T> {
  const raw = JSON.parse(await fsPromises.readFile(filePath, "utf-8")) as unknown;
  const decoded = await fromStoredPayload(raw);
  return decoded.payload as T;
}

describe("planning run create store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-create-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_PARTITIONS_DIR = path.join(root, "vault", "profiles");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, "storage", "journal.ndjson");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalProfilePartitionsDir === "string") env.PLANNING_PROFILE_PARTITIONS_DIR = originalProfilePartitionsDir;
    else delete env.PLANNING_PROFILE_PARTITIONS_DIR;

    if (typeof originalStorageJournalPath === "string") env.PLANNING_STORAGE_JOURNAL_PATH = originalStorageJournalPath;
    else delete env.PLANNING_STORAGE_JOURNAL_PATH;

    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes blobs, meta, index entry, and retention through injected boundaries", async () => {
    const upsertIndexEntry = vi.fn<CreateRunInFileStoreInput["upsertIndexEntry"]>(async () => undefined);
    const removeIndexEntry = vi.fn<CreateRunInFileStoreInput["removeIndexEntry"]>(async () => undefined);
    const applyRetention = vi.fn<CreateRunInFileStoreInput["applyRetention"]>(async () => undefined);

    const record = await createRunInFileStore({
      source: sampleRunSource(),
      runId: "run-1",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
      options: { maxPerProfile: 3 },
      upsertIndexEntry,
      removeIndexEntry,
      applyRetention,
    });

    expect(record).toMatchObject({
      id: "run-1",
      profileId: "profile-1",
      title: "create store run",
      schemaVersion: 2,
    });
    expect(record.outputs.simulate?.ref?.name).toBe("simulate");
    expect((record.outputs.simulate as { summary?: unknown } | undefined)?.summary).toBeUndefined();
    expect(record.stages?.[0]?.outputRef?.ref?.name).toBe("simulate");

    const storedRun = await readStoredPayload<PlanningRunRecord>(resolveProfileRunMetaPath("profile-1", "run-1"));
    expect(storedRun.outputs.simulate?.ref?.path).toBe(record.outputs.simulate?.ref?.path);

    const storedBlob = await readStoredPayload<{ summary?: { endNetWorthKrw?: number } }>(
      path.join(resolveProfileRunBlobsDir("profile-1", "run-1"), "simulate.json"),
    );
    expect(storedBlob.summary?.endNetWorthKrw).toBe(1_000_000);

    expect(upsertIndexEntry).toHaveBeenCalledWith(expect.objectContaining<Partial<RunIndexEntry>>({
      id: "run-1",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
    }));
    expect(applyRetention).toHaveBeenCalledWith(record, expect.objectContaining({ maxPerProfile: 3 }));
    expect(removeIndexEntry).not.toHaveBeenCalled();

    const events = await readStorageJournalEvents();
    expect(events.map((event) => event.event)).toEqual([
      "BEGIN",
      "STEP",
      "STEP",
      "STEP",
      "STEP",
      "COMMIT",
    ]);
    expect(events.filter((event) => event.event === "STEP").map((event) => event.step)).toEqual([
      "WRITE_BLOB",
      "WRITE_META",
      "UPSERT_INDEX",
      "APPLY_RETENTION",
    ]);
  });

  it("delegates stage blob writes through the injected blob write boundary", async () => {
    const source = sampleRunSource();
    const blobRef = {
      name: "simulate" as const,
      path: ".data/planning/vault/profiles/profile-1/runs/run-injected/blobs/simulate.json",
      sizeBytes: 123,
    };
    const writeRunStageBlobs = vi.fn<NonNullable<CreateRunInFileStoreInput["writeRunStageBlobs"]>>(async () => ({
      simulate: blobRef,
    }));
    const upsertIndexEntry = vi.fn<CreateRunInFileStoreInput["upsertIndexEntry"]>(async () => undefined);
    const removeIndexEntry = vi.fn<CreateRunInFileStoreInput["removeIndexEntry"]>(async () => undefined);
    const applyRetention = vi.fn<CreateRunInFileStoreInput["applyRetention"]>(async () => undefined);

    const record = await createRunInFileStore({
      source,
      runId: "run-injected",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
      options: {
        enforceRetention: false,
        timelineSampleStepMonths: 6,
      },
      upsertIndexEntry,
      removeIndexEntry,
      applyRetention,
      writeRunStageBlobs,
    });

    const writeInput = writeRunStageBlobs.mock.calls[0]?.[0];
    expect(writeInput).toMatchObject({
      profileId: "profile-1",
      runId: "run-injected",
      options: {
        enforceRetention: false,
        timelineSampleStepMonths: 6,
      },
    });
    expect(writeInput?.outputs).toBe(source.outputs);
    expect(writeInput?.tx?.kind).toBe("RUN_CREATE");
    expect(record.outputs.simulate?.ref).toMatchObject(blobRef);
    expect(record.stages?.[0]?.outputRef?.ref).toMatchObject(blobRef);
    expect(applyRetention).not.toHaveBeenCalled();

    const events = await readStorageJournalEvents();
    expect(events.filter((event) => event.event === "STEP").map((event) => event.step)).toEqual([
      "WRITE_META",
      "UPSERT_INDEX",
    ]);
  });

  it("rolls back run files and index entry when index write fails", async () => {
    const upsertIndexEntry = vi.fn<CreateRunInFileStoreInput["upsertIndexEntry"]>(async () => {
      throw new Error("index write failed");
    });
    const removeIndexEntry = vi.fn<CreateRunInFileStoreInput["removeIndexEntry"]>(async () => undefined);
    const applyRetention = vi.fn<CreateRunInFileStoreInput["applyRetention"]>(async () => undefined);

    await expect(createRunInFileStore({
      source: sampleRunSource(),
      runId: "run-fail",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
      upsertIndexEntry,
      removeIndexEntry,
      applyRetention,
    })).rejects.toThrow("index write failed");

    expect(fs.existsSync(resolveProfileRunDir("profile-1", "run-fail"))).toBe(false);
    expect(removeIndexEntry).toHaveBeenCalledWith("run-fail");
    expect(applyRetention).not.toHaveBeenCalled();

    const events = await readStorageJournalEvents();
    expect(events.at(-1)).toMatchObject({
      event: "ROLLBACK",
      note: "index write failed",
    });

    const retryUpsertIndexEntry = vi.fn<CreateRunInFileStoreInput["upsertIndexEntry"]>(async () => undefined);
    const retried = await createRunInFileStore({
      source: sampleRunSource(),
      runId: "run-fail",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
      upsertIndexEntry: retryUpsertIndexEntry,
      removeIndexEntry,
      applyRetention,
    });
    expect(retried.id).toBe("run-fail");
    expect(retryUpsertIndexEntry).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(resolveProfileRunMetaPath("profile-1", "run-fail"))).toBe(true);
  });

  it("fails closed without touching an existing deterministic run directory", async () => {
    const runDir = resolveProfileRunDir("profile-1", "planning_idem_existing");
    const sentinelPath = path.join(runDir, "sentinel.bin");
    await fsPromises.mkdir(runDir, { recursive: true });
    await fsPromises.writeFile(sentinelPath, Buffer.from([0, 1, 2, 3]));

    const writeRunStageBlobs = vi.fn<NonNullable<CreateRunInFileStoreInput["writeRunStageBlobs"]>>();
    const upsertIndexEntry = vi.fn<CreateRunInFileStoreInput["upsertIndexEntry"]>();
    const removeIndexEntry = vi.fn<CreateRunInFileStoreInput["removeIndexEntry"]>();
    const applyRetention = vi.fn<CreateRunInFileStoreInput["applyRetention"]>();

    await expect(createRunInFileStore({
      source: sampleRunSource(),
      runId: "planning_idem_existing",
      profileId: "profile-1",
      createdAt: "2026-07-03T00:00:00.000Z",
      upsertIndexEntry,
      removeIndexEntry,
      applyRetention,
      writeRunStageBlobs,
    })).rejects.toThrow("동일한 실행 기록 대상이 이미 존재합니다.");

    expect(await fsPromises.readFile(sentinelPath)).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(writeRunStageBlobs).not.toHaveBeenCalled();
    expect(upsertIndexEntry).not.toHaveBeenCalled();
    expect(removeIndexEntry).not.toHaveBeenCalled();
    expect(applyRetention).not.toHaveBeenCalled();
    expect(await readStorageJournalEvents()).toEqual([]);
  });
});
