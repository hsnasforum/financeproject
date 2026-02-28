import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - mjs script export
import { runOpsPipeline } from "../../scripts/planning_v2_ops_run.mjs";

function makeRunResult(script: string, exitCode: number) {
  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: [script],
    exitCode,
    durationMs: 1,
    stdout: `${script} stdout`,
    stderr: exitCode === 0 ? "" : `${script} stderr`,
  };
}

describe("planning v2 ops run pipeline", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("runs doctor -> complete and skips regress by default", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-run-"));
    const calls: string[] = [];

    const result = await runOpsPipeline({
      cwd: root,
      nowIso: "2026-02-28T00:00:00.000Z",
      pkgScripts: {
        "planning:v2:doctor": "node scripts/planning_v2_doctor.mjs",
        "planning:v2:complete": "node scripts/planning_v2_complete.mjs",
        "planning:assumptions:sync": "node scripts/planning_assumptions_sync.mjs",
        "planning:v2:regress": "node scripts/planning_v2_regression.mjs",
      },
      helpers: {
        loadLatestAssumptionsSnapshot: async () => ({ asOf: "2026-02-01", fetchedAt: "2026-02-20T00:00:00.000Z" }),
        shouldSyncSnapshot: () => ({ attempt: false, reason: "FRESH_DAYS_8", staleDays: 8 }),
      },
      runScript: async (script: string) => {
        calls.push(script);
        return makeRunResult(script, 0);
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["planning:v2:doctor", "planning:v2:complete"]);
    expect(result.report.steps.find((row: { name: string }) => row.name === "assumptions-sync")?.status).toBe("SKIPPED");
    expect(result.report.steps.find((row: { name: string }) => row.name === "regress")?.status).toBe("SKIPPED");
    expect(result.report.snapshot.syncAttempted).toBe(false);
  });

  it("continues when assumptions sync fails and runs regress with --with-regress", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-run-"));
    const calls: string[] = [];

    const result = await runOpsPipeline({
      cwd: root,
      nowIso: "2026-02-28T00:00:00.000Z",
      withRegress: true,
      pkgScripts: {
        "planning:v2:doctor": "node scripts/planning_v2_doctor.mjs",
        "planning:v2:complete": "node scripts/planning_v2_complete.mjs",
        "planning:assumptions:sync": "node scripts/planning_assumptions_sync.mjs",
        "planning:v2:regress": "node scripts/planning_v2_regression.mjs",
      },
      helpers: {
        loadLatestAssumptionsSnapshot: async () => ({ asOf: "2025-11-01", fetchedAt: "2025-12-01T00:00:00.000Z" }),
        shouldSyncSnapshot: () => ({ attempt: true, reason: "STALE_DAYS_89", staleDays: 89 }),
      },
      runScript: async (script: string) => {
        calls.push(script);
        if (script === "planning:assumptions:sync") return makeRunResult(script, 1);
        return makeRunResult(script, 0);
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "planning:v2:doctor",
      "planning:assumptions:sync",
      "planning:v2:complete",
      "planning:v2:regress",
    ]);
    const syncStep = result.report.steps.find((row: { name: string }) => row.name === "assumptions-sync");
    expect(syncStep?.status).toBe("FAIL");
    expect(syncStep?.note).toBe("sync_failed_continue");
    expect(result.report.snapshot.syncAttempted).toBe(true);
    expect(result.report.snapshot.syncResult).toBe("WARN");
  });
});

