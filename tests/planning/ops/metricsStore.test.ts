import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendEvent, readRecent, summarize } from "../../../src/lib/ops/metrics/metricsStore";

const env = process.env as Record<string, string | undefined>;
const originalPath = process.env.PLANNING_OPS_METRICS_STORE_PATH;
const originalMaxBytes = process.env.PLANNING_OPS_METRICS_MAX_BYTES;
const originalRotationCount = process.env.PLANNING_OPS_METRICS_ROTATION_COUNT;

describe("metricsStore", () => {
  let root = "";
  let metricsPath = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-metrics-store-"));
    metricsPath = path.join(root, "metrics.ndjson");
    env.PLANNING_OPS_METRICS_STORE_PATH = metricsPath;
    env.PLANNING_OPS_METRICS_MAX_BYTES = "2048";
    env.PLANNING_OPS_METRICS_ROTATION_COUNT = "2";
  });

  afterEach(async () => {
    if (typeof originalPath === "string") env.PLANNING_OPS_METRICS_STORE_PATH = originalPath;
    else delete env.PLANNING_OPS_METRICS_STORE_PATH;
    if (typeof originalMaxBytes === "string") env.PLANNING_OPS_METRICS_MAX_BYTES = originalMaxBytes;
    else delete env.PLANNING_OPS_METRICS_MAX_BYTES;
    if (typeof originalRotationCount === "string") env.PLANNING_OPS_METRICS_ROTATION_COUNT = originalRotationCount;
    else delete env.PLANNING_OPS_METRICS_ROTATION_COUNT;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("appendEvent writes ndjson and stores runId prefix only", async () => {
    await appendEvent({
      type: "RUN_STAGE",
      status: "SUCCESS",
      stage: "simulate",
      runId: "12345678-abcdef-9999",
      durationMs: 120,
    });

    const rows = await readRecent({ limit: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("RUN_STAGE");
    expect(rows[0]?.runId).toBe("12345678");
    expect(rows[0]?.stage).toBe("simulate");
  });

  it("rotates metrics files when max bytes exceeded", async () => {
    for (let index = 0; index < 300; index += 1) {
      await appendEvent({
        type: "RUN_PIPELINE",
        status: index % 2 === 0 ? "SUCCESS" : "FAILED",
        runId: `run-${index}`,
        durationMs: index * 25,
        errorCode: "rotation-check",
      });
    }

    const files = await fs.readdir(root);
    expect(files).toContain("metrics.1.ndjson");
    expect(files.filter((name) => name.startsWith("metrics") && name.endsWith(".ndjson")).length).toBeLessThanOrEqual(3);
  });

  it("readRecent only reads rotation files that actually exist", async () => {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "metrics.ndjson"), `${JSON.stringify({ at: "2026-03-12T00:00:00.000Z", type: "RUN_STAGE", stage: "simulate" })}\n`, "utf-8");
    await fs.writeFile(path.join(root, "metrics.2.ndjson"), `${JSON.stringify({ at: "2026-03-11T00:00:00.000Z", type: "RUN_PIPELINE", status: "FAILED" })}\n`, "utf-8");

    const rows = await readRecent({ limit: 10 });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.at).toBe("2026-03-12T00:00:00.000Z");
    expect(rows[1]?.at).toBe("2026-03-11T00:00:00.000Z");
  });

  it("does not write obvious secret patterns", async () => {
    await appendEvent({
      type: "ASSUMPTIONS_REFRESH",
      status: "FAILED",
      errorCode: "TOKEN_ERROR",
    });

    const raw = await fs.readFile(metricsPath, "utf-8");
    expect(raw).not.toContain("process.env");
    expect(raw.toLowerCase()).not.toContain("token");
  });

  it("summarize aggregates run and refresh anomalies", async () => {
    const now = new Date();
    for (let index = 0; index < 3; index += 1) {
      await appendEvent({
        type: "ASSUMPTIONS_REFRESH",
        at: new Date(now.getTime() - index * 60_000).toISOString(),
        status: "FAILED",
      });
    }
    await appendEvent({
      type: "RUN_PIPELINE",
      at: now.toISOString(),
      status: "FAILED",
      runId: "abcdef1234",
      durationMs: 500,
    });
    await appendEvent({
      type: "RUN_STAGE",
      at: now.toISOString(),
      status: "SUCCESS",
      stage: "simulate",
      durationMs: 400,
    });

    const summary = await summarize({ rangeHours: 24 });
    expect(summary.runPipeline.total).toBeGreaterThanOrEqual(1);
    expect(summary.assumptionsRefresh.consecutiveFailures).toBe(3);
    expect(summary.simulate.count).toBeGreaterThanOrEqual(1);
  });
});
