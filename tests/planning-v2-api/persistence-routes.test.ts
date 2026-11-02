import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as profilesGET, POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import {
  DELETE as profileDELETE,
  GET as profileByIdGET,
  PATCH as profilePATCH,
} from "../../src/app/api/planning/v2/profiles/[id]/route";
import { POST as legacyRunPOST } from "../../src/app/api/planning/run/route";
import { GET as runsGET, POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import {
  DELETE as runDELETE,
  GET as runByIdGET,
} from "../../src/app/api/planning/v2/runs/[id]/route";
import { buildConfirmString } from "../../src/lib/ops/confirm";
import {
  createPlanningRun,
  parseCreatePlanningRunCommand,
} from "../../src/lib/planning/server/runs/createRunService";
import { resolvePlanningRunIdempotency } from "../../src/lib/planning/server/runs/createRunIdempotency";
import { getRun, listRuns } from "../../src/lib/planning/store/runStore";
import { computeProfileHash } from "../../src/lib/planning/v2/reproducibility";
import { applyProfilePatch } from "../../src/lib/planning/v2/profilePatch";
import {
  resolveProfileRunDir,
  resolveProfileRunMetaPath,
} from "../../src/lib/planning/store/paths";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;

const LOCAL_HOST = "localhost:3000";
const REMOTE_HOST = "example.com";

installPlanningAuthRequiredFalseForTest();

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_300_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    debts: [],
    goals: [
      { id: "goal-home", name: "Home", targetAmount: 12_000_000, targetMonth: 36, priority: 4 },
      { id: "goal-ret", name: "Retirement", targetAmount: 25_000_000, targetMonth: 240, priority: 5 },
    ],
  };
}

function buildGetRequest(urlPath: string, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
    },
  });
}

function buildJsonRequest(
  method: string,
  urlPath: string,
  body: unknown,
  host = LOCAL_HOST,
  extraHeaders: Record<string, string> = {},
): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method,
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

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

