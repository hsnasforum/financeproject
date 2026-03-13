import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - mjs script export
import { parseOpsSafetyArgs, runOpsSafetyPipeline } from "../../scripts/planning_v2_ops_safety.mjs";

describe("planning v2 ops safety pipeline", () => {
  let root = "";

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("parses legacy args with safe defaults", () => {
    const parsed = parseOpsSafetyArgs([
      "--with-regress",
      "--legacy-mode=apply",
      "--legacy-limit=250",
      "--legacy-fail-threshold=10",
      "--legacy-include-ops-doctor",
      "--confirm=BACKFILL LEGACY RUNS",
    ]);
    expect(parsed.withRegress).toBe(true);
    expect(parsed.legacyMode).toBe("apply");
    expect(parsed.legacyLimit).toBe(250);
    expect(parsed.legacyFailThreshold).toBe(10);
    expect(parsed.legacyIncludeOpsDoctor).toBe(true);
    expect(parsed.confirm).toBe("BACKFILL LEGACY RUNS");
  });

  it("fails when legacy candidates exceed threshold in check mode", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-safety-"));
    const result = await runOpsSafetyPipeline({
      cwd: root,
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyHelpers: {
        summarizeLegacyRunBackfill: async () => ({ totalRuns: 3, legacyCandidates: 2 }),
        listLegacyRunBackfillCandidates: async () => [
          {
            id: "run-1",
            profileId: "p1",
            createdAt: "2026-03-08T00:00:00.000Z",
            runKind: "user",
            reason: "resultDtoOnly",
          },
          {
            id: "run-2",
            profileId: "p1",
            createdAt: "2026-03-08T00:00:00.000Z",
            runKind: "user",
            reason: "missingEngineSchema",
          },
        ],
      },
      legacyMode: "check",
      legacyFailThreshold: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.report.legacyBackfill.status).toBe("FAIL");
    expect(result.report.legacyBackfill.reason).toBe("threshold_exceeded");
    expect("candidateCount" in result.report.legacyBackfill ? result.report.legacyBackfill.candidateCount : undefined).toBe(2);
    expect(fs.existsSync(path.join(root, result.reportPath))).toBe(true);
    expect(fs.existsSync(path.join(root, result.logPath))).toBe(true);
  });

  it("fails apply mode when confirm text mismatches", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-safety-"));
    const backfillSpy = vi.fn(async () => ({ selected: 1, migrated: 1, skipped: 0, failed: 0, candidates: [] }));
    const result = await runOpsSafetyPipeline({
      cwd: root,
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyHelpers: {
        summarizeLegacyRunBackfill: async () => ({ totalRuns: 1, legacyCandidates: 1 }),
        listLegacyRunBackfillCandidates: async () => [],
        backfillLegacyRuns: backfillSpy,
      },
      legacyMode: "apply",
      confirm: "WRONG",
    });

    expect(result.ok).toBe(false);
    expect(result.report.legacyBackfill.status).toBe("FAIL");
    expect(result.report.legacyBackfill.reason).toBe("confirm_mismatch");
    expect(backfillSpy).not.toHaveBeenCalled();
  });

  it("applies backfill and passes when no failures and threshold satisfied", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-safety-"));
    const backfillSpy = vi.fn(async () => ({ selected: 2, migrated: 2, skipped: 0, failed: 0, candidates: [] }));
    const result = await runOpsSafetyPipeline({
      cwd: root,
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyHelpers: {
        summarizeLegacyRunBackfill: async () => ({ totalRuns: 2, legacyCandidates: 1 }),
        listLegacyRunBackfillCandidates: async () => [
          {
            id: "run-1",
            profileId: "p1",
            createdAt: "2026-03-08T00:00:00.000Z",
            runKind: "user",
            reason: "resultDtoOnly",
          },
        ],
        backfillLegacyRuns: backfillSpy,
      },
      legacyMode: "apply",
      confirm: "BACKFILL LEGACY RUNS",
      legacyFailThreshold: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.report.legacyBackfill.status).toBe("PASS");
    expect(result.report.legacyBackfill.reason).toBe("ok");
    expect(backfillSpy).toHaveBeenCalledTimes(1);
  });
});
