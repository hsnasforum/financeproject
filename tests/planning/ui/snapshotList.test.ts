import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSnapshotListForPlanning } from "../../../src/app/planning/_lib/snapshotList";

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("loadSnapshotListForPlanning", () => {
  it("loads latest and history with minimal planning fields", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "planning-snapshot-list-"));
    tempDirs.push(baseDir);

    const historyDir = path.join(baseDir, ".data", "planning", "assumptions", "history");
    const latestPath = path.join(baseDir, ".data", "planning", "assumptions.latest.json");

    const older = {
      version: 1,
      asOf: "2026-01-31",
      fetchedAt: "2026-02-10T09:00:00.000Z",
      korea: { policyRatePct: 2.5, cpiYoYPct: 2.0, newDepositAvgPct: 3.1 },
      sources: [],
      warnings: ["W1"],
    };
    const latest = {
      version: 1,
      asOf: "2026-02-29",
      fetchedAt: "2026-03-01T09:00:00.000Z",
      korea: { policyRatePct: 2.75, cpiYoYPct: 2.1, newDepositAvgPct: 3.2 },
      sources: [],
      warnings: [],
    };

    await writeJson(path.join(historyDir, "snap-old.json"), older);
    await writeJson(path.join(historyDir, "snap-latest.json"), latest);
    await writeJson(latestPath, latest);

    const result = await loadSnapshotListForPlanning(20, {
      baseDir,
      now: new Date("2026-03-05T00:00:00.000Z"),
    });

    expect(result.latest?.asOf).toBe("2026-02-29");
    expect(result.latest?.warningsCount).toBe(0);
    expect(result.history.length).toBe(2);
    expect(result.history[0]?.id).toBe("snap-latest");
    expect(result.history[1]?.id).toBe("snap-old");
    expect(result.history[0]?.korea?.policyRatePct).toBe(2.75);
  });
});
