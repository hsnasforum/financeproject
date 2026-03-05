import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as runReportGET } from "../../src/app/api/planning/v2/runs/[id]/report/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function profileFixture() {
  return {
    monthlyIncomeNet: 4_600_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 1_500_000,
    investmentAssets: 4_000_000,
    debts: [],
    goals: [],
  };
}

function buildJsonRequest(method: string, urlPath: string, body: unknown): Request {
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

function buildGetRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/runs`,
    },
  });
}

describe("GET /api/planning/v2/runs/[id]/report", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-runs-report-"));
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

  it("returns html report content without internal path leakage", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "report profile",
      profile: profileFixture(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "report run",
      input: {
        horizonMonths: 24,
        includeProducts: false,
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as { data?: { id?: string } };
    const runId = String(runCreatePayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const response = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report`),
      { params: Promise.resolve({ id: runId }) },
    );

    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Executive Summary");
    expect(html).toContain("10초 판정");
    expect(html).toContain("Warnings");
    expect(html).toContain("Action Plan");
    expect(html).not.toContain(".data");
  });
});
