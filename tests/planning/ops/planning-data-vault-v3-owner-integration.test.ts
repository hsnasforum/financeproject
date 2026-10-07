import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPlanningDataVaultZip,
  previewPlanningDataVaultZip,
  restorePlanningDataVaultZip,
} from "../../../src/lib/ops/backup/planningDataVault";
import {
  PLANNING_CURRENT_USER_V3_OWNER_IDS,
  createPlanningArchiveContext,
  resolvePlanningCurrentUserV3Owners,
  type PlanningCurrentUserV3OwnerId,
  type ResolvedPlanningDataOwner,
} from "../../../src/lib/ops/backup/planningOwnerRegistry";
import { decodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { runWithPlanningUserScope } from "../../../src/lib/planning/store/userScope";

const ISO = "2026-08-25T00:00:00.000Z";
const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_USER_ID",
  "PLANNING_PROFILES_DIR",
  "PLANNING_RUNS_DIR",
  "PLANNING_PROFILE_PARTITIONS_DIR",
  "PLANNING_PROFILE_META_PATH",
  "PLANNING_BACKUP_SYNC_STATE_PATH",
  "PLANNING_STORAGE_JOURNAL_PATH",
] as const;
const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

type V3Fixture = Readonly<{
  ownerId: PlanningCurrentUserV3OwnerId;
  logicalPath: string;
  value: unknown;
}>;

function fixtures(): readonly V3Fixture[] {
  return [
    { ownerId: "v3.accounts", logicalPath: "accounts.json", value: { version: 2, items: [] } },
    { ownerId: "v3.accounts", logicalPath: "legacy/accounts.json", value: { version: 2, items: [] } },
    { ownerId: "v3.opening-balances", logicalPath: "opening-balances.json", value: { version: 1, items: {} } },
    { ownerId: "v3.batches", logicalPath: "batches/index.json", value: { version: 1, items: [] } },
    {
      ownerId: "v3.drafts",
      logicalPath: "drafts/draft-a.json",
      value: { id: "draft-a", createdAt: ISO, source: { kind: "csv" }, cashflow: [], draftPatch: {}, summary: {} },
    },
    { ownerId: "v3.category-rules", logicalPath: "category-rules.json", value: { version: 1, items: [] } },
    { ownerId: "v3.transaction-overrides", logicalPath: "txn-overrides/batch-a.json", value: { version: 1, items: {} } },
    { ownerId: "v3.transaction-overrides", logicalPath: "legacy/txn-overrides.json", value: { version: 1, items: {} } },
    {
      ownerId: "v3.news",
      logicalPath: "news/items/item-a.json",
      value: { id: "item-a", sourceId: "source-a", title: "title", url: "https://example.test/item-a", fetchedAt: ISO },
    },
    { ownerId: "v3.alerts", logicalPath: "alerts/rules.override.json", value: { schemaVersion: 1, rules: [] } },
    {
      ownerId: "v3.journal",
      logicalPath: "entries/entry-a.json",
      value: {
        id: "entry-a",
        date: "2026-08-25",
        observations: [],
        assumptions: [],
        chosenOptions: [],
        followUpChecklist: [],
        linkedItems: [],
        linkedIndicators: [],
        linkedScenarioIds: [],
        impactSnapshot: [],
        watchSeriesIds: [],
        createdAt: ISO,
        updatedAt: ISO,
      },
    },
    { ownerId: "v3.exposure", logicalPath: "profile.json", value: {} },
    {
      ownerId: "v3.csv-drafts",
      logicalPath: "drafts/draft-a.json",
      value: {
        id: "draft-a",
        createdAt: ISO,
        source: { kind: "csv" },
        meta: { rowsParsed: 0, columnsCount: 0, warningsCount: 0 },
        monthlyCashflow: [],
        draftPatch: { monthlyIncomeNet: 0, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0 },
      },
    },
    {
      ownerId: "v3.routines",
      logicalPath: "daily/2026-08-25.json",
      value: {
        schemaVersion: 1,
        date: "2026-08-25",
        items: [
          { id: "refresh_news", label: "뉴스 갱신", checked: false },
          { id: "check_burst_topics", label: "토픽 확인", checked: false },
          { id: "review_scenarios", label: "시나리오 확인", checked: false },
          { id: "check_watchlist_unknowns", label: "unknown 확인", checked: false },
          { id: "write_journal", label: "저널 기록", checked: false },
        ],
        savedAt: null,
      },
    },
    { ownerId: "v3.scenario-overrides", logicalPath: "overrides.json", value: { schemaVersion: 1, items: [] } },
  ];
}

function ownerFor(owners: readonly ResolvedPlanningDataOwner[], ownerId: string): ResolvedPlanningDataOwner {
  const owner = owners.find((entry) => entry.ownerId === ownerId);
  if (!owner) throw new Error(`owner missing: ${ownerId}`);
  return owner;
}

