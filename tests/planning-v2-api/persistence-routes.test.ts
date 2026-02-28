import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as profilesGET, POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import {
  DELETE as profileDELETE,
  GET as profileByIdGET,
  PATCH as profilePATCH,
} from "../../src/app/api/planning/v2/profiles/[id]/route";
import { GET as runsGET, POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import {
  DELETE as runDELETE,
  GET as runByIdGET,
} from "../../src/app/api/planning/v2/runs/[id]/route";
import { buildConfirmString } from "../../src/lib/ops/confirm";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

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

describe("planning v2 persistence routes", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-routes-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    fs.rmSync(root, { recursive: true, force: true });
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
    expect(runCreatePayload.data?.outputs?.simulate).toBeDefined();
    expect(runCreatePayload.data?.outputs?.scenarios).toBeDefined();
    expect(runCreatePayload.data?.outputs?.monteCarlo).toBeDefined();
    expect(runCreatePayload.data?.outputs?.actions).toBeDefined();
    expect(runCreatePayload.data?.outputs?.debtStrategy).toBeDefined();

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

  it("blocks non-local host requests", async () => {
    const nonLocalGet = await profilesGET(buildGetRequest("/api/planning/v2/profiles", "example.com"));
    const nonLocalGetPayload = await nonLocalGet.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(nonLocalGet.status).toBe(403);
    expect(nonLocalGetPayload.ok).toBe(false);
    expect(nonLocalGetPayload.error?.code).toBe("LOCAL_ONLY");

    const nonLocalPost = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId: "bad",
      input: { horizonMonths: 12 },
    }, "example.com"));
    const nonLocalPostPayload = await nonLocalPost.json() as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(nonLocalPost.status).toBe(403);
    expect(nonLocalPostPayload.ok).toBe(false);
    expect(nonLocalPostPayload.error?.code).toBe("LOCAL_ONLY");
  });
});
