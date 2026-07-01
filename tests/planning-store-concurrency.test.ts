import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, listRuns } from "../src/lib/planning/store/runStore";
import {
  ensureRunActionPlan,
  getRunActionProgress,
  updateRunActionProgress,
} from "../src/lib/planning/store/runActionStore";
import { type ActionItemV2 } from "../src/lib/planning/v2/actions/types";
import { type PlanningRunRecord } from "../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;
const originalProfileRegistryPath = process.env.PLANNING_PROFILE_REGISTRY_PATH;

function runInput(index: number): Omit<PlanningRunRecord, "version" | "schemaVersion" | "id" | "createdAt"> & {
  id: string;
  createdAt: string;
} {
  return {
    id: `run-${String(index).padStart(3, "0")}`,
    profileId: "profile-concurrency",
    title: `run ${index}`,
    createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    input: { horizonMonths: 12 },
    meta: { snapshot: { missing: true } },
    outputs: {
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/test/simulate.json",
        },
        summary: { endNetWorthKrw: index },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [],
      },
    },
  };
}

function actionItem(index: number): ActionItemV2 {
  return {
    code: "BUILD_EMERGENCY_FUND",
    severity: "warn",
    title: `Action ${index}`,
    summary: `Action summary ${index}`,
    why: [],
    metrics: {},
    steps: [`Step ${index}`],
    cautions: [],
  };
}

describe("planning run store mutation concurrency", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-run-concurrency-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
    env.PLANNING_PROFILE_REGISTRY_PATH = path.join(root, "vault", "profiles", "index.json");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;
    if (typeof originalProfileRegistryPath === "string") env.PLANNING_PROFILE_REGISTRY_PATH = originalProfileRegistryPath;
    else delete env.PLANNING_PROFILE_REGISTRY_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps all parallel run creates in the run index", async () => {
    const count = 100;
    await Promise.all(Array.from({ length: count }, (_, index) => createRun(
      runInput(index),
      { enforceRetention: false },
    )));

    const runs = await listRuns({ profileId: "profile-concurrency", limit: 150 });
    expect(runs).toHaveLength(count);
  }, 20_000);

  it("keeps all parallel action progress updates for distinct actions", async () => {
    const actionCount = 20;
    const run = await createRun({
      ...runInput(1),
      id: "run-actions",
      outputs: {
        actions: {
          ref: {
            name: "actions",
            path: ".data/test/actions.json",
          },
          actions: Array.from({ length: actionCount }, (_, index) => actionItem(index)),
        },
      },
    }, { enforceRetention: false });

    const plan = await ensureRunActionPlan(run);
    await Promise.all(plan.items.map((item) => updateRunActionProgress(run.id, {
      actionKey: item.actionKey,
      status: "done",
    })));

    const progress = await getRunActionProgress(run.id);
    expect(progress?.items.filter((item) => item.status === "done")).toHaveLength(actionCount);
  }, 20_000);
});
