import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as metricsEventsGET } from "../../../src/app/api/ops/metrics/events/route";
import { GET as metricsSummaryGET } from "../../../src/app/api/ops/metrics/summary/route";
import { appendEvent } from "../../../src/lib/ops/metrics/metricsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalMetricsPath = process.env.PLANNING_OPS_METRICS_STORE_PATH;

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
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalMetricsPath === "string") env.PLANNING_OPS_METRICS_STORE_PATH = originalMetricsPath;
    else delete env.PLANNING_OPS_METRICS_STORE_PATH;

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
    const payload = await response.json() as { ok?: boolean; data?: { last24h?: { total?: number } } };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect((payload.data?.last24h?.total ?? 0)).toBeGreaterThan(0);
  });

  it("blocks non-local requests", async () => {
    const response = await metricsEventsGET(buildRequest("/api/ops/metrics/events?limit=10", "example.com"));
    const payload = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
