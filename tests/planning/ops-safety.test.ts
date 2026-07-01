import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProfile } from "../../src/lib/planning/store/profileStore";
import { createRun, getRun } from "../../src/lib/planning/store/runStore";
import { resolveProfileRunMetaPath } from "../../src/lib/planning/store/paths";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - mjs script export
import { parseOpsSafetyArgs, runOpsSafetyPipeline } from "../../scripts/planning_v2_ops_safety.mjs";

const env = process.env as Record<string, string | undefined>;

const envKeys = [
  "NODE_ENV",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_USER_ID",
  "PLANNING_DATA_DIR",
  "PLANNING_PROFILES_DIR",
  "PLANNING_RUNS_DIR",
  "PLANNING_TRASH_DIR",
  "PLANNING_PROFILE_REGISTRY_PATH",
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<(typeof envKeys)[number], string | undefined>;

type LegacyBackfillReport = {
  status?: string;
  reason?: string;
  candidateCount?: number;
  candidatesSample?: unknown[];
  applyResult?: {
    migrated?: number;
  };
  postApplyCandidateCount?: number;
  postApplySummary?: {
    legacyCandidates?: number;
    totalRuns?: number;
  };
};

function restoreEnv(): void {
  for (const key of envKeys) {
    const original = originalEnv[key];
    if (typeof original === "string") env[key] = original;
    else delete env[key];
  }
}

function configureSyntheticOpsStore(root: string): void {
  env.NODE_ENV = "production";
  env.PLANNING_AUTH_REQUIRED = "1";
  env.PLANNING_NAMESPACE_ENABLED = "true";
  env.PLANNING_SINGLE_USER_MODE = "0";
  env.PLANNING_USER_ID = "ops_fixture_user";
  env.PLANNING_DATA_DIR = path.join(root, ".data", "planning");
  env.PLANNING_PROFILES_DIR = path.join(root, "unused-profiles");
  env.PLANNING_RUNS_DIR = path.join(root, "unused-runs");
  env.PLANNING_TRASH_DIR = path.join(root, "trash");
  env.PLANNING_PROFILE_REGISTRY_PATH = path.join(root, "unused-vault", "profiles", "index.json");
}

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

describe("planning v2 ops safety pipeline", () => {
  let root = "";

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
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

  it("uses synthetic file-backed legacy data to report post-apply inventory", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-safety-file-backed-"));
    configureSyntheticOpsStore(root);

    const profile = await createProfile({
      name: "synthetic ops profile",
      profile: sampleProfile(),
    });
    const resultDto = buildResultDtoV1({
      generatedAt: "2026-03-08T00:00:00.000Z",
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

    const created = await createRun({
      id: "ops-synthetic-legacy-run",
      profileId: profile.id,
      title: "synthetic legacy resultDto only",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: { resultDto },
    }, { enforceRetention: false });

    const runMetaPath = resolveProfileRunMetaPath(profile.id, created.id);
    const runPayload = JSON.parse(fs.readFileSync(runMetaPath, "utf-8")) as PlanningRunRecord;
    runPayload.outputs = { resultDto };
    fs.writeFileSync(runMetaPath, `${JSON.stringify(runPayload, null, 2)}\n`, "utf-8");

    const checkBefore = await runOpsSafetyPipeline({
      cwd: root,
      env,
      processInfo: {
        pid: 24680,
        platform: "linux",
        nodeVersion: "v20.0.0",
      },
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyMode: "check",
      legacyFailThreshold: 0,
      legacyLimit: 10,
    });

    expect(checkBefore.ok).toBe(false);
    const beforeLegacy = checkBefore.report.legacyBackfill as LegacyBackfillReport;
    expect(beforeLegacy.status).toBe("FAIL");
    expect(beforeLegacy.reason).toBe("threshold_exceeded");
    expect(beforeLegacy.candidateCount).toBe(1);
    expect(beforeLegacy.candidatesSample).toEqual([
      expect.objectContaining({
        id: created.id,
        profileId: profile.id,
        reason: "resultDtoOnly",
      }),
    ]);
    expect(checkBefore.report.operatingEnvironment.storageMode).toBe("multi-user-namespaced");
    expect(checkBefore.report.topology.sharedFileStoreCompletion).toBe("not_proven");

    const apply = await runOpsSafetyPipeline({
      cwd: root,
      env,
      processInfo: {
        pid: 24680,
        platform: "linux",
        nodeVersion: "v20.0.0",
      },
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyMode: "apply",
      confirm: "BACKFILL LEGACY RUNS",
      legacyFailThreshold: 0,
      legacyLimit: 10,
    });

    expect(apply.ok).toBe(true);
    const applyLegacy = apply.report.legacyBackfill as LegacyBackfillReport;
    expect(applyLegacy.status).toBe("PASS");
    expect(applyLegacy.reason).toBe("ok");
    expect(applyLegacy.applyResult?.migrated).toBe(1);
    expect(applyLegacy.postApplyCandidateCount).toBe(0);
    expect(applyLegacy.postApplySummary).toEqual(expect.objectContaining({
      legacyCandidates: 0,
      totalRuns: 1,
    }));

    const loaded = await getRun(created.id);
    expect(loaded?.outputs.engine).toBeDefined();
    expect(loaded?.outputs.engineSchemaVersion).toBe(1);

    const checkAfter = await runOpsSafetyPipeline({
      cwd: root,
      env,
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyMode: "check",
      legacyFailThreshold: 0,
      legacyLimit: 10,
    });

    expect(checkAfter.ok).toBe(true);
    const afterLegacy = checkAfter.report.legacyBackfill as LegacyBackfillReport;
    expect(afterLegacy.status).toBe("PASS");
    expect(afterLegacy.candidateCount).toBe(0);
  });

  it("records environment and process-local topology evidence without leaking DATABASE_URL", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-safety-"));
    const result = await runOpsSafetyPipeline({
      cwd: root,
      env: {
        NODE_ENV: "production",
        PLANNING_AUTH_REQUIRED: "1",
        PLANNING_NAMESPACE_ENABLED: "true",
        PLANNING_SINGLE_USER_MODE: "0",
        PLANNING_DATA_DIR: path.join(root, ".data", "planning"),
        DATABASE_URL: "postgresql://user:secret@example.invalid/finance",
      },
      processInfo: {
        pid: 12345,
        platform: "linux",
        nodeVersion: "v20.0.0",
      },
      opsPipelineRunner: async () => ({
        ok: true,
        report: { steps: [] },
        reportPath: ".data/planning/ops/reports/ops.json",
        logPath: ".data/planning/ops/logs/ops.log",
      }),
      legacyMode: "off",
    });

    expect(result.report.operatingEnvironment).toMatchObject({
      nodeEnv: "production",
      authRequired: true,
      planningNamespaceEnabled: true,
      planningSingleUserMode: false,
      storageMode: "multi-user-namespaced",
      databaseUrl: "postgresql",
      dataDir: ".data/planning",
      dataDirExternal: false,
    });
    expect(result.report.topology).toMatchObject({
      processId: 12345,
      platform: "linux",
      nodeVersion: "v20.0.0",
      writeSerializationScope: "process-local",
      sharedFileStoreCompletion: "not_proven",
    });

    const log = fs.readFileSync(path.join(root, result.logPath), "utf8");
    expect(log).toContain("## environment");
    expect(log).toContain("storageMode=multi-user-namespaced");
    expect(log).toContain("sharedFileStoreCompletion=not_proven");
    expect(log).not.toContain("secret");
    expect(log).not.toContain("example.invalid");
  });
});
