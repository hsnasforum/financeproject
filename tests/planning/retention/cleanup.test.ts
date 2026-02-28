import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPlanningCleanup, planPlanningCleanup } from "../../../src/lib/planning/retention/cleanup";
import { DEFAULT_PLANNING_RETENTION_POLICY } from "../../../src/lib/planning/retention/policy";

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function makeIso(daysAgo: number): string {
  const now = Date.parse("2026-03-01T00:00:00.000Z");
  return new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

describe("planning retention cleanup planner", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("plans and applies cleanup by policy", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-retention-"));

    const runsDir = path.join(root, ".data/planning/runs");
    for (const profileId of ["p1", "p2"]) {
      for (let i = 0; i < 60; i += 1) {
        writeJson(path.join(runsDir, `${profileId}-${i}.json`), {
          version: 1,
          id: `${profileId}-${i}`,
          profileId,
          createdAt: makeIso(i),
          input: {},
          meta: {},
          outputs: {},
        });
      }
    }

    const cacheDir = path.join(root, ".data/planning/cache");
    for (let i = 0; i < 10; i += 1) {
      const key = `${String(i).padStart(64, "0")}`.slice(0, 64);
      writeJson(path.join(cacheDir, `simulate.${key}.json`), {
        version: 1,
        kind: "simulate",
        key,
        createdAt: i < 5 ? makeIso(20) : makeIso(1),
        expiresAt: i < 5 ? makeIso(2) : makeIso(-5),
        meta: {
          horizonMonths: 120,
          assumptionsHash: "a".repeat(64),
          optionsHash: "b".repeat(64),
        },
      });
    }

    const reportsDir = path.join(root, ".data/planning/ops/reports");
    for (let i = 0; i < 80; i += 1) {
      const name = `202601${String((i % 28) + 1).padStart(2, "0")}-${String(i).padStart(6, "0")}.json`;
      writeJson(path.join(reportsDir, name), {
        id: i,
      });
    }

    const assumptionsHistoryDir = path.join(root, ".data/planning/assumptions/history");
    for (let i = 0; i < 300; i += 1) {
      writeJson(path.join(assumptionsHistoryDir, `snapshot-${String(i).padStart(4, "0")}.json`), {
        version: 1,
        asOf: "2026-01-01",
        fetchedAt: makeIso(i),
        korea: {},
        sources: [],
        warnings: [],
      });
    }

    const plan = await planPlanningCleanup({
      target: "all",
      nowIso: "2026-03-01T00:00:00.000Z",
      policy: DEFAULT_PLANNING_RETENTION_POLICY,
      baseDir: root,
    });

    expect(plan.summary.byTarget.runs).toBe(20);
    expect(plan.summary.byTarget.cache).toBe(5);
    expect(plan.summary.byTarget.opsReports).toBe(30);
    expect(plan.summary.byTarget.assumptionsHistory).toBe(100);
    expect(plan.summary.deleteCount).toBe(155);

    const applied = await applyPlanningCleanup(plan, { baseDir: root });
    expect(applied.deleted).toBe(155);
    expect(applied.failed?.length ?? 0).toBe(0);

    expect(fs.readdirSync(runsDir).filter((name) => name.endsWith(".json")).length).toBe(100);
    expect(fs.readdirSync(cacheDir).filter((name) => name.endsWith(".json")).length).toBe(5);
    expect(fs.readdirSync(reportsDir).filter((name) => name.endsWith(".json")).length).toBe(50);
    expect(fs.readdirSync(assumptionsHistoryDir).filter((name) => name.endsWith(".json")).length).toBe(200);
  });
});

