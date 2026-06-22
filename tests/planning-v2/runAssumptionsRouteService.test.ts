import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PlanningRunAssumptionsResolveError,
  resolvePlanningRunAssumptions,
} from "../../src/lib/planning/server/v2/runAssumptionsRouteService";
import { saveAssumptionsOverrides } from "../../src/lib/planning/assumptions/overridesStorage";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalAssumptionsOverridesPath = process.env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;

function assumptionsSnapshotFixture(asOf: string, fetchedAt: string) {
  return {
    version: 1,
    asOf,
    fetchedAt,
    korea: {
      policyRatePct: 2.75,
      cpiYoYPct: 2.1,
      newDepositAvgPct: 3.25,
    },
    sources: [],
    warnings: [],
  };
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

describe("runAssumptionsRouteService", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-assumptions-service-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions-history");
    env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = path.join(root, "assumptions-overrides.json");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalAssumptionsHistoryDir === "string") {
      env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    } else {
      delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
    }

    if (typeof originalAssumptionsOverridesPath === "string") {
      env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = originalAssumptionsOverridesPath;
    } else {
      delete env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;
    }

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("merges stored profile overrides with request overrides for run assumptions", async () => {
    await writeJson(
      env.PLANNING_ASSUMPTIONS_PATH!,
      assumptionsSnapshotFixture("2026-03-01", "2026-03-02T00:00:00.000Z"),
    );
    await saveAssumptionsOverrides([
      {
        key: "inflationPct",
        value: 2.7,
        reason: "ops override",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    ], "profile-1");

    const context = await resolvePlanningRunAssumptions({
      profileId: "profile-1",
      assumptionsOverride: {
        expectedReturn: 6.8,
      },
      riskTolerance: "mid",
    });

    expect(context.snapshotMeta.missing).toBe(false);
    if (context.snapshotMeta.missing) throw new Error("expected snapshot meta to be present");
    expect(context.snapshotMeta.asOf).toBe("2026-03-01");
    expect(context.baseAssumptions.inflationPct).toBeCloseTo(2.7, 6);
    expect(context.baseAssumptions.investReturnPct).toBeCloseTo(6.8, 6);
    expect(context.finalSimulationAssumptions.inflation).toBeCloseTo(2.7, 6);
    expect(context.finalSimulationAssumptions.expectedReturn).toBeCloseTo(6.8, 6);
    expect(context.appliedOverrides.some((entry) => entry.key === "inflationPct" && entry.value === 2.7)).toBe(true);
    expect(context.appliedOverrides.some((entry) => entry.key === "investReturnPct" && entry.value === 6.8)).toBe(true);
  });

  it("maps a missing requested snapshot to the run assumptions error contract", async () => {
    await expect(resolvePlanningRunAssumptions({
      profileId: "profile-1",
      requestedSnapshotId: "missing-snapshot",
      assumptionsOverride: {},
      riskTolerance: "mid",
    })).rejects.toMatchObject({
      name: "PlanningRunAssumptionsResolveError",
      kind: "SNAPSHOT_NOT_FOUND",
      status: 400,
      issues: ["input.snapshotId: 'missing-snapshot' not found"],
    } satisfies Partial<PlanningRunAssumptionsResolveError>);
  });
});
