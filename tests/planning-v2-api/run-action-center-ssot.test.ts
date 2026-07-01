import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as runDetailGET } from "../../src/app/api/planning/v2/runs/[id]/route";
import { GET as actionPlanGET } from "../../src/app/api/planning/runs/[id]/action-plan/route";
import { GET as actionProgressGET } from "../../src/app/api/planning/runs/[id]/action-progress/route";
import { resolveProfileRunDir, resolveProfileRunMetaPath } from "../../src/lib/planning/store/paths";
import { migrateEmbeddedRunActionCenters } from "../../src/lib/planning/store/runActionStore";
import { getRun, updateRun } from "../../src/lib/planning/store/runStore";
import {
  type PlanningRunActionPlan,
  type PlanningRunActionProgress,
} from "../../src/lib/planning/store/types";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

installPlanningAuthRequiredFalseForTest();

function profileFixture() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

function jsonRequest(method: string, urlPath: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
    },
  });
}

async function createRunFixture(): Promise<{ profileId: string; runId: string }> {
  const profileRes = await profilesPOST(jsonRequest("POST", "/api/planning/v2/profiles", {
    name: "action-center ssot profile",
    profile: profileFixture(),
  }));
  const profilePayload = await profileRes.json() as { data?: { id?: string } };
  const profileId = String(profilePayload.data?.id ?? "");
  expect(profileId).toBeTruthy();

  const runRes = await runsPOST(jsonRequest("POST", "/api/planning/v2/runs", {
    profileId,
    title: "action-center ssot run",
    input: {
      horizonMonths: 12,
      runScenarios: true,
      getActions: true,
      analyzeDebt: true,
    },
  }));
  const runPayload = await runRes.json() as { data?: { id?: string } };
  const runId = String(runPayload.data?.id ?? "");
  expect(runId).toBeTruthy();
  return { profileId, runId };
}

async function readActionCenter(runId: string): Promise<{
  plan: PlanningRunActionPlan;
  progress: PlanningRunActionProgress;
}> {
  const planRes = await actionPlanGET(getRequest(`/api/planning/runs/${runId}/action-plan`), {
    params: Promise.resolve({ id: runId }),
  });
  const planPayload = await planRes.json() as { data?: PlanningRunActionPlan };
  expect(planRes.status).toBe(200);
  expect(planPayload.data).toBeTruthy();

  const progressRes = await actionProgressGET(getRequest(`/api/planning/runs/${runId}/action-progress`), {
    params: Promise.resolve({ id: runId }),
  });
  const progressPayload = await progressRes.json() as { data?: PlanningRunActionProgress };
  expect(progressRes.status).toBe(200);
  expect(progressPayload.data).toBeTruthy();

  return {
    plan: planPayload.data as PlanningRunActionPlan,
    progress: progressPayload.data as PlanningRunActionProgress,
  };
}

