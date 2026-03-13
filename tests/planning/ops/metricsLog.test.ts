import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendOpsMetricEvent, listOpsMetricEvents } from "../../../src/lib/ops/metricsLog";

const env = process.env as Record<string, string | undefined>;
const originalPath = process.env.PLANNING_OPS_METRICS_PATH;
const originalMaxBytes = process.env.PLANNING_OPS_METRICS_MAX_BYTES;
const originalMaxFiles = process.env.PLANNING_OPS_METRICS_MAX_FILES;

describe("metricsLog", () => {
  let root = "";
  let logPath = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-metrics-"));
    logPath = path.join(root, "events.ndjson");
    env.PLANNING_OPS_METRICS_PATH = logPath;
    env.PLANNING_OPS_METRICS_MAX_BYTES = "32768";
    env.PLANNING_OPS_METRICS_MAX_FILES = "2";
  });

  afterEach(async () => {
    if (typeof originalPath === "string") env.PLANNING_OPS_METRICS_PATH = originalPath;
    else delete env.PLANNING_OPS_METRICS_PATH;
    if (typeof originalMaxBytes === "string") env.PLANNING_OPS_METRICS_MAX_BYTES = originalMaxBytes;
    else delete env.PLANNING_OPS_METRICS_MAX_BYTES;
    if (typeof originalMaxFiles === "string") env.PLANNING_OPS_METRICS_MAX_FILES = originalMaxFiles;
    else delete env.PLANNING_OPS_METRICS_MAX_FILES;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rotates ndjson files when size exceeds max bytes", async () => {
    for (let index = 0; index < 600; index += 1) {
      await appendOpsMetricEvent({
        type: "RUN_STAGE",
        at: new Date(Date.parse("2026-03-01T00:00:00.000Z") + index * 1_000).toISOString(),
        meta: {
          stageId: "simulate",
          status: index % 2 === 0 ? "SUCCESS" : "FAILED",
          durationMs: index * 33,
          reason: "rotation-test-line".repeat(200),
        },
      });
    }

    const fileNames = await fs.readdir(root);
    expect(fileNames).toContain("events.ndjson.1");
    expect(fileNames.filter((row) => row.startsWith("events.ndjson")).length).toBeLessThanOrEqual(3);

    const rows = await listOpsMetricEvents({ limit: 200 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.type).toBe("RUN_STAGE");
  });

  it("sanitizes secret patterns and keeps only allowlisted fields", async () => {
    await appendOpsMetricEvent({
      type: "RUN_STAGE",
      meta: {
        stageId: "simulate",
        status: "FAILED",
        durationMs: 120,
        reason: "Authorization: Bearer abc123 GITHUB_TOKEN=ghp_raw .data/planning/profiles/user.json",
        passphrase: "never-log-me",
        rawBlob: "{\"secret\":\"value\"}",
      },
    });

    const raw = await fs.readFile(logPath, "utf-8");
    expect(raw).toContain("Bearer ***");
    expect(raw).toContain("GITHUB_TOKEN=***");
    expect(raw).toContain("<DATA_PATH>");
    expect(raw).not.toContain("abc123");
    expect(raw).not.toContain("ghp_raw");
    expect(raw).not.toContain("never-log-me");
    expect(raw).not.toContain("passphrase");
    expect(raw).not.toContain("rawBlob");
  });

  it("reads sparse rotated files without probing missing suffixes", async () => {
    await fs.writeFile(
      logPath,
      `${JSON.stringify({ type: "RUN_STAGE", at: "2026-03-01T00:00:03.000Z", meta: { status: "SUCCESS" } })}\n`,
      "utf-8",
    );
    await fs.writeFile(
      `${logPath}.2`,
      `${JSON.stringify({ type: "RUN_STAGE", at: "2026-03-01T00:00:01.000Z", meta: { status: "FAILED" } })}\n`,
      "utf-8",
    );

    const rows = await listOpsMetricEvents({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.at).toBe("2026-03-01T00:00:03.000Z");
    expect(rows[1]?.at).toBe("2026-03-01T00:00:01.000Z");
  });
});
