import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as runDetailGET, PATCH as runDetailPATCH } from "../../src/app/api/planning/v2/runs/[id]/route";
import { GET as actionPlanGET } from "../../src/app/api/planning/runs/[id]/action-plan/route";
import {
  GET as actionProgressGET,
  PATCH as actionProgressPATCH,
} from "../../src/app/api/planning/runs/[id]/action-progress/route";
import { resolveProfileRunDir } from "../../src/lib/planning/store/paths";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

const LOCAL_HOST = "localhost:3000";
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

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

function jsonRequest(method: string, urlPath: string, body: unknown, host = LOCAL_HOST, cookie = ""): Request {
  const origin = `http://${host}`;
  const headers: Record<string, string> = {
    host,
    origin,
    referer: `${origin}/planning`,
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${origin}${urlPath}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(urlPath: string, host = LOCAL_HOST): Request {
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

describe("run action progress route", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-action-progress-"));
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

  it("persists progress updates and enforces csrf/origin guards", async () => {
    const profileRes = await profilesPOST(jsonRequest("POST", "/api/planning/v2/profiles", {
      name: "action-progress profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(jsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "action-progress run",
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

    const planRes = await actionPlanGET(getRequest(`/api/planning/runs/${runId}/action-plan`), {
      params: Promise.resolve({ id: runId }),
    });
    const planPayload = await planRes.json() as {
      ok?: boolean;
      data?: {
        items?: Array<{ actionKey?: string }>;
      };
    };
    expect(planRes.status).toBe(200);
    expect(planPayload.ok).toBe(true);
    const actionKey = String(planPayload.data?.items?.[0]?.actionKey ?? "");
    expect(actionKey).toBeTruthy();

    const csrfMissingRes = await actionProgressPATCH(
      jsonRequest(
        "PATCH",
        `/api/planning/runs/${runId}/action-progress`,
        { actionKey, status: "done" },
        LOCAL_HOST,
        "dev_csrf=test-token",
      ),
      { params: Promise.resolve({ id: runId }) },
    );
    const csrfMissingPayload = await csrfMissingRes.json() as { error?: { code?: string } };
    expect(csrfMissingRes.status).toBe(403);
    expect(csrfMissingPayload.error?.code).toBe("CSRF_MISMATCH");

    const patchRes = await actionProgressPATCH(
      jsonRequest(
        "PATCH",
        `/api/planning/runs/${runId}/action-progress`,
        { csrf: "test-token", actionKey, status: "done", note: "완료 체크" },
        LOCAL_HOST,
        "dev_csrf=test-token",
      ),
      { params: Promise.resolve({ id: runId }) },
    );
    const patchPayload = await patchRes.json() as {
      ok?: boolean;
      data?: {
        items?: Array<{ actionKey?: string; status?: string; note?: string }>;
      };
      meta?: { summary?: { completionPct?: number } };
    };
    expect(patchRes.status).toBe(200);
    expect(patchPayload.ok).toBe(true);
    expect(patchPayload.data?.items?.find((item) => item.actionKey === actionKey)?.status).toBe("done");
    expect(patchPayload.meta?.summary?.completionPct).toBeGreaterThanOrEqual(0);

    const progressRes = await actionProgressGET(getRequest(`/api/planning/runs/${runId}/action-progress`), {
      params: Promise.resolve({ id: runId }),
    });
    const progressPayload = await progressRes.json() as {
      ok?: boolean;
      data?: {
        items?: Array<{ actionKey?: string; status?: string; note?: string }>;
      };
    };
    expect(progressRes.status).toBe(200);
    expect(progressPayload.ok).toBe(true);
    const persisted = progressPayload.data?.items?.find((item) => item.actionKey === actionKey);
    expect(persisted?.status).toBe("done");
    expect(persisted?.note).toBe("완료 체크");

    const remoteRes = await actionProgressGET(
      getRequest(`/api/planning/runs/${runId}/action-progress`, REMOTE_HOST),
      { params: Promise.resolve({ id: runId }) },
    );
    const remotePayload = await remoteRes.json() as {
      ok?: boolean;
      data?: {
        items?: Array<{ actionKey?: string; status?: string; note?: string }>;
      };
    };
    expect(remoteRes.status).toBe(200);
    expect(remotePayload.ok).toBe(true);
    expect(remotePayload.data?.items?.find((item) => item.actionKey === actionKey)?.status).toBe("done");

    const crossOriginPatchRes = await actionProgressPATCH(
      new Request(`http://${LOCAL_HOST}/api/planning/runs/${runId}/action-progress`, {
        method: "PATCH",
        headers: {
          host: LOCAL_HOST,
          origin: REMOTE_ORIGIN,
          referer: `${REMOTE_ORIGIN}/planning`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ actionKey, status: "doing" }),
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    const crossOriginPatchPayload = await crossOriginPatchRes.json() as { error?: { code?: string } };
    expect(crossOriginPatchRes.status).toBe(403);
    expect(crossOriginPatchPayload.error?.code).toBe("ORIGIN_MISMATCH");
  });

  it("updates action progress via PATCH /api/planning/v2/runs/[id] without csrf when cookie missing", async () => {
    const profileRes = await profilesPOST(jsonRequest("POST", "/api/planning/v2/profiles", {
      name: "runs detail action-center profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(jsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "runs detail action-center run",
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

    const readBeforeRes = await runDetailGET(getRequest(`/api/planning/v2/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    const readBeforePayload = await readBeforeRes.json() as {
      ok?: boolean;
      data?: {
        actionCenter?: {
          plan?: { items?: Array<{ actionKey?: string }> };
          progress?: { items?: Array<{ actionKey?: string; status?: string }> };
        };
      };
    };
    expect(readBeforeRes.status).toBe(200);
    expect(readBeforePayload.ok).toBe(true);
    const actionKey = String(readBeforePayload.data?.actionCenter?.plan?.items?.[0]?.actionKey ?? "");
    expect(actionKey).toBeTruthy();

    const patchRes = await runDetailPATCH(
      jsonRequest("PATCH", `/api/planning/v2/runs/${runId}`, {
        actionKey,
        status: "done",
        note: "상세 라우트에서 완료",
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    const patchPayload = await patchRes.json() as {
      ok?: boolean;
      data?: {
        progress?: { items?: Array<{ actionKey?: string; status?: string; note?: string; doneAt?: string }> };
        completion?: { done?: number; total?: number; pct?: number };
      };
    };
    expect(patchRes.status).toBe(200);
    expect(patchPayload.ok).toBe(true);
    const updated = patchPayload.data?.progress?.items?.find((item) => item.actionKey === actionKey);
    expect(updated?.status).toBe("done");
    expect(updated?.note).toBe("상세 라우트에서 완료");
    expect(typeof updated?.doneAt).toBe("string");
    expect((patchPayload.data?.completion?.pct ?? 0)).toBeGreaterThanOrEqual(0);

    const readAfterRes = await runDetailGET(getRequest(`/api/planning/v2/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    const readAfterPayload = await readAfterRes.json() as {
      ok?: boolean;
      data?: {
        actionCenter?: {
          progress?: { items?: Array<{ actionKey?: string; status?: string; note?: string; doneAt?: string }> };
        };
      };
    };
    expect(readAfterRes.status).toBe(200);
    expect(readAfterPayload.ok).toBe(true);
    const persisted = readAfterPayload.data?.actionCenter?.progress?.items?.find((item) => item.actionKey === actionKey);
    expect(persisted?.status).toBe("done");
    expect(persisted?.note).toBe("상세 라우트에서 완료");
    expect(typeof persisted?.doneAt).toBe("string");
  });

  it("recovers from corrupted action center json without breaking reads", async () => {
    const profileRes = await profilesPOST(jsonRequest("POST", "/api/planning/v2/profiles", {
      name: "runs detail recovery profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(jsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "runs detail recovery run",
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

    const firstReadRes = await actionProgressGET(getRequest(`/api/planning/runs/${runId}/action-progress`), {
      params: Promise.resolve({ id: runId }),
    });
    const firstReadPayload = await firstReadRes.json() as {
      ok?: boolean;
      data?: { items?: Array<{ actionKey?: string; status?: string }> };
    };
    expect(firstReadRes.status).toBe(200);
    expect(firstReadPayload.ok).toBe(true);
    expect(Array.isArray(firstReadPayload.data?.items)).toBe(true);

    const runDir = resolveProfileRunDir(profileId, runId);
    fs.writeFileSync(path.join(runDir, "action-plan.json"), "{");
    fs.writeFileSync(path.join(runDir, "action-progress.json"), "{");

    const recoveredPlanRes = await actionPlanGET(getRequest(`/api/planning/runs/${runId}/action-plan`), {
      params: Promise.resolve({ id: runId }),
    });
    const recoveredPlanPayload = await recoveredPlanRes.json() as {
      ok?: boolean;
      data?: { items?: Array<{ actionKey?: string }> };
    };
    expect(recoveredPlanRes.status).toBe(200);
    expect(recoveredPlanPayload.ok).toBe(true);
    expect(Array.isArray(recoveredPlanPayload.data?.items)).toBe(true);

    const recoveredProgressRes = await actionProgressGET(getRequest(`/api/planning/runs/${runId}/action-progress`), {
      params: Promise.resolve({ id: runId }),
    });
    const recoveredProgressPayload = await recoveredProgressRes.json() as {
      ok?: boolean;
      data?: { items?: Array<{ actionKey?: string; status?: string }> };
    };
    expect(recoveredProgressRes.status).toBe(200);
    expect(recoveredProgressPayload.ok).toBe(true);
    expect(Array.isArray(recoveredProgressPayload.data?.items)).toBe(true);
  });
});