function targetFor(
  owners: readonly ResolvedPlanningDataOwner[],
  ownerId: PlanningCurrentUserV3OwnerId,
  logicalPath: string,
): string {
  const owner = ownerFor(owners, ownerId);
  const location = owner.locations.find((entry) => (
    entry.kind === "file"
      ? logicalPath === entry.logicalPath
      : logicalPath.startsWith(`${entry.logicalPath}/`)
  ));
  if (!location) throw new Error(`location missing: ${ownerId}:${logicalPath}`);
  return location.kind === "file"
    ? location.targetPath
    : path.join(location.targetPath, logicalPath.slice(location.logicalPath.length + 1));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe.sequential("planning data vault current-user v3 owner integration", () => {
  let root = "";
  let owners: readonly ResolvedPlanningDataOwner[] = [];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-vault-v3-user-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_SINGLE_USER_MODE = "0";
    env.PLANNING_USER_ID = "alice";
    delete env.PLANNING_PROFILES_DIR;
    delete env.PLANNING_RUNS_DIR;
    delete env.PLANNING_PROFILE_PARTITIONS_DIR;
    delete env.PLANNING_PROFILE_META_PATH;
    delete env.PLANNING_BACKUP_SYNC_STATE_PATH;
    delete env.PLANNING_STORAGE_JOURNAL_PATH;

    const context = createPlanningArchiveContext({ userId: "alice" });
    owners = resolvePlanningCurrentUserV3Owners(context);
    for (const fixture of fixtures()) {
      writeJson(targetFor(owners, fixture.ownerId, fixture.logicalPath), fixture.value);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (typeof value === "string") env[key] = value;
      else delete env[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function buildAliceVault() {
    return await runWithPlanningUserScope({ userId: "alice", authSource: "test" }, () => (
      buildPlanningDataVaultZip({
        mode: "full",
        scope: "user",
        userId: "alice",
        maxEntries: 500,
        maxBytes: 8 * 1024 * 1024,
      })
    ));
  }

  it("exports only the exact 13 current-user owners and excludes shared state", async () => {
    const exported = await buildAliceVault();
    const entries = await decodeZip(exported.bytes, {
      maxEntries: 500,
      maxTotalBytes: 8 * 1024 * 1024,
    });
    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      formatVersion?: number;
      scope?: string;
      userId?: string;
      counts?: { planningV3Owners?: number; planningV3Files?: number; assumptionsHistory?: number; policies?: number };
    };
    const v3Manifest = JSON.parse((entries.get("planning-v3/manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      archiveScope?: string;
      owners?: Array<{ ownerId?: string; namespace?: { mode?: string; userId?: string } }>;
    };

    expect(manifest).toMatchObject({
      formatVersion: 2,
      scope: "user",
      userId: "alice",
      counts: {
        planningV3Owners: 13,
        planningV3Files: fixtures().length,
        assumptionsHistory: 0,
        policies: 0,
      },
    });
    expect(v3Manifest.archiveScope).toBe("active-user-v3");
    expect(v3Manifest.owners?.map((owner) => owner.ownerId).sort())
      .toEqual([...PLANNING_CURRENT_USER_V3_OWNER_IDS].sort());
    expect(v3Manifest.owners?.every((owner) => (
      owner.namespace?.mode === "user" && owner.namespace.userId === "alice"
    ))).toBe(true);
    expect(entries.has("assumptions/latest.json")).toBe(false);
    expect([...entries.keys()].some((entryPath) => entryPath.includes("v3.indicators"))).toBe(false);
    expect([...entries.keys()].some((entryPath) => entryPath.includes("v3.legacy-transactions"))).toBe(false);
    expect([...entries.keys()].some((entryPath) => entryPath.includes("bob"))).toBe(false);
  });

  it("rejects a different user before restore and keeps merge non-destructive", async () => {
    const exported = await buildAliceVault();
    await expect(previewPlanningDataVaultZip(exported.bytes, {
      maxEntries: 500,
      maxBytes: 8 * 1024 * 1024,
      maxPreviewIds: 20,
      scope: "user",
      userId: "bob",
    })).rejects.toThrow("MANIFEST_USER_MISMATCH");

    const accountsPath = targetFor(owners, "v3.accounts", "accounts.json");
    writeJson(accountsPath, { version: 2, items: [{ id: "current-change" }] });
    const merged = await runWithPlanningUserScope({ userId: "alice" }, () => restorePlanningDataVaultZip(
      exported.bytes,
      {
        mode: "merge",
        maxEntries: 500,
        maxBytes: 8 * 1024 * 1024,
        scope: "user",
        userId: "alice",
      },
    ));

    expect(merged.committed).toBe(true);
    expect(merged.imported.planningV3Files).toBe(0);
    expect(merged.warnings).toContain(
      "Planning v3 데이터는 파일 단위 병합 시 현재 변경을 덮어쓸 수 있어 교체 복원에서만 반영합니다.",
    );
    expect(fs.readFileSync(accountsPath, "utf-8")).toContain("current-change");
  });

  it("replace restores canonical and legacy files, removes stale owned files, and preserves unrelated files", async () => {
    const exported = await buildAliceVault();
    const accountsPath = targetFor(owners, "v3.accounts", "accounts.json");
    const legacyAccountsPath = targetFor(owners, "v3.accounts", "legacy/accounts.json");
    const staleOwnedPath = path.join(ownerFor(owners, "v3.batches").locations[0].targetPath, "stale.json");
    const unrelatedPath = path.join(process.env.PLANNING_DATA_DIR as string, "users", "alice", "unowned", "keep.txt");
    writeJson(accountsPath, { version: 2, items: [{ id: "changed" }] });
    writeJson(legacyAccountsPath, { version: 2, items: [{ id: "changed-legacy" }] });
    writeJson(staleOwnedPath, { stale: true });
    fs.mkdirSync(path.dirname(unrelatedPath), { recursive: true });
    fs.writeFileSync(unrelatedPath, "keep", "utf-8");

    const restored = await runWithPlanningUserScope({ userId: "alice" }, () => restorePlanningDataVaultZip(
      exported.bytes,
      {
        mode: "replace",
        maxEntries: 500,
        maxBytes: 8 * 1024 * 1024,
        scope: "user",
        userId: "alice",
      },
    ));

    expect(restored.committed).toBe(true);
    expect(restored.imported.planningV3Files).toBe(fixtures().length);
    expect(fs.readFileSync(accountsPath, "utf-8")).not.toContain("changed");
    expect(fs.readFileSync(legacyAccountsPath, "utf-8")).not.toContain("changed-legacy");
    expect(fs.existsSync(staleOwnedPath)).toBe(false);
    expect(fs.readFileSync(unrelatedPath, "utf-8")).toBe("keep");
  });

  it("rolls back the stable and v3 target snapshot when a v3 write fails", async () => {
    const exported = await buildAliceVault();
    const accountsPath = targetFor(owners, "v3.accounts", "accounts.json");
    const staleOwnedPath = path.join(ownerFor(owners, "v3.batches").locations[0].targetPath, "stale.json");
    writeJson(accountsPath, { version: 2, items: [{ id: "keep-current" }] });
    writeJson(staleOwnedPath, { stale: true });

    const restored = await runWithPlanningUserScope({ userId: "alice" }, () => restorePlanningDataVaultZip(
      exported.bytes,
      {
        mode: "replace",
        maxEntries: 500,
        maxBytes: 8 * 1024 * 1024,
        scope: "user",
        userId: "alice",
        faultInjection: {
          beforeWrite(operation) {
            if (operation.path?.startsWith("planning-v3/")) throw new Error("v3 write failed");
          },
        },
      },
    ));

    expect(restored.committed).toBe(false);
    expect(fs.readFileSync(accountsPath, "utf-8")).toContain("keep-current");
    expect(fs.existsSync(staleOwnedPath)).toBe(true);
  });

  it("rejects a tampered pending journal before touching another user's target", async () => {
    const exported = await buildAliceVault();
    const backupDir = path.join(process.env.PLANNING_DATA_DIR as string, "users", "alice", "ops", "backup");
    const snapshotRoot = path.join(backupDir, "restore-snapshots", "tampered");
    const bobTarget = path.join(process.env.PLANNING_DATA_DIR as string, "users", "bob", "planning-v3", "accounts.json");
    writeJson(bobTarget, { version: 2, items: [{ id: "bob-current" }] });
    fs.mkdirSync(snapshotRoot, { recursive: true });
    writeJson(path.join(backupDir, "restore-replace-journal.json"), {
      version: 2,
      kind: "planning-data-vault-replace-restore-journal",
      createdAt: ISO,
      snapshotRoot,
      entries: [{
        targetPath: bobTarget,
        backupPath: path.join(snapshotRoot, "0"),
        existed: true,
      }],
    });

    await expect(runWithPlanningUserScope({ userId: "alice" }, () => restorePlanningDataVaultZip(
      exported.bytes,
      {
        mode: "replace",
        maxEntries: 500,
        maxBytes: 8 * 1024 * 1024,
        scope: "user",
        userId: "alice",
      },
    ))).rejects.toThrow("REPLACE_RESTORE_JOURNAL_INVALID:target");
    expect(fs.readFileSync(bobTarget, "utf-8")).toContain("bob-current");
  });
});
