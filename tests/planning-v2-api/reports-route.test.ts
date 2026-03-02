import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as reportsGET, POST as reportsPOST } from "../../src/app/api/planning/v2/reports/route";
import { DELETE as reportDELETE, GET as reportGET } from "../../src/app/api/planning/v2/reports/[id]/route";
import { GET as reportDownloadGET } from "../../src/app/api/planning/v2/reports/[id]/download/route";
import { buildConfirmString } from "../../src/lib/ops/confirm";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalReportsDir = process.env.PLANNING_REPORTS_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

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
      referer: `${LOCAL_ORIGIN}/planning/reports`,
    },
  });
}

describe("planning reports api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-reports-route-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_REPORTS_DIR = path.join(root, "reports");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions-history");
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalReportsDir === "string") env.PLANNING_REPORTS_DIR = originalReportsDir;
    else delete env.PLANNING_REPORTS_DIR;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates/lists/reads/downloads report and does not leak internal paths", async () => {
    const profileRes = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "report profile",
      profile: profileFixture(),
    }));
    const profilePayload = await profileRes.json() as { data?: { id?: string } };
    const profileId = String(profilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runRes = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "report run",
      input: {
        horizonMonths: 18,
        includeProducts: false,
      },
    }));
    const runPayload = await runRes.json() as { data?: { id?: string } };
    const runId = String(runPayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const createRes = await reportsPOST(buildJsonRequest("POST", "/api/planning/v2/reports", { runId }));
    const createPayload = await createRes.json() as { ok?: boolean; data?: { id?: string } };
    const reportId = String(createPayload.data?.id ?? "");
    expect(createRes.status).toBe(201);
    expect(createPayload.ok).toBe(true);
    expect(reportId).toBeTruthy();

    const listRes = await reportsGET(buildGetRequest("/api/planning/v2/reports"));
    const listPayload = await listRes.json() as { ok?: boolean; data?: Array<{ id: string; runId?: string }> };
    expect(listRes.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect(listPayload.data?.some((row) => row.id === reportId && row.runId === runId)).toBe(true);
    expect(JSON.stringify(listPayload)).not.toContain(".data");

    const readRes = await reportGET(
      buildGetRequest(`/api/planning/v2/reports/${reportId}`),
      { params: Promise.resolve({ id: reportId }) },
    );
    const readPayload = await readRes.json() as {
      ok?: boolean;
      data?: { id?: string; markdown?: string };
    };
    expect(readRes.status).toBe(200);
    expect(readPayload.ok).toBe(true);
    expect(readPayload.data?.id).toBe(reportId);
    expect(readPayload.data?.markdown).toContain("## Executive Summary");
    expect(readPayload.data?.markdown).toContain("## Warnings Summary");
    expect(readPayload.data?.markdown).toContain("## Actions Top 5");
    expect(JSON.stringify(readPayload)).not.toContain(".data");

    const downloadRes = await reportDownloadGET(
      buildGetRequest(`/api/planning/v2/reports/${reportId}/download`),
      { params: Promise.resolve({ id: reportId }) },
    );
    const markdown = await downloadRes.text();
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toContain("text/markdown");
    expect(downloadRes.headers.get("content-disposition")).toContain(`planning-report-${reportId}.md`);
    expect(markdown).toContain("## Executive Summary");

    const deleteRes = await reportDELETE(
      buildJsonRequest("DELETE", `/api/planning/v2/reports/${reportId}`, {
        confirmText: buildConfirmString("DELETE report", reportId),
      }),
      { params: Promise.resolve({ id: reportId }) },
    );
    const deletePayload = await deleteRes.json() as { ok?: boolean; data?: { deleted?: boolean } };
    expect(deleteRes.status).toBe(200);
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.data?.deleted).toBe(true);
  });
});