describe("planning v2 action center source of truth", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-action-center-ssot-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns canonical progress even when embedded run meta is stale", async () => {
    const { profileId, runId } = await createRunFixture();
    const { plan, progress } = await readActionCenter(runId);
    const actionKey = progress.items[0]?.actionKey ?? "";
    expect(actionKey).toBeTruthy();

    const canonicalProgress: PlanningRunActionProgress = {
      ...progress,
      updatedAt: "2026-03-11T01:00:00.000Z",
      items: progress.items.map((item, index) => index === 0
        ? { ...item, status: "done", note: "canonical", updatedAt: "2026-03-11T01:00:00.000Z", doneAt: "2026-03-11T01:00:00.000Z" }
        : item),
    };
    const staleProgress: PlanningRunActionProgress = {
      ...progress,
      updatedAt: "2026-03-10T01:00:00.000Z",
      items: progress.items.map((item, index) => index === 0
        ? { ...item, status: "todo", note: "stale", updatedAt: "2026-03-10T01:00:00.000Z" }
        : item),
    };
    const currentRun = await updateRun(runId, {
      actionCenter: {
        plan,
        progress: staleProgress,
      },
    });
    expect(currentRun).toBeTruthy();
    const actualRunDir = resolveProfileRunDir(profileId, runId);
    fs.writeFileSync(path.join(actualRunDir, "action-progress.json"), `${JSON.stringify(canonicalProgress)}\n`);

    const response = await runDetailGET(getRequest(`/api/planning/v2/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    const payload = await response.json() as {
      data?: {
        actionCenter?: {
          progress?: PlanningRunActionProgress;
        };
      };
    };

    expect(response.status).toBe(200);
    const item = payload.data?.actionCenter?.progress?.items?.find((entry) => entry.actionKey === actionKey);
    expect(item).toMatchObject({ status: "done", note: "canonical" });
  });

  it("does not rewrite run meta on detail read when canonical files already exist", async () => {
    const { profileId, runId } = await createRunFixture();
    await readActionCenter(runId);
    const metaPath = resolveProfileRunMetaPath(profileId, runId);
    const before = fs.statSync(metaPath).mtimeMs;

    const response = await runDetailGET(getRequest(`/api/planning/v2/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });

    expect(response.status).toBe(200);
    expect(fs.statSync(metaPath).mtimeMs).toBe(before);
  });

  it("migrates embedded legacy action center with dry-run and rollback", async () => {
    const { profileId, runId } = await createRunFixture();
    const { plan, progress } = await readActionCenter(runId);
    const legacyProgress: PlanningRunActionProgress = {
      ...progress,
      updatedAt: "2026-03-11T02:00:00.000Z",
      items: progress.items.map((item, index) => index === 0
        ? { ...item, status: "done", note: "legacy migrated", updatedAt: "2026-03-11T02:00:00.000Z", doneAt: "2026-03-11T02:00:00.000Z" }
        : item),
    };
    const runDir = resolveProfileRunDir(profileId, runId);
    const planPath = path.join(runDir, "action-plan.json");
    const progressPath = path.join(runDir, "action-progress.json");
    fs.rmSync(planPath, { force: true });
    fs.rmSync(progressPath, { force: true });
    await updateRun(runId, {
      actionCenter: {
        plan,
        progress: legacyProgress,
      },
    });

    const dryRun = await migrateEmbeddedRunActionCenters({ dryRun: true });
    expect(dryRun.summary.candidates).toBe(1);
    expect(dryRun.summary.migrated).toBe(0);
    expect(fs.existsSync(planPath)).toBe(false);
    expect(fs.existsSync(progressPath)).toBe(false);

    const applied = await migrateEmbeddedRunActionCenters({ dryRun: false });
    expect(applied.summary.migrated).toBe(1);
    expect(applied.summary.embeddedRemoved).toBe(1);
    expect(applied.summary.planFilesWritten).toBe(1);
    expect(applied.summary.progressFilesWritten).toBe(1);
    expect((await getRun(runId))?.actionCenter).toBeUndefined();

    const detailRes = await runDetailGET(getRequest(`/api/planning/v2/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    const detailPayload = await detailRes.json() as {
      data?: {
        actionCenter?: {
          progress?: PlanningRunActionProgress;
        };
      };
    };
    expect(detailRes.status).toBe(200);
    expect(detailPayload.data?.actionCenter?.progress?.items?.[0]).toMatchObject({
      status: "done",
      note: "legacy migrated",
    });

    const rollbackDryRun = await migrateEmbeddedRunActionCenters({ rollback: true, dryRun: true });
    expect(rollbackDryRun.summary.candidates).toBe(1);
    const rollback = await migrateEmbeddedRunActionCenters({ rollback: true, dryRun: false });
    expect(rollback.summary.rolledBack).toBe(1);
    expect(rollback.summary.rollbackVerified).toBe(1);
    expect((await getRun(runId))?.actionCenter?.progress.items[0]).toMatchObject({
      status: "done",
      note: "legacy migrated",
    });
  });

  it("keeps list summary and client fallback free of per-run action-progress fetches", () => {
    const routeService = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/routeService.ts"),
      "utf-8",
    );
    const client = fs.readFileSync(
      path.join(process.cwd(), "src/components/PlanningRunsClient.tsx"),
      "utf-8",
    );

    expect(routeService).not.toContain("for (const run of sanitizedRuns)");
    expect(routeService).not.toContain("run.actionCenter?.plan ??");
    expect(routeService).not.toContain("updateCurrentUserRun(run.id, {");
    expect(client).not.toContain("loadActionProgressSummaryForRuns");
    expect(client).not.toContain("/action-progress`, { cache: \"no-store\" }");
  });
});
