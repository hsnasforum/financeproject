import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readRunMetaRecordByPathDetailed,
} from "../../src/lib/planning/store/runMetaReader";
import {
  fromStoredPayload,
  toStoredPayload,
} from "../../src/lib/planning/store/runRecordCodec";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

function resultDto() {
  return buildResultDtoV1({
    generatedAt: "2026-03-05T00:00:00.000Z",
    simulate: {
      summary: {
        startNetWorthKrw: 10_000_000,
        endNetWorthKrw: 12_000_000,
        worstCashKrw: 2_000_000,
        worstCashMonthIndex: 3,
        goalsAchievedCount: 1,
        goalsMissedCount: 0,
        warningsCount: 0,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [
        {
          monthIndex: 0,
          row: {
            month: 1,
            income: 4_000_000,
            expenses: 2_200_000,
            debtPayment: 300_000,
            liquidAssets: 4_000_000,
            netWorth: 10_000_000,
            totalDebt: 1_000_000,
          },
        },
      ],
      timeline: [
        {
          month: 1,
          income: 4_000_000,
          expenses: 2_200_000,
          debtPayment: 300_000,
          liquidAssets: 4_000_000,
          netWorth: 10_000_000,
          totalDebt: 1_000_000,
        },
      ],
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

async function writeStoredJson(filePath: string, payload: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(await toStoredPayload(payload), null, 2)}\n`, "utf-8");
}

async function readStoredRun(filePath: string): Promise<PlanningRunRecord> {
  const raw = JSON.parse(await fsPromises.readFile(filePath, "utf-8")) as unknown;
  const decoded = await fromStoredPayload(raw);
  return decoded.payload as PlanningRunRecord;
}

function fileFingerprint(filePath: string): { mtimeMs: number; size: number } {
  const stat = fs.statSync(filePath);
  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
}

describe("planning run meta reader", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-meta-reader-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("classifies missing and invalid run meta files without runStore orchestration", async () => {
    const missingPath = path.join(root, "missing.json");
    await expect(readRunMetaRecordByPathDetailed(missingPath)).resolves.toEqual({
      status: "missing",
      reason: "file-missing",
    });

    const invalidPath = path.join(root, "invalid.json");
    await fsPromises.writeFile(invalidPath, "{\n", "utf-8");
    await expect(readRunMetaRecordByPathDetailed(invalidPath)).resolves.toEqual({
      status: "unreadable",
      reason: "invalid-json",
    });
  });

  it("hydrates legacy meta in memory without rewriting unless migration persistence is enabled", async () => {
    const runPath = path.join(root, "run.json");
    await writeStoredJson(runPath, sampleRun());
    const before = fileFingerprint(runPath);

    const loaded = await readRunMetaRecordByPathDetailed(runPath);

    expect(loaded.status).toBe("found");
    expect(loaded.status === "found" ? loaded.run.outputs.engineSchemaVersion : undefined).toBe(1);
    expect(fileFingerprint(runPath)).toEqual(before);

    const persistedBefore = await readStoredRun(runPath);
    expect(persistedBefore.outputs.engineSchemaVersion).toBeUndefined();

    const persisted = await readRunMetaRecordByPathDetailed(runPath, { persistMigrations: true });

    expect(persisted.status).toBe("found");
    const stored = await readStoredRun(runPath);
    expect(stored.outputs.engineSchemaVersion).toBe(1);
    expect(stored.outputs.engine).toBeDefined();
  });
});
