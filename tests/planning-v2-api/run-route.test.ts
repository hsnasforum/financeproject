import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runPOST } from "../../src/app/api/planning/run/route";
import { GET as runGET } from "../../src/app/api/planning/run/[id]/route";
import { GET as runsGET } from "../../src/app/api/planning/runs/[id]/route";
import { saveAssumptionsOverrides } from "../../src/lib/planning/assumptions/overridesStorage";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

const LOCAL_HOST = "localhost:3000";

function profileFixture() {
  return {
    monthlyIncomeNet: 4_300_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    debts: [],
    goals: [],
  };
}

function buildJsonRequest(method: string, urlPath: string, body: unknown, host = LOCAL_HOST): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method,
    headers: {
      host,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
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

describe("POST /api/planning/run + GET /api/planning/run[s]/:id", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-run-route-"));
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

  it("creates run via one-click route and fetches stage statuses by id", async () => {
    const profileRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "run route profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();
    await saveAssumptionsOverrides([
      {
        key: "inflationPct",
        value: 2.7,
        reason: "ops override",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ], profileId);

    const runRes = await runPOST(buildJsonRequest("POST", "/api/planning/run", {
      profileId,
      title: "one click",
      input: {
        horizonMonths: 120,
        runScenarios: true,
        getActions: true,
        analyzeDebt: true,
        scenario: {
          title: "선택지출 -10%",
          patch: [
            { op: "mul", field: "monthlyDiscretionaryExpenses", value: 0.9 },
          ],
        },
      },
    }));
    const runPayload = await runRes.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        schemaVersion?: number;
        input?: {
          scenario?: {
            title?: string;
            patch?: Array<{ op?: string; field?: string; value?: number }>;
          };
        };
        scenario?: {
          id?: string;
          name?: string;
          patches?: Array<{ path?: string; op?: string; value?: number }>;
        };
        overallStatus?: string;
        stages?: Array<{ id: string; status: string }>;
        reproducibility?: {
          appVersion?: string;
          engineVersion?: string;
          profileHash?: string;
          assumptionsSnapshotId?: string;
          effectiveAssumptionsHash?: string;
          appliedOverrides?: Array<{ key?: string; value?: number; updatedAt?: string }>;
          policy?: Record<string, unknown>;
        };
      };
    };

    expect(runRes.status).toBe(201);
    expect(runPayload.ok).toBe(true);
    expect(runPayload.data?.id).toBeTruthy();
    expect(runPayload.data?.schemaVersion).toBe(2);
    expect(runPayload.data?.input?.scenario?.title).toBe("선택지출 -10%");
    expect(runPayload.data?.input?.scenario?.patch?.[0]?.op).toBe("mul");
    expect(runPayload.data?.input?.scenario?.patch?.[0]?.field).toBe("monthlyDiscretionaryExpenses");
    expect(runPayload.data?.overallStatus).toBeTruthy();
    expect((runPayload.data?.stages ?? []).length).toBeGreaterThanOrEqual(5);
    expect(typeof runPayload.data?.reproducibility?.appVersion).toBe("string");
    expect(typeof runPayload.data?.reproducibility?.engineVersion).toBe("string");
    expect((runPayload.data?.reproducibility?.profileHash?.length ?? 0)).toBeGreaterThanOrEqual(32);
    expect((runPayload.data?.reproducibility?.effectiveAssumptionsHash?.length ?? 0)).toBeGreaterThanOrEqual(32);
    expect(runPayload.data?.reproducibility?.appliedOverrides?.some((entry) => entry.key === "inflationPct" && entry.value === 2.7)).toBe(true);
    expect(runPayload.data?.reproducibility?.policy).toBeTruthy();

    const runId = String(runPayload.data?.id ?? "");
    const readRes = await runGET(
      buildGetRequest(`/api/planning/run/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    const readPayload = await readRes.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        schemaVersion?: number;
        input?: {
          scenario?: {
            title?: string;
            patch?: Array<{ op?: string; field?: string; value?: number }>;
          };
        };
        scenario?: {
          id?: string;
          name?: string;
        };
        stages?: Array<{ id: string; status: string }>;
        reproducibility?: {
          profileHash?: string;
        };
        outputs?: {
          resultDto?: unknown;
          simulate?: { ref?: { name?: string } };
          scenarios?: { ref?: { name?: string } };
          monteCarlo?: { ref?: { name?: string } };
          actions?: { ref?: { name?: string } };
          debtStrategy?: { ref?: { name?: string } };
        };
      };
    };
    expect(readRes.status).toBe(200);
    expect(readPayload.ok).toBe(true);
    expect(readPayload.data?.id).toBe(runId);
    expect(readPayload.data?.schemaVersion).toBe(2);
    expect(readPayload.data?.input?.scenario?.title).toBe("선택지출 -10%");
    expect(readPayload.data?.input?.scenario?.patch?.[0]?.op).toBe("mul");
    expect((readPayload.data?.stages ?? []).length).toBeGreaterThanOrEqual(5);
    expect((readPayload.data?.reproducibility?.profileHash?.length ?? 0)).toBeGreaterThanOrEqual(32);
    expect(readPayload.data?.outputs?.resultDto).toBeDefined();
    const stageById = new Map((readPayload.data?.stages ?? []).map((stage) => [stage.id, stage.status]));
    if (stageById.get("simulate") === "SUCCESS") {
      expect(readPayload.data?.outputs?.simulate?.ref?.name).toBe("simulate");
    }
    if (stageById.get("scenarios") === "SUCCESS") {
      expect(readPayload.data?.outputs?.scenarios?.ref?.name).toBe("scenarios");
    }
    if (stageById.get("actions") === "SUCCESS") {
      expect(readPayload.data?.outputs?.actions?.ref?.name).toBe("actions");
    }

    const readPluralRes = await runsGET(
      buildGetRequest(`/api/planning/runs/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    const readPluralPayload = await readPluralRes.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        stages?: Array<{ id: string; status: string }>;
      };
    };
    expect(readPluralRes.status).toBe(200);
    expect(readPluralPayload.ok).toBe(true);
    expect(readPluralPayload.data?.id).toBe(runId);
    expect((readPluralPayload.data?.stages ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
