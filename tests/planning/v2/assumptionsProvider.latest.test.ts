import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileAssumptionsProvider } from "../../../src/lib/planning/providers/assumptionsProvider";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

const tempDirs: string[] = [];

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function snapshotFixture() {
  return {
    version: 1,
    asOf: "2026-02-28",
    fetchedAt: "2026-03-01T09:00:00.000Z",
    korea: {
      cpiYoYPct: 2.2,
      newDepositAvgPct: 3.1,
    },
    sources: [],
    warnings: [],
  };
}

function profileFixture() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 2_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

describe("createFileAssumptionsProvider", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("resolves latest selection to latest history snapshot id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-assumptions-provider-"));
    tempDirs.push(root);

    const latestPath = path.join(root, "assumptions.latest.json");
    const historyDir = path.join(root, "assumptions-history");
    env.PLANNING_ASSUMPTIONS_PATH = latestPath;
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = historyDir;

    const latest = snapshotFixture();
    const latestId = "2026-02-28_2026-03-01-09-00-00";
    await writeJson(path.join(historyDir, `${latestId}.json`), latest);
    await writeJson(latestPath, latest);

    const provider = createFileAssumptionsProvider();
    const resolved = await provider.getBaseAssumptions(profileFixture(), {}, undefined);

    expect(resolved.snapshotId).toBe(latestId);
    expect(resolved.snapshotMeta.id).toBe(latestId);
    expect(resolved.snapshotMeta.missing).toBe(false);
  });
});
