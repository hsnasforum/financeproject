import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLatestDraftSummaryForStress } from "../src/lib/news/stressContext";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import {
  createDraft,
  createDraftFromBatch,
  getDraft,
  listDrafts,
  listProfileDrafts,
} from "../src/lib/planning/v3/store/draftStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

type DraftBoundaryMigrationReport = {
  summary: {
    candidates: number;
    migrated: number;
    rolledBack: number;
    quarantined: number;
    backupsWritten: number;
  };
};

type DraftBoundaryMigration = (options?: {
  dryRun?: boolean;
  rollback?: boolean;
}) => Promise<DraftBoundaryMigrationReport>;

function cashflowDraftFixture(id = "d_same"): {
  id: string;
  createdAt: string;
  source: { kind: "csv"; filename: string; rows: number; months: number };
  cashflow: Array<{ ym: string; incomeKrw: number; expenseKrw: number; netKrw: number; txCount: number }>;
  draftPatch: Record<string, unknown>;
  summary: { medianIncomeKrw: number; medianExpenseKrw: number; avgNetKrw: number };
} {
  return {
    id,
    createdAt: "2026-03-11T00:00:00.000Z",
    source: { kind: "csv", filename: "cashflow.csv", rows: 2, months: 1 },
    cashflow: [
      { ym: "2026-03", incomeKrw: 3_000_000, expenseKrw: -1_000_000, netKrw: 2_000_000, txCount: 2 },
    ],
    draftPatch: { monthlyIncomeNet: 3_000_000 },
    summary: { medianIncomeKrw: 3_000_000, medianExpenseKrw: 1_000_000, avgNetKrw: 2_000_000 },
  };
}

async function createBatchFixture(): Promise<string> {
  const account = await createAccount({ name: "Main", kind: "checking" });
  const created = await importCsvToBatch({
    csvText: [
      "date,amount,description",
      "2026-01-01,3000000,salary",
      "2026-01-02,-1200000,rent",
      "2026-02-01,3200000,salary",
      "2026-02-02,-1100000,rent",
      "2026-03-01,3100000,salary",
      "2026-03-02,-1000000,rent",
    ].join("\n"),
    mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
    provenance: { fileName: "draft-boundary.csv" },
    options: { accountId: account.id },
  });
  return created.batchMeta.id;
}

async function loadMigration(): Promise<DraftBoundaryMigration | undefined> {
  const mod = await import("../src/lib/planning/v3/store/draftStore");
  return (mod as typeof mod & {
    migrateDraftStorageBoundaries?: DraftBoundaryMigration;
  }).migrateDraftStorageBoundaries;
}

describe("planning v3 draft storage boundary", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-boundary-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps profile drafts out of cashflow draft list and stress summary", async () => {
    const profileDraft = await createDraftFromBatch(await createBatchFixture());

    const cashflowDrafts = await listDrafts();
    expect(cashflowDrafts.map((row) => row.id)).not.toContain(profileDraft.id);
    await expect(readLatestDraftSummaryForStress()).resolves.toBeNull();
  });

  it("keeps cashflow drafts out of profile draft list", async () => {
    const cashflowDraft = await createDraft({
      source: { kind: "csv", filename: "cashflow.csv" },
      cashflow: cashflowDraftFixture("d_cashflow").cashflow,
      draftPatch: { monthlyIncomeNet: 3_000_000 },
    });

    const profileDrafts = await listProfileDrafts();
    expect(profileDrafts.map((row) => row.id)).not.toContain(cashflowDraft.id);
  });

  it("does not silently normalize ambiguous legacy flat draft files", async () => {
    const legacyDraftDir = path.join(root, "planning-v3", "drafts");
    const ambiguousPath = path.join(legacyDraftDir, "d_ambiguous.json");
    fs.mkdirSync(legacyDraftDir, { recursive: true });
    fs.writeFileSync(ambiguousPath, JSON.stringify({
      id: "d_ambiguous",
      createdAt: "2026-03-11T00:00:00.000Z",
      draftPatch: { monthlyIncomeNet: 0 },
    }));

    await expect(listDrafts()).rejects.toMatchObject({
      name: "StorageCorruptedError",
      filePath: ambiguousPath,
    });
  });

  it("prefers typed primary cashflow draft over same-id legacy flat file", async () => {
    const typedDir = path.join(root, "planning-v3", "drafts", "cashflow");
    const legacyDir = path.join(root, "planning-v3", "drafts");
    fs.mkdirSync(typedDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(typedDir, "d_same.json"), JSON.stringify(cashflowDraftFixture("d_same")));
    fs.writeFileSync(path.join(legacyDir, "d_same.json"), JSON.stringify({
      id: "d_same",
      createdAt: "2026-03-10T00:00:00.000Z",
      draftPatch: { monthlyIncomeNet: 0 },
    }));

    const found = await getDraft("d_same");
    expect(found?.summary.medianIncomeKrw).toBe(3_000_000);

    const listed = await listDrafts();
    expect(listed.filter((row) => row.id === "d_same")).toHaveLength(1);
    expect(listed[0]?.summary.medianIncomeKrw).toBe(3_000_000);
  });

  it("exposes dry-run, apply, and rollback migration for legacy flat drafts", async () => {
    const legacyDraftDir = path.join(root, "planning-v3", "drafts");
    fs.mkdirSync(legacyDraftDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDraftDir, "d_migrate.json"), JSON.stringify(cashflowDraftFixture("d_migrate")));
    fs.writeFileSync(path.join(legacyDraftDir, "d_unknown.json"), JSON.stringify({
      id: "d_unknown",
      createdAt: "2026-03-12T00:00:00.000Z",
      draftPatch: { monthlyIncomeNet: 0 },
    }));

    const migrateDraftStorageBoundaries = await loadMigration();
    expect(migrateDraftStorageBoundaries).toBeTypeOf("function");
    if (typeof migrateDraftStorageBoundaries !== "function") return;

    const dryRun = await migrateDraftStorageBoundaries({ dryRun: true });
    expect(dryRun.summary.candidates).toBe(2);
    expect(dryRun.summary.migrated).toBe(0);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "cashflow", "d_migrate.json"))).toBe(false);

    const applied = await migrateDraftStorageBoundaries({ dryRun: false });
    expect(applied.summary.migrated).toBe(1);
    expect(applied.summary.quarantined).toBe(1);
    expect(applied.summary.backupsWritten).toBe(2);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "cashflow", "d_migrate.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "_quarantine", "primary_d_unknown.json"))).toBe(true);

    const rolledBack = await migrateDraftStorageBoundaries({ rollback: true, dryRun: false });
    expect(rolledBack.summary.rolledBack).toBe(2);
    expect(rolledBack.summary.backupsWritten).toBe(0);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "d_migrate.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "d_unknown.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "planning-v3", "drafts", "_quarantine", "primary_d_unknown.json"))).toBe(false);
  });
});
