import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { POST as shareReportPOST } from "../../src/app/api/planning/v2/share-report/route";
import { GET as shareReportDownloadGET } from "../../src/app/api/planning/v2/share-report/[id]/download/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalShareDir = process.env.PLANNING_SHARE_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function profileFixture() {
  return {
    monthlyIncomeNet: 4_300_000,
    monthlyEssentialExpenses: 1_600_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 1_200_000,
    investmentAssets: 3_500_000,
    debts: [
      {
        id: "loan-home",
        name: "주택담보대출",
        balance: 120_000_000,
        minimumPayment: 800_000,
      },
    ],
    goals: [
      {
        id: "goal-house",
        name: "집 계약금",
        targetAmount: 50_000_000,
      },
    ],
  };
}

function buildJsonRequest(method: string, urlPath: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/runs`,
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

describe("planning share report routes", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-share-report-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_SHARE_DIR = path.join(root, "share");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalShareDir === "string") env.PLANNING_SHARE_DIR = originalShareDir;
    else delete env.PLANNING_SHARE_DIR;
    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates and downloads share report without exposing internal .data path", async () => {
    const profileRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "share profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");

    const runRes = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "share run",
      input: {
        horizonMonths: 24,
        includeProducts: false,
      },
    }));
    const runPayload = await runRes.json() as { data?: { id?: string } };
    const runId = String(runPayload.data?.id ?? "");

    const createRes = await shareReportPOST(buildJsonRequest("POST", "/api/planning/v2/share-report", {
      runId,
      level: "standard",
    }));
    const createPayload = await createRes.json() as {
      ok?: boolean;
      data?: { id?: string };
    };
    expect(createRes.status).toBe(201);
    expect(createPayload.ok).toBe(true);
    expect(createPayload.data?.id).toBeTruthy();
    expect(JSON.stringify(createPayload)).not.toContain(".data");

    const shareId = String(createPayload.data?.id ?? "");
    const downloadRes = await shareReportDownloadGET(
      buildGetRequest(`/api/planning/v2/share-report/${shareId}/download`),
      { params: Promise.resolve({ id: shareId }) },
    );
    const markdown = await downloadRes.text();
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-disposition")).toContain(`planning-share-${shareId}.md`);
    expect(markdown).toContain("가정 기반이며 보장이 아니며, 투자/가입 권유가 아닙니다.");
  });
});
