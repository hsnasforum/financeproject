import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as profilesPOST } from "../../src/app/api/planning/v2/profiles/route";
import { POST as runsPOST } from "../../src/app/api/planning/v2/runs/route";
import { GET as exportHtmlGET } from "../../src/app/api/planning/reports/[runId]/export.html/route";
import { saveAssumptionsOverrides } from "../../src/lib/planning/assumptions/overridesStorage";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const originalAssumptionsOverridesPath = process.env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;

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

function buildJsonRequest(method: string, urlPath: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      "content-type": "application/json",
      ...(headers ?? {}),
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

describe("GET /api/planning/reports/[runId]/export.html", () => {
  let root = "";

  async function createRunForExport(): Promise<string> {
    const createProfileResponse = await profilesPOST(buildJsonRequest("POST", "/api/planning/v2/profiles", {
      name: "export profile",
      profile: profileFixture(),
    }));
    const createProfilePayload = await createProfileResponse.json() as { data?: { id?: string } };
    const profileId = String(createProfilePayload.data?.id ?? "");
    expect(profileId).toBeTruthy();

    const runCreateResponse = await runsPOST(buildJsonRequest(
      "POST",
      "/api/planning/v2/runs",
      {
        csrf: "test-token",
        profileId,
        title: "export run",
        input: {
          horizonMonths: 24,
          includeProducts: false,
        },
      },
      { cookie: "dev_csrf=test-token" },
    ));
    const runCreatePayload = await runCreateResponse.json() as { data?: { id?: string } };
    const runId = String(runCreatePayload.data?.id ?? "");
    expect(runId).toBeTruthy();
    return runId;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-reports-export-html-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = path.join(root, ".data", "planning", "assumptions", "overrides.json");
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
    if (typeof originalAssumptionsOverridesPath === "string") env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = originalAssumptionsOverridesPath;
    else delete env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns standalone html with required sections and no raw dumps", async () => {
    await saveAssumptionsOverrides([
      {
        key: "inflationPct",
        value: 2.7,
        reason: "test override",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ]);

    const runId = await createRunForExport();

    const response = await exportHtmlGET(
      buildGetRequest(`/api/planning/reports/${runId}/export.html`),
      { params: Promise.resolve({ runId }) },
    );

    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Warnings");
    expect(html).toContain("Goals");
    expect(html).toContain("Action Plan");
    expect(html).toContain("계산 근거");
    expect(html).toContain("Applied overrides");
    expect(html).toContain("inflationPct=2.7");
    expect(html).toContain("@page");
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("@media print");
    expect(html).not.toContain("<pre>{");
    expect(html).not.toContain("```json");
    expect(html).not.toContain(".data/");
    expect(html).not.toContain("process.env");
    expect(html).not.toContain("GITHUB_TOKEN");
    expect(html).not.toContain("ECOS_API_KEY");
    expect(html).not.toContain("Bearer ");
  });

  it("supports print view mode with inline disposition and print script", async () => {
    const runId = await createRunForExport();
    const response = await exportHtmlGET(
      buildGetRequest(`/api/planning/reports/${runId}/export.html?view=print`),
      { params: Promise.resolve({ runId }) },
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("inline;");
    expect(html).toContain("window.print()");
  });
});
