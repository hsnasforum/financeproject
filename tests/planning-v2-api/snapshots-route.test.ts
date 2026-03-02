import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../../src/app/api/planning/v2/snapshots/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

const tempDirs: string[] = [];

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function snapshotFixture(asOf: string, fetchedAt: string) {
  return {
    version: 1,
    asOf,
    fetchedAt,
    korea: {
      policyRatePct: 2.75,
      cpiYoYPct: 2.1,
      newDepositAvgPct: 3.25,
    },
    sources: [
      {
        name: "fixture",
        url: "https://example.com",
        fetchedAt,
      },
    ],
    warnings: [],
  };
}

function request(urlPath: string): Request {
  return new Request(`http://localhost:3000${urlPath}`, {
    method: "GET",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
    },
  });
}

describe("GET /api/planning/v2/snapshots", () => {
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

  it("returns items sorted newest-first with non-negative staleDays", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-snapshots-api-"));
    tempDirs.push(root);

    const latestPath = path.join(root, "assumptions.latest.json");
    const historyDir = path.join(root, "assumptions-history");
    env.PLANNING_ASSUMPTIONS_PATH = latestPath;
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = historyDir;

    const older = snapshotFixture("2026-02-10", "2026-02-10T09:00:00.000Z");
    const latest = snapshotFixture("2026-02-28", "2026-03-01T09:00:00.000Z");

    const oldId = "2026-02-10_2026-02-10-09-00-00";
    const newId = "2026-02-28_2026-03-01-09-00-00";
    await writeJson(path.join(historyDir, `${oldId}.json`), older);
    await writeJson(path.join(historyDir, `${newId}.json`), latest);
    await writeJson(latestPath, latest);

    const response = await GET(request("/api/planning/v2/snapshots?limit=20"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        latestId?: string | null;
        latestLabel?: string;
        items?: Array<{ id?: string; createdAt?: string; staleDays?: number; label?: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.latestId).toBe(newId);
    expect(payload.data?.latestLabel).toContain("LATEST");
    expect(payload.data?.items?.map((item) => item.id)).toEqual([newId, oldId]);
    expect((payload.data?.items ?? []).every((item) => typeof item.staleDays === "number" && item.staleDays >= 0)).toBe(true);
    expect(payload.data?.items?.[0]?.createdAt).toBe("2026-03-01T09:00:00.000Z");
    expect(payload.data?.items?.[0]?.label).toContain(newId);
  });
});
