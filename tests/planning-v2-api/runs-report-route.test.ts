import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as runReportGET } from "../../src/app/api/planning/v2/runs/[id]/report/route";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

installPlanningAuthRequiredFalseForTest();

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

  it("keeps run read and html artifact rendering behind the run report service", () => {
    const reportRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v2/runs/[id]/report/route.ts"),
      "utf8",
    );
    const pdfRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v2/runs/[id]/report.pdf/route.ts"),
      "utf8",
    );
    const serviceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/reports/runReportRouteService.ts"),
      "utf8",
    );

    for (const routeSource of [reportRouteSource, pdfRouteSource]) {
      expect(routeSource).not.toContain("server/runs/repository");
      expect(routeSource).not.toContain("buildStandaloneReportArtifactsFromRun");
      expect(routeSource).toContain("getCurrentUserRunReportHtml");
    }
    expect(serviceSource).toContain("getCurrentUserRun");
    expect(serviceSource).toContain("buildStandaloneReportArtifactsFromRun");
  });

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
    expect(html).toContain("Top Actions");
    expect(html).not.toContain(".data");
  });

  it("renders a two-run comparison report with metrics, snapshot health, and override differences", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "comparison profile",
      profile: profileFixture(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const baseResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "기준 실행 <script>alert(1)</script>",
      input: {
        horizonMonths: 24,
        assumptionsOverride: { inflation: 2 },
        includeProducts: false,
      },
    }));
    const basePayload = await baseResponse.json() as { data?: { id?: string } };
    const baseRunId = String(basePayload.data?.id ?? "");
    expect(baseResponse.status).toBe(201);
    expect(baseRunId).toBeTruthy();

    const currentResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "비교 실행",
      input: {
        horizonMonths: 36,
        assumptionsOverride: { inflation: 3 },
        includeProducts: false,
      },
    }));
    const currentPayload = await currentResponse.json() as { data?: { id?: string } };
    const currentRunId = String(currentPayload.data?.id ?? "");
    expect(currentResponse.status).toBe(201);
    expect(currentRunId).toBeTruthy();

    const response = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${currentRunId}/report?compareTo=${baseRunId}&download=1`),
      { params: Promise.resolve({ id: currentRunId }) },
    );

    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toContain(`planning-run-comparison-${baseRunId}-${currentRunId}.html`);
    expect(html).toContain("실행 비교");
    expect(html).toContain("핵심 지표 차이");
    expect(html).toContain("기준일(asOf)");
    expect(html).toContain("스냅샷 및 상태");
    expect(html).toContain("오버라이드 차이");
    expect(html).toContain("inflationPct");
    expect(html).toContain("기준 실행 &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain(".data");
  });

  it("rejects invalid or self comparison and reports a missing comparison run as 404", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "comparison validation profile",
      profile: profileFixture(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "comparison validation run",
      input: {
        horizonMonths: 24,
        includeProducts: false,
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as { data?: { id?: string } };
    const runId = String(runCreatePayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const selfResponse = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report?compareTo=${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(selfResponse.status).toBe(400);
    await expect(selfResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INPUT", message: "같은 실행끼리는 비교할 수 없습니다." },
    });

    const invalidResponse = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report?compareTo=..%2Fsecret`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INPUT" },
    });

    const duplicateResponse = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report?compareTo=base-1&compareTo=base-2`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(duplicateResponse.status).toBe(400);

    const missingResponse = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report?compareTo=missing-run`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "NO_DATA", message: "비교 기준 실행 기록을 찾을 수 없습니다." },
    });
  });

  it("supports strict contract mode for canonical runs", async () => {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "strict report profile",
      profile: profileFixture(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest("POST", "/api/planning/v2/runs", {
      profileId,
      title: "strict report run",
      input: {
        horizonMonths: 24,
        includeProducts: false,
      },
    }));
    const runCreatePayload = await runCreateResponse.json() as { data?: { id?: string } };
    const runId = String(runCreatePayload.data?.id ?? "");
    expect(runId).toBeTruthy();

    const response = await runReportGET(
      buildGetRequest(`/api/planning/v2/runs/${runId}/report?contract=strict`),
      { params: Promise.resolve({ id: runId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
