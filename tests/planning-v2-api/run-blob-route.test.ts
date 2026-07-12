import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as runGET } from "../../src/app/api/planning/runs/[id]/route";
import { GET as runBlobGET } from "../../src/app/api/planning/runs/[id]/blob/[name]/route";
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

function buildJsonRequest(
  method: string,
  urlPath: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function buildGetRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
    },
  });
}

describe("run blob endpoint", () => {
  let root = "";

  it("keeps run blob repository and sanitizer access behind the run route service", () => {
    const routeSources = [
      "src/app/api/planning/v2/runs/[id]/blob/[name]/route.ts",
      "src/app/api/planning/runs/[id]/blob/[name]/route.ts",
    ].map((filePath) => fs.readFileSync(path.join(process.cwd(), filePath), "utf8"));
    const serviceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/routeService.ts"),
      "utf8",
    );

    for (const routeSource of routeSources) {
      expect(routeSource).not.toContain("server/runs/repository");
      expect(routeSource).not.toContain("runResponseSanitizer");
    }
    expect(routeSources[0]).toContain("getCurrentUserRunBlobResponseData");
    expect(routeSources[1]).toContain("runBlobGet");
    expect(serviceSource).toContain("getCurrentUserRunBlob");
    expect(serviceSource).toContain("sanitizeRunBlobForResponse");
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-run-blob-"));
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

  it("keeps run meta small and serves stage blobs via dedicated endpoint", async () => {
    const profileRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "blob profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "blob run",
      input: {
        horizonMonths: 24,
        runScenarios: true,
        getActions: true,
        analyzeDebt: true,
      },
    }));
    const runPayload = await runRes.json() as { data?: { id?: string } };
    const runId = String(runPayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const metaRes = await runGET(buildGetRequest(`/api/planning/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    const metaPayload = await metaRes.json() as {
      ok?: boolean;
      data?: {
        stages?: Array<{ id: string; status: string }>;
        outputs?: {
          simulate?: { ref?: { name?: string }; summary?: unknown };
          scenarios?: { ref?: { name?: string }; table?: unknown[] };
          monteCarlo?: unknown;
          actions?: unknown;
          debtStrategy?: unknown;
        };
      };
    };
    expect(metaRes.status).toBe(200);
    expect(metaPayload.ok).toBe(true);
    const stageById = new Map((metaPayload.data?.stages ?? []).map((stage) => [stage.id, stage.status]));
    if (stageById.get("simulate") === "SUCCESS") {
      expect(metaPayload.data?.outputs?.simulate?.ref?.name).toBe("simulate");
      expect(metaPayload.data?.outputs?.simulate?.summary).toBeUndefined();
    }
    if (stageById.get("scenarios") === "SUCCESS") {
      expect(metaPayload.data?.outputs?.scenarios?.ref?.name).toBe("scenarios");
      expect(metaPayload.data?.outputs?.scenarios?.table).toBeUndefined();
    }

    const blobRes = await runBlobGET(buildGetRequest(`/api/planning/runs/${runId}/blob/simulate`), {
      params: Promise.resolve({ id: runId, name: "simulate" }),
    });
    const blobPayload = await blobRes.json() as {
      ok?: boolean;
      data?: {
        summary?: Record<string, unknown>;
        ref?: { path?: string };
      };
    };

    expect(blobRes.status).toBe(200);
    expect(blobPayload.ok).toBe(true);
    expect(blobPayload.data?.summary).toBeDefined();
    expect(blobPayload.data?.ref?.path).toBeUndefined();
  });

  it("returns raw preview in chunks by default query without dumping full blob", async () => {
    const profileRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "blob preview profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "blob preview run",
      input: {
        horizonMonths: 24,
        runScenarios: true,
        getActions: true,
        analyzeDebt: true,
      },
    }, {
      "idempotency-key": "planning-run-blob-preview-0001",
    }));
    const runPayload = await runRes.json() as { data?: { id?: string } };
    const runId = String(runPayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const previewRes = await runBlobGET(buildGetRequest(`/api/planning/runs/${runId}/blob/raw?view=preview&chunkChars=120000`), {
      params: Promise.resolve({ id: runId, name: "raw" }),
    });
    const previewPayload = await previewRes.json() as {
      ok?: boolean;
      data?: {
        text?: string;
        chunkChars?: number;
        hasMore?: boolean;
        totalChars?: number;
      };
    };
    expect(previewRes.status).toBe(200);
    expect(previewPayload.ok).toBe(true);
    expect((previewPayload.data?.text ?? "").length).toBeLessThanOrEqual(120_000);
    expect(previewPayload.data?.totalChars).toBeGreaterThanOrEqual((previewPayload.data?.text ?? "").length);
    expect(previewPayload.data?.hasMore).toBe(false);
    expect(previewPayload.data?.text).not.toContain("idempotency");
    expect(previewPayload.data?.text).not.toContain("keyHash");
    expect(previewPayload.data?.text).not.toContain("requestFingerprint");

    const gzipRes = await runBlobGET(new Request(`${LOCAL_ORIGIN}/api/planning/runs/${runId}/blob/raw?gzip=1`, {
      method: "GET",
      headers: {
        host: LOCAL_HOST,
        origin: LOCAL_ORIGIN,
        referer: `${LOCAL_ORIGIN}/planning`,
        "accept-encoding": "gzip",
      },
    }), {
      params: Promise.resolve({ id: runId, name: "raw" }),
    });
    expect(gzipRes.status).toBe(200);
    expect(gzipRes.headers.get("content-encoding")).toBe("gzip");
    const gzippedBytes = Buffer.from(await gzipRes.arrayBuffer());
    const decoded = JSON.parse(gunzipSync(gzippedBytes).toString("utf-8")) as {
      ok?: boolean;
      data?: {
        run?: {
          meta?: { idempotency?: unknown };
          stages?: Array<{ outputRef?: { ref?: { path?: string } } }>;
        };
        outputs?: {
          simulate?: { ref?: { path?: string } };
        };
      };
    };
    expect(decoded.ok).toBe(true);
    expect(decoded.data).toBeDefined();
    expect(decoded.data?.run?.meta?.idempotency).toBeUndefined();
    expect((decoded.data?.outputs?.simulate?.ref?.path ?? undefined)).toBeUndefined();
    expect(
      (decoded.data?.run?.stages ?? []).every((stage) => stage.outputRef?.ref?.path === undefined),
    ).toBe(true);
  });
});
