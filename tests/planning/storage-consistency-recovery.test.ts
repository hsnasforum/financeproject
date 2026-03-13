import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "../../src/lib/planning/storage/atomicWrite";
import { beginStorageTransaction } from "../../src/lib/planning/storage/journal";
import {
  checkPlanningStorageConsistency,
  recoverPlanningStorageTransactions,
} from "../../src/lib/planning/storage/consistency";
import { resetVaultRuntimeForTests } from "../../src/lib/planning/security/vaultState";
import { resolveProfileRunMetaPath, resolveRunsIndexPath } from "../../src/lib/planning/store/paths";
import { createProfile } from "../../src/lib/planning/store/profileStore";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { createRun, readRunIndexEntries } from "../../src/lib/planning/store/runStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalProfileMetaPath = process.env.PLANNING_PROFILE_META_PATH;
const originalJournalPath = process.env.PLANNING_STORAGE_JOURNAL_PATH;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;

function profileFixture() {
  return {
    schemaVersion: 2,
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_800_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 3_000_000,
    investmentAssets: 5_000_000,
    debts: [],
    goals: [],
  };
}

describe.sequential("planning storage consistency/recovery", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-storage-consistency-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_PROFILE_META_PATH = path.join(root, "vault", "profiles.meta.json");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, "storage", "journal.ndjson");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalProfileMetaPath === "string") env.PLANNING_PROFILE_META_PATH = originalProfileMetaPath;
    else delete env.PLANNING_PROFILE_META_PATH;
    if (typeof originalJournalPath === "string") env.PLANNING_STORAGE_JOURNAL_PATH = originalJournalPath;
    else delete env.PLANNING_STORAGE_JOURNAL_PATH;
    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("replays pending run-create transaction to repair missing run index entry", async () => {
    const profile = await createProfile({
      name: "recovery profile",
      profile: profileFixture(),
    });

    const run = await createRun({
      id: "recovery-run-1",
      profileId: profile.id,
      title: "recovery run",
      input: { horizonMonths: 12 },
      meta: {
        snapshot: { id: "snapshot-1", asOf: "2026-03-01", fetchedAt: "2026-03-01T00:00:00.000Z" },
        health: { warningsCodes: [], criticalCount: 0 },
      },
      outputs: {},
    }, { enforceRetention: false });

    const indexPath = resolveRunsIndexPath();
    const indexRaw = JSON.parse(await fs.promises.readFile(indexPath, "utf-8")) as { version?: number; entries?: Array<{ id?: string }> };
    const nextEntries = Array.isArray(indexRaw.entries)
      ? indexRaw.entries.filter((entry) => entry?.id !== run.id)
      : [];
    await atomicWriteJson(indexPath, {
      version: 1,
      entries: nextEntries,
    });

    await beginStorageTransaction("RUN_CREATE", {
      runId: run.id,
      profileId: run.profileId,
    });

    const recovery = await recoverPlanningStorageTransactions();
    expect(recovery.scanned).toBeGreaterThan(0);
    expect(recovery.recoveredCommit).toBeGreaterThan(0);

    const repaired = await readRunIndexEntries();
    expect(repaired.some((entry) => entry.id === run.id)).toBe(true);
  });

  it("checker catches run blob ref mismatch", async () => {
    const profile = await createProfile({
      name: "mismatch profile",
      profile: profileFixture(),
    });

    const run = await createRun({
      id: "mismatch-run-1",
      profileId: profile.id,
      title: "mismatch run",
      input: { horizonMonths: 12 },
      meta: {
        snapshot: { id: "snapshot-1", asOf: "2026-03-01", fetchedAt: "2026-03-01T00:00:00.000Z" },
        health: { warningsCodes: [], criticalCount: 0 },
      },
      outputs: {
        simulate: {
          ref: {
            name: "simulate",
            path: ".data/planning/runs/mismatch-run-1/simulate.json",
          },
          summary: {
            monthlySurplusKrw: 500_000,
          },
        } as unknown as PlanningRunRecord["outputs"]["simulate"],
      },
    }, { enforceRetention: false });

    const metaPath = resolveProfileRunMetaPath(run.profileId, run.id);
    const rawMeta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8")) as Record<string, unknown>;
    const outputs = (rawMeta.outputs && typeof rawMeta.outputs === "object" && !Array.isArray(rawMeta.outputs))
      ? (rawMeta.outputs as Record<string, unknown>)
      : {};
    const simulate = (outputs.simulate && typeof outputs.simulate === "object" && !Array.isArray(outputs.simulate))
      ? (outputs.simulate as Record<string, unknown>)
      : {};
    simulate.ref = {
      name: "simulate",
      path: ".data/planning/runs/does-not-exist/simulate.json",
    };
    outputs.simulate = simulate;
    rawMeta.outputs = outputs;
    await atomicWriteJson(metaPath, rawMeta);

    const report = await checkPlanningStorageConsistency();
    expect(report.issues.some((issue) => issue.code === "RUN_BLOB_REF_MISSING")).toBe(true);
  });
});
