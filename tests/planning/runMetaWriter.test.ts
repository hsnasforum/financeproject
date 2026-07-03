import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "../../src/lib/planning/store/paths";
import { writeRunMetaRecord } from "../../src/lib/planning/store/runMetaWriter";
import { fromStoredPayload } from "../../src/lib/planning/store/runRecordCodec";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalProfilePartitionsDir = process.env.PLANNING_PROFILE_PARTITIONS_DIR;

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
    outputs: {
      resultDto: resultDto(),
    },
    ...overrides,
  };
}

async function readStoredRun(filePath: string): Promise<PlanningRunRecord> {
  const raw = JSON.parse(await fsPromises.readFile(filePath, "utf-8")) as unknown;
  const decoded = await fromStoredPayload(raw);
  return decoded.payload as PlanningRunRecord;
}

describe("planning run meta writer", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-meta-writer-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_PARTITIONS_DIR = path.join(root, "vault", "profiles");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalProfilePartitionsDir === "string") env.PLANNING_PROFILE_PARTITIONS_DIR = originalProfilePartitionsDir;
    else delete env.PLANNING_PROFILE_PARTITIONS_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes canonical run meta without runStore update orchestration", async () => {
    const record = sampleRun({ title: "Updated run" });

    const written = await writeRunMetaRecord(record);

    expect(written.runDir).toBe(resolveProfileRunDir("profile-1", "run-1"));
    expect(written.metaPath).toBe(resolveProfileRunMetaPath("profile-1", "run-1"));
    expect(fs.existsSync(written.metaPath)).toBe(true);

    await expect(readStoredRun(written.metaPath)).resolves.toMatchObject({
      id: "run-1",
      profileId: "profile-1",
      title: "Updated run",
      schemaVersion: 2,
    });
  });
});
