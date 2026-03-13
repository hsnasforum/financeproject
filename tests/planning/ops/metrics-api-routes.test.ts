import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as metricsEventsGET } from "../../../src/app/api/ops/metrics/events/route";
import { GET as metricsSummaryGET } from "../../../src/app/api/ops/metrics/summary/route";
import { appendEvent } from "../../../src/lib/ops/metrics/metricsStore";
import { recordPlanningFallbackUsage, resetPlanningFallbackUsageSnapshot } from "../../../src/lib/planning/engine";
import { createRun } from "../../../src/lib/planning/store/runStore";
import { buildResultDtoV1 } from "../../../src/lib/planning/v2/resultDto";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalMetricsPath = process.env.PLANNING_OPS_METRICS_STORE_PATH;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalTrashDir = process.env.PLANNING_TRASH_DIR;
const originalProfileRegistryPath = process.env.PLANNING_PROFILE_REGISTRY_PATH;

function buildRequest(urlPath: string, host = "localhost:3000"): Request {
  const origin = `http://${host}`;
  return new Request(`${origin}${urlPath}`, {
    method: "GET",
    headers: {
      host,
      origin,
      referer: `${origin}/ops/metrics`,
    },
  });
}

describe("ops metrics routes", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-metrics-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_OPS_METRICS_STORE_PATH = path.join(root, "metrics.ndjson");
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_TRASH_DIR = path.join(root, "trash");
    env.PLANNING_PROFILE_REGISTRY_PATH = path.join(root, "vault", "profiles", "index.json");
    resetPlanningFallbackUsageSnapshot();

    await appendEvent({
      type: "RUN_PIPELINE",
      status: "SUCCESS",
      runId: "abcdef123456",
      durationMs: 400,
    });
    await appendEvent({
      type: "RUN_STAGE",
      status: "SUCCESS",
      stage: "simulate",
      runId: "abcdef123456",
      durationMs: 350,
    });
    recordPlanningFallbackUsage("legacyReportContractFallbackCount", {
      source: "reportInput/outputs.resultDto.rebuild",
      sourceKey: "compatRebuild",
      runId: "abcdef123456",
    });
    recordPlanningFallbackUsage("legacyRunEngineMigrationCount", {
      source: "runStore/readRunMetaByPath/resultDtoFallback",
      sourceKey: "legacyEngineFallback",
      runId: "ops-doctor-abcdef123456",
    });

    const resultDto = buildResultDtoV1({
      generatedAt: "2026-03-05T00:00:00.000Z",
      simulate: {
        summary: {
          startNetWorthKrw: 10_000_000,
          endNetWorthKrw: 12_000_000,
          worstCashKrw: 2_000_000,
          worstCashMonthIndex: 3,
          goalsAchievedCount: 1,
          goalsMissedCount: 0,
          warningsCount: 0,
        },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [],
        timeline: [],
      },
    });

    await createRun({
      id: "ops-doctor-summary-probe",
      profileId: "ops-doctor",
      title: "ops doctor probe",
      input: { horizonMonths: 1 },
      meta: { snapshot: { missing: true } },
      outputs: { resultDto },
    }, { enforceRetention: false });

    await createRun({
      id: "user-summary-probe",
      profileId: "profile-1",
      title: "user probe",
      input: { horizonMonths: 1 },
      meta: { snapshot: { missing: true } },
      outputs: {},
    }, { enforceRetention: false });
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalMetricsPath === "string") env.PLANNING_OPS_METRICS_STORE_PATH = originalMetricsPath;
    else delete env.PLANNING_OPS_METRICS_STORE_PATH;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalTrashDir === "string") env.PLANNING_TRASH_DIR = originalTrashDir;
    else delete env.PLANNING_TRASH_DIR;
    if (typeof originalProfileRegistryPath === "string") env.PLANNING_PROFILE_REGISTRY_PATH = originalProfileRegistryPath;
    else delete env.PLANNING_PROFILE_REGISTRY_PATH;

    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns events without csrf for local same-origin GET", async () => {
    const response = await metricsEventsGET(buildRequest("/api/ops/metrics/events?limit=10"));
    const payload = await response.json() as { ok?: boolean; data?: Array<{ runId?: string }>; meta?: { types?: string[] } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect((payload.data?.length ?? 0)).toBeGreaterThan(0);
    expect(payload.data?.[0]?.runId?.length).toBeLessThanOrEqual(8);
    expect(Array.isArray(payload.meta?.types)).toBe(true);
  });

  it("returns summary without csrf for local same-origin GET", async () => {
    const response = await metricsSummaryGET(buildRequest("/api/ops/metrics/summary?range=24h"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        last24h?: { total?: number };
        planningFallbacks?: {
          engineEnvelopeFallbackCount?: number;
          reportContractFallbackCount?: number;
          sourceBreakdown?: {
            legacyReportContractFallbackCount?: { compatRebuild?: number };
          };
          recentEvents?: Array<{ sourceKey?: string; source?: string; runId?: string; runKind?: string }>;
        };
        legacyRunBackfill?: {
          totalRuns?: number;
          opsDoctorRuns?: number;
          userRuns?: number;
          legacyCandidates?: number;
          resultDtoOnlyCandidates?: number;
          missingResultDtoCandidates?: number;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect((payload.data?.last24h?.total ?? 0)).toBeGreaterThan(0);
    expect(typeof payload.data?.planningFallbacks?.engineEnvelopeFallbackCount).toBe("number");
    expect(typeof payload.data?.planningFallbacks?.reportContractFallbackCount).toBe("number");
    expect(payload.data?.planningFallbacks?.sourceBreakdown?.legacyReportContractFallbackCount?.compatRebuild).toBe(1);
    expect(payload.data?.planningFallbacks?.recentEvents?.[0]?.runKind).toBe("opsDoctor");
    expect(payload.data?.legacyRunBackfill?.totalRuns).toBe(2);
    expect(payload.data?.legacyRunBackfill?.opsDoctorRuns).toBe(1);
    expect(payload.data?.legacyRunBackfill?.userRuns).toBe(1);
    expect(typeof payload.data?.legacyRunBackfill?.legacyCandidates).toBe("number");
    expect(typeof payload.data?.legacyRunBackfill?.resultDtoOnlyCandidates).toBe("number");
    expect(typeof payload.data?.legacyRunBackfill?.missingResultDtoCandidates).toBe("number");
  });

  it("blocks non-local requests", async () => {
    const response = await metricsEventsGET(buildRequest("/api/ops/metrics/events?limit=10", "example.com"));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