describe("planning v2 persistence routes", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-routes-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions-history");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
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

    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps v2 runs list/create storage and response shaping behind the route service", () => {
    const runsRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v2/runs/route.ts"),
      "utf-8",
    );
    const routeServiceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/routeService.ts"),
      "utf-8",
    );
    const createRunServiceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/createRunService.ts"),
      "utf-8",
    );
    const createRunStagePipelineSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/createRunStagePipeline.ts"),
      "utf-8",
    );
    const createRunRouteAdapterSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/createRunRouteAdapter.ts"),
      "utf-8",
    );
    const legacyRunRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/run/route.ts"),
      "utf-8",
    );
    const legacyV2RunRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v2/run/route.ts"),
      "utf-8",
    );
    const planningRscLoadersSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/pages/planningRscLoaders.ts"),
      "utf-8",
    );
    const reportRunScopeLoaderSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/reports/reportRunScopeLoader.ts"),
      "utf-8",
    );

    expect(runsRouteSource).not.toContain("auditLogStore");
    expect(runsRouteSource).not.toContain("ops/metrics/metricsStore");
    expect(runsRouteSource).not.toContain("runResponseSanitizer");
    expect(runsRouteSource).not.toContain("server/runs/repository");
    expect(runsRouteSource).toContain("listCurrentUserRunsForRoute");
    expect(runsRouteSource).toContain("handleCreatePlanningRunPost");

    expect(routeServiceSource).toContain("listCurrentUserRuns(options)");
    expect(routeServiceSource).toContain("createCurrentUserRun(input, options)");
    expect(routeServiceSource).toContain("sanitizeRunRecordForResponse");
    expect(routeServiceSource).toContain("appendAuditLog");
    expect(routeServiceSource).toContain("appendOpsMetricEvent");

    expect(createRunServiceSource).toContain("createCurrentUserRunResponseData");
    expect(createRunServiceSource).toContain("runCreatePlanningRunStagePipeline");
    expect(createRunServiceSource).not.toContain("runStagePipeline");
    expect(createRunStagePipelineSource).toContain("runStagePipeline");
    expect(createRunServiceSource).toContain("recordCurrentUserRunStageMetrics");
    expect(createRunRouteAdapterSource).toContain("parseCreatePlanningRunCommand");
    expect(createRunRouteAdapterSource).toContain("createPlanningRun");

    expect(legacyRunRouteSource).not.toContain("runsPost");
    expect(legacyV2RunRouteSource).not.toContain("runsPost");
    expect(legacyRunRouteSource).toContain("handleCreatePlanningRunPost");
    expect(legacyV2RunRouteSource).toContain("handleCreatePlanningRunPost");
    expect(planningRscLoadersSource).toContain("sanitizeRunRecordForResponse");
    expect(reportRunScopeLoaderSource).toContain("sanitizeRunRecordForResponse");
  });

  it("supports profiles CRUD through routes", async () => {
    const createResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "테스트 프로필",
      profile: sampleProfile(),
    }));
    const createPayload = await createResponse.json() as {
      ok?: boolean;
      data?: { id?: string; name?: string };
    };

    expect(createResponse.status).toBe(201);
    expect(createPayload.ok).toBe(true);
    expect(createPayload.data?.id).toBeTruthy();

    const profileId = String(createPayload.data?.id);

    const listResponse = await profilesGET(buildGetRequest("/api/planning/v2/profiles"));
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      data?: Array<{ id?: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((item) => item.id === profileId)).toBe(true);

    const byIdResponse = await profileByIdGET(
      buildGetRequest(`/api/planning/v2/profiles/${profileId}`),
      { params: Promise.resolve({ id: profileId }) },
    );
    const byIdPayload = await byIdResponse.json() as {
      ok?: boolean;
      data?: { id?: string; name?: string };
    };

    expect(byIdResponse.status).toBe(200);
    expect(byIdPayload.data?.id).toBe(profileId);

    const updateResponse = await profilePATCH(
      buildJsonRequest("PATCH", `/api/planning/v2/profiles/${profileId}`, {
        name: "수정된 프로필",
        profile: sampleProfile(),
      }),
      { params: Promise.resolve({ id: profileId }) },
    );
    const updatePayload = await updateResponse.json() as {
      ok?: boolean;
      data?: { name?: string };
    };

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.ok).toBe(true);
    expect(updatePayload.data?.name).toBe("수정된 프로필");

    const deleteResponse = await profileDELETE(
      buildJsonRequest("DELETE", `/api/planning/v2/profiles/${profileId}`, {
        confirmText: buildConfirmString("DELETE profile", profileId),
      }),
      { params: Promise.resolve({ id: profileId }) },
    );
    const deletePayload = await deleteResponse.json() as {
      ok?: boolean;
      data?: { deleted?: boolean };
    };

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.data?.deleted).toBe(true);
  });

  it("normalizes legacy profile fields to canonical shape on save", async () => {
    const createResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "정규화 테스트",
      profile: {
        monthlyIncomeNet: 3_900_000,
        monthlyEssentialExpenses: 1_500_000,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 1_800_000,
        investmentAssets: 2_300_000,
        debts: [
          {
            id: "loan-1",
            name: "테스트 부채",
            balance: 15_000_000,
            apr: 4.8,
            remainingMonths: 60,
            repaymentType: "amortizing",
          },
        ],
        goals: [],
        cashflow: {
          monthlyIncomeKrw: 4_100_000,
          monthlyFixedExpensesKrw: 1_450_000,
          monthlyVariableExpensesKrw: 550_000,
        },
      },
    }));
    const createPayload = await createResponse.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        profile?: {
          monthlyIncomeNet?: number;
          monthlyEssentialExpenses?: number;
          monthlyDiscretionaryExpenses?: number;
          debts?: Array<{ aprPct?: number }>;
          cashflow?: Record<string, unknown>;
        };
      };
      meta?: {
        normalization?: {
          defaultsApplied?: string[];
          fixesApplied?: Array<{
            path?: string;
            from?: unknown;
            to?: unknown;
            message?: string;
          }>;
        };
      };
    };

    expect(createResponse.status).toBe(201);
    expect(createPayload.ok).toBe(true);
    expect(createPayload.data?.profile?.monthlyIncomeNet).toBe(4_100_000);
    expect(createPayload.data?.profile?.monthlyEssentialExpenses).toBe(1_450_000);
    expect(createPayload.data?.profile?.monthlyDiscretionaryExpenses).toBe(550_000);
    expect(createPayload.data?.profile?.debts?.[0]?.aprPct).toBeCloseTo(4.8, 8);
    expect(createPayload.data?.profile?.cashflow).toBeUndefined();
    const aprFix = (createPayload.meta?.normalization?.fixesApplied ?? []).find((fix) => fix.path === "/debts/0/aprPct");
    expect(aprFix).toBeDefined();
  });

  it("creates run records with simulate/scenarios/monteCarlo/actions outputs", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Run 대상 프로필",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };

    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "기본 실행",
      input: {
        horizonMonths: 60,
        assumptionsOverride: {
          inflation: 1.8,
          expectedReturn: 5.5,
        },
        includeProducts: false,
        monteCarlo: {
          paths: 50,
          seed: 7,
        },
      },
    }));

    const runCreatePayload = await runCreateResponse.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        outputs?: {
          resultDto?: unknown;
          simulate?: unknown;
          scenarios?: unknown;
          monteCarlo?: unknown;
          actions?: unknown;
          debtStrategy?: unknown;
        };
      };
    };

    expect(runCreateResponse.status).toBe(201);
    expect(runCreatePayload.ok).toBe(true);
    expect(runCreatePayload.data?.id).toBeTruthy();
    expect(runCreatePayload.data?.outputs?.resultDto).toBeDefined();
    expect((runCreatePayload.data?.outputs?.simulate as { ref?: { name?: string } } | undefined)?.ref?.name).toBe("simulate");
    expect((runCreatePayload.data?.outputs?.actions as { ref?: { name?: string } } | undefined)?.ref?.name).toBe("actions");
    expect((runCreatePayload.data?.outputs?.simulate as { ref?: { path?: string } } | undefined)?.ref?.path).toBeUndefined();
    expect((runCreatePayload.data?.outputs?.actions as { ref?: { path?: string } } | undefined)?.ref?.path).toBeUndefined();

    const runId = String(runCreatePayload.data?.id ?? "");

    const listResponse = await runsGET(buildGetRequest(`/api/planning/v2/runs?profileId=${encodeURIComponent(profileId)}&limit=20`));
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      data?: Array<{ id?: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((item) => item.id === runId)).toBe(true);

    const byIdResponse = await runByIdGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    const byIdPayload = await byIdResponse.json() as {
      ok?: boolean;
      data?: { id?: string };
    };

    expect(byIdResponse.status).toBe(200);
    expect(byIdPayload.ok).toBe(true);
    expect(byIdPayload.data?.id).toBe(runId);

    const deleteResponse = await runDELETE(
      buildJsonRequest("DELETE", `/api/planning/v2/runs/${runId}`, {
        confirmText: buildConfirmString("DELETE run", runId),
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    const deletePayload = await deleteResponse.json() as {
      ok?: boolean;
      data?: { deleted?: boolean };
    };

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.data?.deleted).toBe(true);
  });

  it("keeps run creation successful when stage metrics recording fails", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Metrics failure profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const parsed = parseCreatePlanningRunCommand({
      profileId,
      title: "metrics failure still creates run",
      input: {
        horizonMonths: 24,
        runScenarios: false,
        getActions: false,
        analyzeDebt: false,
      },
    });
    if (!parsed.ok) {
      throw new Error(`unexpected parse failure: ${parsed.message}`);
    }

    const result = await createPlanningRun(parsed.command, {
      requestBaseUrl: `http://${LOCAL_HOST}`,
    }, {
      recordStageMetrics: async () => {
        throw new Error("metrics store unavailable");
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.payload.data.id).toBeTruthy();
      expect(result.payload.data.profileId).toBe(profileId);
    }
  });

  it("keeps run creation successful when audit recording fails", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Audit failure profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const parsed = parseCreatePlanningRunCommand({
      profileId,
      title: "audit failure still creates run",
      input: {
        horizonMonths: 24,
        runScenarios: false,
        getActions: false,
        analyzeDebt: false,
      },
    });
    if (!parsed.ok) {
      throw new Error(`unexpected parse failure: ${parsed.message}`);
    }

    const result = await createPlanningRun(parsed.command, {
      requestBaseUrl: `http://${LOCAL_HOST}`,
    }, {
      recordAudit: () => {
        throw new Error("audit store unavailable");
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.payload.data.id).toBeTruthy();
      expect(result.payload.data.profileId).toBe(profileId);
    }
  });

  it("preserves stage failure context when stage output resolution fails", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Stage output failure profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const parsed = parseCreatePlanningRunCommand({
      profileId,
      title: "stage output resolution failure",
      input: {
        horizonMonths: 24,
        runScenarios: false,
        getActions: false,
        analyzeDebt: false,
      },
    });
    if (!parsed.ok) {
      throw new Error(`unexpected parse failure: ${parsed.message}`);
    }

    const stages = [{
      id: "simulate" as const,
      status: "SUCCESS" as const,
      startedAt: "2026-07-10T00:00:00.000Z",
      endedAt: "2026-07-10T00:00:00.010Z",
      durationMs: 10,
    }];
    const createRunRecord = vi.fn();
    const recordStageMetrics = vi.fn(async () => undefined);
    const recordAudit = vi.fn();

    const result = await createPlanningRun(parsed.command, {
      requestBaseUrl: `http://${LOCAL_HOST}`,
    }, {
      runPipeline: async () => ({
        overallStatus: "SUCCESS",
        stages,
        get outputs(): never {
          throw new Error("stage outputs unavailable");
        },
      }),
      createRunRecord,
      recordStageMetrics,
      recordAudit,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      message: "stage outputs unavailable",
      meta: { stages },
    });
    expect(createRunRecord).not.toHaveBeenCalled();
    expect(recordStageMetrics).toHaveBeenCalledWith(expect.objectContaining({
      profileId,
      overallStatus: "FAILED",
      stages,
    }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      result: "ERROR",
      recordId: profileId,
      message: "stage outputs unavailable",
    }));
    expect(recordStageMetrics.mock.invocationCallOrder[0]).toBeLessThan(recordAudit.mock.invocationCallOrder[0]);
  });

  it("records audit only and preserves the public error shape when the stage pipeline throws early", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Early pipeline failure profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const parsed = parseCreatePlanningRunCommand({
      profileId,
      title: "early stage pipeline failure",
      input: {
        horizonMonths: 24,
        runScenarios: false,
        getActions: false,
        analyzeDebt: false,
      },
    });
    if (!parsed.ok) {
      throw new Error(`unexpected parse failure: ${parsed.message}`);
    }

    const recordStageMetrics = vi.fn(async () => undefined);
    const recordAudit = vi.fn();
    const result = await createPlanningRun(parsed.command, {
      requestBaseUrl: `http://${LOCAL_HOST}`,
    }, {
      runPipeline: async () => {
        throw new Error("stage pipeline unavailable");
      },
      recordStageMetrics,
      recordAudit,
    });

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL",
      message: "stage pipeline unavailable",
      status: 500,
      meta: {},
    });
    expect(recordStageMetrics).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith({
      result: "ERROR",
      recordId: profileId,
      message: "stage pipeline unavailable",
    });
  });

  it("rejects run save when debt offer liabilityId does not match profile debt ids", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Preflight mismatch profile",
      profile: {
        ...sampleProfile(),
        debts: [
          {
            id: "loan-1",
            name: "Loan 1",
            balance: 12_000_000,
            minimumPayment: 300_000,
            apr: 0.052,
            remainingMonths: 48,
            repaymentType: "amortizing",
          },
        ],
      },
    }));
    const createProfilePayload = await createProfileResponse.json() as {
      data?: { id?: string };
    };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "Preflight mismatch",
      input: {
        horizonMonths: 24,
        analyzeDebt: true,
        debtStrategy: {
          offers: [
            {
              liabilityId: "loan-x",
              newAprPct: 4.1,
            },
          ],
        },
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as {
      ok?: boolean;
      error?: {
        code?: string;
        issues?: string[];
      };
    };

    expect(runCreateResponse.status).toBe(400);
    expect(runCreatePayload.ok).toBe(false);
    expect(runCreatePayload.error?.code).toBe("INPUT");
    expect((runCreatePayload.error?.issues ?? []).some((issue) => issue.includes("liabilityId must match debts ids"))).toBe(true);
    expect((runCreatePayload.error?.issues ?? []).some((issue) => issue.includes("expected ids: loan-1"))).toBe(true);
  });

  it("resolves snapshotId='latest' to latest history id on run creation", async () => {
    const snapshotId = "2026-02-28_2026-03-01-09-00-00";
    const snapshot = assumptionsSnapshotFixture("2026-02-28", "2026-03-01T09:00:00.000Z");
    await writeJson(path.join(String(env.PLANNING_ASSUMPTIONS_HISTORY_DIR), `${snapshotId}.json`), snapshot);
    await writeJson(String(env.PLANNING_ASSUMPTIONS_PATH), snapshot);

    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Latest snapshot profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "latest snapshot run",
      input: {
        horizonMonths: 36,
        snapshotId: "latest",
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as {
      ok?: boolean;
      data?: {
        input?: { snapshotId?: string };
      };
      meta?: {
        snapshot?: { id?: string };
      };
    };

    expect(runCreateResponse.status).toBe(201);
    expect(runCreatePayload.ok).toBe(true);
    expect(runCreatePayload.meta?.snapshot?.id).toBe(snapshotId);
    expect(runCreatePayload.data?.input?.snapshotId).toBe(snapshotId);
  });

  it("returns actionable error when snapshotId is invalid", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Invalid snapshot profile",
      profile: sampleProfile(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "invalid snapshot run",
      input: {
        horizonMonths: 36,
        snapshotId: "missing-snapshot-id",
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as {
      ok?: boolean;
      error?: {
        code?: string;
        message?: string;
        issues?: string[];
      };
    };

    expect(runCreateResponse.status).toBe(400);
    expect(runCreatePayload.ok).toBe(false);
    expect(runCreatePayload.error?.code).toBe("SNAPSHOT_NOT_FOUND");
    expect(runCreatePayload.error?.message ?? "").toContain("latest");
    expect((runCreatePayload.error?.issues ?? []).some((issue) => issue.includes("input.snapshotId"))).toBe(true);
  });

  it("rejects delete when confirm text mismatches", async () => {
    const createResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "삭제 확인 테스트",
      profile: sampleProfile(),
    }));
    const createPayload = await createResponse.json() as { data?: { id?: string } };
    const profileId = String(createPayload.data?.id ?? "");

    const deleteResponse = await profileDELETE(
      buildJsonRequest("DELETE", `/api/planning/v2/profiles/${profileId}`, {
        confirmText: "DELETE profile wrong",
      }),
      { params: Promise.resolve({ id: profileId }) },
    );
    const deletePayload = await deleteResponse.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(deleteResponse.status).toBe(400);
    expect(deletePayload.ok).toBe(false);
    expect(deletePayload.error?.code).toBe("CONFIRM_MISMATCH");
  });

  it.each([false, true])("reruns stored input once and rejects changed conditions without writing (scenario=%s)", async (withScenario) => {
    const snapshotId = "rerun-fixed-snapshot";
    const snapshot = assumptionsSnapshotFixture("2026-09-07", "2026-09-07T00:00:00.000Z");
    const snapshotPath = path.join(String(env.PLANNING_ASSUMPTIONS_HISTORY_DIR), `${snapshotId}.json`);
    await writeJson(snapshotPath, snapshot);
    const profileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Rerun profile A", profile: sampleProfile(),
    }));
    const profileId = (await profileResponse.json()).data.id as string;
    const oldResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", { profileId, input: {
      horizonMonths: 36, snapshotId, policyId: "balanced", assumptionsOverride: { inflationPct: 2.4 },
      runScenarios: false, getActions: true, analyzeDebt: false, includeProducts: false,
      debtStrategy: { options: { extraPaymentKrw: 5000, compareTermsMonths: [24, 36] } },
      ...(withScenario ? { scenario: { title: "동일 시나리오", patch: [{ op: "mul", field: "monthlyIncomeNet", value: 1.1 }] } } : {}),
    } }));
    expect(oldResponse.status).toBe(201);
    const oldRun = (await oldResponse.json()).data;
    const oldStored = await getRun(oldRun.id);
    const patchResponse = await profilePATCH(buildJsonRequest("PATCH", `/api/planning/v2/profiles/${profileId}`, {
      profile: { ...sampleProfile(), monthlyIncomeNet: 5_300_000 },
    }), { params: Promise.resolve({ id: profileId }) });
    expect(patchResponse.status).toBe(200);
    const profile = (await (await profileByIdGET(buildGetRequest(`/api/planning/v2/profiles/${profileId}`), {
      params: Promise.resolve({ id: profileId }),
    })).json()).data.profile;
    const body = { profileId, rerunOfRunId: oldRun.id, input: oldRun.input };
    const post = (key: string, data = body) => runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", data, LOCAL_HOST, { "idempotency-key": key }));
    const [first, duplicate] = await Promise.all([post("rerun-click-0001"), post("rerun-click-0001")]);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    const newRun = (await first.json()).data;
    expect((await duplicate.json()).data.id).toBe(newRun.id);
    expect(newRun.profileId).toBe(profileId);
    expect(newRun.input).toEqual(oldRun.input);
    expect(newRun.reproducibility.profileHash).toBe(computeProfileHash(withScenario ? applyProfilePatch(profile, oldRun.input.scenario.patch) : profile));
    expect(newRun.reproducibility.effectiveAssumptionsHash).toBe(oldRun.reproducibility.effectiveAssumptionsHash);
    expect(await listRuns({ profileId })).toHaveLength(2);
    await fs.promises.unlink(snapshotPath);
    // A lost successful response can still be replayed even if the historical snapshot is subsequently removed.
    expect((await (await post("rerun-click-0001")).json()).data.id).toBe(newRun.id);
    const missing = await post("rerun-click-0002");
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("SNAPSHOT_NOT_FOUND");
    expect(await listRuns({ profileId })).toHaveLength(2);
    await writeJson(snapshotPath, { ...snapshot, korea: { ...snapshot.korea, policyRatePct: 9 } });
    expect((await post("rerun-click-0003")).status).toBe(409);
    await writeJson(snapshotPath, snapshot);
    expect((await post("rerun-click-0004", { ...body, input: { ...body.input, horizonMonths: 12 } })).status).toBe(409);
    expect((await post("rerun-click-0005", { ...body, profileId: "other-profile" })).status).toBe(409);
    expect(await listRuns({ profileId })).toHaveLength(2);
    expect(await getRun(oldRun.id)).toEqual(oldStored);
  });

  it("persists exactly one run for concurrent, replayed, and deprecated-route requests with the same idempotency key", async () => {
    const profileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Idempotent run profile",
      profile: sampleProfile(),
    }));
    const profilePayload = await profileResponse.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runBody = {
      profileId,
      title: "Exactly one run",
      input: {
        horizonMonths: 36,
        policyId: "balanced",
      },
    };
    const headers = { "idempotency-key": "planning-run-request-0001" };
    const canonicalRequest = () => buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      headers,
    );

    const [firstResponse, concurrentResponse] = await Promise.all([
      runsPOST(canonicalRequest()),
      runsPOST(canonicalRequest()),
    ]);
    const firstPayload = await firstResponse.json() as {
      ok?: boolean;
      data?: { id?: string; meta?: { idempotency?: unknown } };
    };
    const concurrentPayload = await concurrentResponse.json() as {
      ok?: boolean;
      data?: { id?: string; meta?: { idempotency?: unknown } };
    };

    expect(firstResponse.status).toBe(201);
    expect(concurrentResponse.status).toBe(201);
    expect(firstPayload.ok).toBe(true);
    expect(concurrentPayload.ok).toBe(true);
    expect(firstPayload.data?.id).toMatch(/^planning_idem_/);
    expect(concurrentPayload.data?.id).toBe(firstPayload.data?.id);
    expect(firstPayload.data?.meta?.idempotency).toBeUndefined();
    expect(concurrentPayload.data?.meta?.idempotency).toBeUndefined();

    const replayResponse = await runsPOST(canonicalRequest());
    const replayPayload = await replayResponse.json() as {
      data?: { id?: string; meta?: { idempotency?: unknown } };
    };
    expect(replayResponse.status).toBe(201);
    expect(replayPayload.data?.id).toBe(firstPayload.data?.id);
    expect(replayPayload.data?.meta?.idempotency).toBeUndefined();

    const stored = await getRun(String(firstPayload.data?.id));
    expect(stored?.meta.idempotency).toMatchObject({
      version: 1,
      keyHash: expect.any(String),
      requestFingerprint: expect.any(String),
      responseMeta: expect.any(Object),
    });

    const detailResponse = await runByIdGET(
      buildGetRequest(`/api/planning/v2/runs/${encodeURIComponent(String(firstPayload.data?.id))}`),
      { params: Promise.resolve({ id: String(firstPayload.data?.id) }) },
    );
    const detailPayload = await detailResponse.json();
    const internalMetaPattern = /idempotency|keyHash|requestFingerprint|responseMeta/;
    expect(JSON.stringify(firstPayload)).not.toMatch(internalMetaPattern);
    expect(JSON.stringify(replayPayload)).not.toMatch(internalMetaPattern);
    expect(JSON.stringify(detailPayload)).not.toMatch(internalMetaPattern);

    const deprecatedResponse = await legacyRunPOST(buildJsonRequest(
      "POST",
      "/api/planning/run",
      runBody,
      LOCAL_HOST,
      headers,
    ));
    const deprecatedPayload = await deprecatedResponse.json() as { data?: { id?: string } };
    expect(deprecatedResponse.status).toBe(201);
    expect(deprecatedPayload.data?.id).toBe(firstPayload.data?.id);

    const conflictResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      { ...runBody, title: "Different request" },
      LOCAL_HOST,
      headers,
    ));
    const conflictPayload = await conflictResponse.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(conflictResponse.status).toBe(409);
    expect(conflictPayload.ok).toBe(false);
    expect(conflictPayload.error?.code).toBe("IDEMPOTENCY_CONFLICT");

    const listResponse = await runsGET(buildGetRequest(
      `/api/planning/v2/runs?profileId=${encodeURIComponent(profileId)}&limit=20`,
    ));
    const listPayload = await listResponse.json() as {
      data?: Array<{ id?: string; meta?: { idempotency?: unknown } }>;
    };
    expect(listPayload.data).toHaveLength(1);
    expect(listPayload.data?.[0]?.id).toBe(firstPayload.data?.id);
    expect(listPayload.data?.[0]?.meta?.idempotency).toBeUndefined();
    expect(JSON.stringify(listPayload)).not.toMatch(internalMetaPattern);

    const conflictingHeaders = { "idempotency-key": "planning-run-request-0002" };
    const [conflictingFirst, conflictingSecond] = await Promise.all([
      runsPOST(buildJsonRequest(
        "POST",
        "/api/planning/v2/runs",
        { ...runBody, title: "Concurrent request A" },
        LOCAL_HOST,
        conflictingHeaders,
      )),
      runsPOST(buildJsonRequest(
        "POST",
        "/api/planning/v2/runs",
        { ...runBody, title: "Concurrent request B" },
        LOCAL_HOST,
        conflictingHeaders,
      )),
    ]);
    expect([conflictingFirst.status, conflictingSecond.status].sort()).toEqual([201, 409]);

    const finalListResponse = await runsGET(buildGetRequest(
      `/api/planning/v2/runs?profileId=${encodeURIComponent(profileId)}&limit=20`,
    ));
    const finalListPayload = await finalListResponse.json() as { data?: Array<{ id?: string }> };
    expect(finalListPayload.data).toHaveLength(2);
  });

  it("fails closed and preserves an unreadable deterministic run on idempotent retry", async () => {
    const profileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Unreadable replay profile",
      profile: sampleProfile(),
    }));
    const profilePayload = await profileResponse.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    const runBody = {
      profileId,
      title: "Unreadable replay",
      input: { horizonMonths: 24 },
    };
    const headers = { "idempotency-key": "planning-run-unreadable-0001" };

    const createResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      headers,
    ));
    const createPayload = await createResponse.json() as { data?: { id?: string } };
    const runId = String(createPayload.data?.id ?? "");
    expect(createResponse.status).toBe(201);
    expect(runId).toMatch(/^planning_idem_/);

    const metaPath = resolveProfileRunMetaPath(profileId, runId);
    const unreadableBytes = Buffer.from("{\"broken\":", "utf-8");
    await fs.promises.writeFile(metaPath, unreadableBytes);

    const retryResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      headers,
    ));
    const retryPayload = await retryResponse.json() as { ok?: boolean; error?: { code?: string } };

    expect(retryResponse.status).toBe(409);
    expect(retryPayload.ok).toBe(false);
    expect(retryPayload.error?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await fs.promises.readFile(metaPath)).toEqual(unreadableBytes);
  });

  it("keeps a soft-deleted idempotent run reserved without overwriting its trash record", async () => {
    const profileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "Deleted idempotent run profile",
      profile: sampleProfile(),
    }));
    const profilePayload = await profileResponse.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    const runBody = {
      profileId,
      title: "Deleted idempotent run",
      input: { horizonMonths: 24 },
    };
    const headers = { "idempotency-key": "planning-run-deleted-0001" };

    const createResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      headers,
    ));
    const createPayload = await createResponse.json() as { data?: { id?: string } };
    const runId = String(createPayload.data?.id ?? "");
    expect(createResponse.status).toBe(201);

    const deleteResponse = await runDELETE(
      buildJsonRequest("DELETE", `/api/planning/v2/runs/${runId}`, {
        confirmText: buildConfirmString("DELETE run", runId),
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const trashPath = path.join(root, "trash", "runs", `${runId}.json`);
    const trashedBytes = await fs.promises.readFile(trashPath);

    const retryResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      headers,
    ));
    const retryPayload = await retryResponse.json() as { ok?: boolean; error?: { code?: string } };

    expect(retryResponse.status).toBe(409);
    expect(retryPayload.ok).toBe(false);
    expect(retryPayload.error?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await fs.promises.readFile(trashPath)).toEqual(trashedBytes);
    expect(await getRun(runId)).toBeNull();
  });

  it("reserves an unreadable deterministic target in another profile partition", async () => {
    const profileIds: string[] = [];
    for (const name of ["Reservation owner", "Reservation requester"]) {
      const response = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
        name,
        profile: sampleProfile(),
      }));
      const payload = await response.json() as { data?: { id?: string } };
      profileIds.push(String(payload.data?.id ?? ""));
    }
    const [ownerProfileId, requesterProfileId] = profileIds;
    expect(ownerProfileId).toBeTruthy();
    expect(requesterProfileId).toBeTruthy();
    const ownerId = String(ownerProfileId);
    const requesterId = String(requesterProfileId);

    const runBody = {
      profileId: requesterId,
      title: "Cross-profile reserved target",
      input: { horizonMonths: 24 },
    };
    const key = "planning-run-cross-profile-0001";
    const resolution = resolvePlanningRunIdempotency({
      body: runBody,
      key,
      userId: "default",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok || !resolution.context) throw new Error("idempotency context expected");

    const ownerRunDir = resolveProfileRunDir(ownerId, resolution.context.runId);
    const sentinelPath = path.join(ownerRunDir, "sentinel.bin");
    const sentinelBytes = Buffer.from([7, 1, 1, 2]);
    await fs.promises.mkdir(ownerRunDir, { recursive: true });
    await fs.promises.writeFile(sentinelPath, sentinelBytes);

    const response = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      runBody,
      LOCAL_HOST,
      { "idempotency-key": key },
    ));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await fs.promises.readFile(sentinelPath)).toEqual(sentinelBytes);
    expect(fs.existsSync(resolveProfileRunDir(requesterId, resolution.context.runId))).toBe(false);
  });

  it("allows same-origin reads and blocks cross-origin writes", async () => {
    const sameOriginGet = await profilesGET(buildGetRequest("/api/planning/v2/profiles", REMOTE_HOST));
    const sameOriginGetPayload = await sameOriginGet.json() as {
      ok?: boolean;
      data?: unknown;
      error?: { code?: string };
    };

    expect(sameOriginGet.status).toBe(200);
    expect(sameOriginGetPayload.ok).toBe(true);
    expect(Array.isArray(sameOriginGetPayload.data)).toBe(true);

    const crossOriginPost = await runsPOST(new Request(`http://${LOCAL_HOST}/api/planning/v2/runs`, {
      method: "POST",
      headers: {
        host: LOCAL_HOST,
        origin: `http://${REMOTE_HOST}`,
        referer: `http://${REMOTE_HOST}/planning`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        profileId: "bad",
        input: { horizonMonths: 12 },
      }),
    }));
    const crossOriginPostPayload = await crossOriginPost.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(crossOriginPost.status).toBe(403);
    expect(crossOriginPostPayload.ok).toBe(false);
    expect(crossOriginPostPayload.error?.code).toBe("ORIGIN_MISMATCH");

    const sameOriginRemotePost = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId: "bad",
      input: { horizonMonths: 12 },
    }, REMOTE_HOST));
    const sameOriginRemotePostPayload = await sameOriginRemotePost.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(sameOriginRemotePost.status).toBe(404);
    expect(sameOriginRemotePostPayload.ok).toBe(false);
    expect(sameOriginRemotePostPayload.error?.code).toBe("NO_DATA");
  });
});
