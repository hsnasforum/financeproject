import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { POST as computePOST } from "../src/app/api/planner/compute/route";
import { type PlannerInput } from "../src/lib/planner/types";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalAuditLogPath = process.env.AUDIT_LOG_PATH;
const auditTempDirs: string[] = [];

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function baseInput(): PlannerInput {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyFixedExpenses: 1_200_000,
    monthlyVariableExpenses: 800_000,
    liquidAssets: 1_000_000,
    otherAssets: 0,
    debts: [],
    goals: [{ name: "목돈", targetAmount: 12_000_000, horizonMonths: 24 }],
  };
}

function buildRequest(headers: Record<string, string> = {}, body: unknown = { input: baseInput() }): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planner/compute`, {
    method: "POST",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("legacy planner compute route auth", () => {
  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;
    if (typeof originalAuthSecret === "string") env.AUTH_SECRET = originalAuthSecret;
    else delete env.AUTH_SECRET;
    if (typeof originalNextAuthSecret === "string") env.NEXTAUTH_SECRET = originalNextAuthSecret;
    else delete env.NEXTAUTH_SECRET;
    if (typeof originalAuditLogPath === "string") env.AUDIT_LOG_PATH = originalAuditLogPath;
    else delete env.AUDIT_LOG_PATH;
    for (const dir of auditTempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the standard 401 response when planning auth is required", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;

    const res = await computePOST(buildRequest());
    const payload = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      },
    });
  });

  it("rejects spoofed trusted headers when the bridge is disabled", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "0";

    const res = await computePOST(buildRequest({ "x-planning-user-id": "attacker" }));
    const payload = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(403);
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "신뢰된 인증 헤더가 비활성화되어 있습니다.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("attacker");
  });

  it("blocks cross-origin compute requests before using trusted headers", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";

    const res = await computePOST(buildRequest({
      origin: "https://example.com",
      referer: "https://example.com/planning",
      "x-planning-user-id": "alice",
    }));
    const payload = await res.json() as { ok?: boolean; error?: { code?: string; message?: string } };

    expect(res.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      error: {
        code: "ORIGIN_MISMATCH",
        message: "동일 origin 요청만 허용됩니다.",
      },
    });
  });

  it("computes only inside an explicit planning user scope", async () => {
    env.NODE_ENV = "test";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-compute-audit-"));
    auditTempDirs.push(auditDir);
    env.AUDIT_LOG_PATH = path.join(auditDir, "audit.json");

    const res = await computePOST(buildRequest({ "x-planning-user-id": "alice" }));
    const payload = await res.json() as {
      ok?: boolean;
      result?: unknown;
      meta?: {
        userId?: string;
        authSource?: string;
        legacyApi?: {
          id?: string;
          status?: string;
          owner?: string;
          sunset?: string;
          replacement?: string;
          telemetryEvent?: string;
        };
      };
    };

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.result).toBeTruthy();
    expect(payload.meta).toMatchObject({
      userId: "alice",
      authSource: "trusted-header",
    });
    expect(payload.meta?.legacyApi).toMatchObject({
      id: "planner-compute",
      status: "deprecated-compatibility",
      owner: "Planning Reports / Architecture",
      sunset: "TBD-after-telemetry-inventory",
      replacement: "planning-v2 run/report APIs",
      telemetryEvent: "legacy_planner_compute_called",
    });
    const auditRows = JSON.parse(fs.readFileSync(env.AUDIT_LOG_PATH, "utf8")) as Array<{
      event?: string;
      route?: string;
      details?: {
        legacyApiId?: string;
        userId?: string;
        authSource?: string;
      };
    }>;
    expect(auditRows.at(-1)).toMatchObject({
      event: "legacy_planner_compute_called",
      route: "/api/planner/compute",
      details: {
        legacyApiId: "planner-compute",
        userId: "alice",
        authSource: "trusted-header",
      },
    });
  });
});
