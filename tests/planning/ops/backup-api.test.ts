import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as backupExportPOST } from "../../../src/app/api/ops/backup/export/route";
import { POST as backupPreviewPOST } from "../../../src/app/api/ops/backup/preview/route";
import { POST as backupRestorePOST } from "../../../src/app/api/ops/backup/restore/route";
import { decodeZip, encodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { decryptPlanningDataVaultArchive, encryptPlanningDataVaultArchive } from "../../../src/lib/ops/backup/planningDataVault";
import { createProfile, listProfiles } from "../../../src/lib/planning/store/profileStore";
import { createRun, getRun, listRuns } from "../../../src/lib/planning/store/runStore";
import { resolveRunDir } from "../../../src/lib/planning/store/paths";
import {
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
  saveAssumptionsSnapshotToHistory,
  saveLatestAssumptionsSnapshot,
} from "../../../src/lib/planning/assumptions/storage";
import { configureVaultPassphrase, lockVault, resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;
const originalProfileMetaPath = process.env.PLANNING_PROFILE_META_PATH;
const originalBackupSyncStatePath = process.env.PLANNING_BACKUP_SYNC_STATE_PATH;
const originalStorageJournalPath = process.env.PLANNING_STORAGE_JOURNAL_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

function profileFixture() {
  return {
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_900_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

async function createRunFixture(id: string, title = "backup run"): Promise<void> {
  await createRun({
    id,
    profileId: "backup_profile",
    title,
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-03-01",
        fetchedAt: "2026-03-01T00:00:00.000Z",
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {},
  }, { enforceRetention: false });
}

async function createLargeRunFixture(id: string, sizeBytes: number): Promise<void> {
  const payload = "X".repeat(Math.max(1024, sizeBytes));
  await createRun({
    id,
    profileId: "backup_profile",
    title: "large blob run",
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-03-01",
        fetchedAt: "2026-03-01T00:00:00.000Z",
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {
      simulate: {
        summary: {
          note: payload,
        },
      },
    } as unknown as Parameters<typeof createRun>[0]["outputs"],
  }, { enforceRetention: false, storeRawOutputs: true });
}

function buildCookie(csrf = "csrf-token"): string {
  return `planning_vault_csrf=${csrf}`;
}

function localHeaders(csrf = "csrf-token", host = LOCAL_HOST, extra?: HeadersInit): HeadersInit {
  const origin = `http://${host}`;
  return {
    host,
    origin,
    referer: `${origin}/ops/backup`,
    cookie: buildCookie(csrf),
    ...(extra ?? {}),
  };
}

function hashSha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function makeRestoreZip(): Buffer {
  const validProfile = {
    version: 1,
    schemaVersion: 2,
    id: "imported-profile",
    name: "imported profile",
    profile: profileFixture(),
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const files = new Map<string, Buffer>();
  files.set("profiles/imported-profile.json", Buffer.from(`${JSON.stringify(validProfile, null, 2)}\n`, "utf-8"));
  files.set("profiles/broken-profile.json", Buffer.from("{ broken-json", "utf-8"));

  const manifest = {
    kind: "planning-data-vault",
    formatVersion: 1,
    createdAt: "2026-03-01T00:00:00.000Z",
    appVersion: "1.0.1",
    schemaVersions: {
      profile: 2,
      run: 2,
      assumptions: 2,
    },
    counts: {
      profiles: 2,
      runs: 0,
      runBlobs: 0,
      actionPlans: 0,
      actionProgress: 0,
      assumptionsHistory: 0,
      policies: 0,
    },
    files: Object.fromEntries(
      [...files.entries()].map(([filePath, bytes]) => [filePath, {
        sizeBytes: bytes.length,
        sha256: hashSha256(bytes),
      }]),
    ),
  };

  const zipEntries = [
    ...[...files.entries()].map(([filePath, bytes]) => ({
      path: filePath,
      bytes,
    })),
    {
      path: "manifest.json",
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"),
    },
  ];
  return encodeZip(zipEntries);
}

function makeRestoreZipWithAprDecimalProfile(): Buffer {
  const profileWithLegacyApr = {
    version: 1,
    schemaVersion: 2,
    id: "normalize-profile",
    name: "normalize profile",
    profile: {
      ...profileFixture(),
      debts: [
        {
          id: "loan-1",
          name: "legacy debt",
          balance: 12_000_000,
          aprPct: 0.048,
          minimumPayment: 320_000,
          remainingMonths: 48,
          repaymentType: "amortizing",
        },
      ],
    },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const bytes = Buffer.from(`${JSON.stringify(profileWithLegacyApr, null, 2)}\n`, "utf-8");
  const entries = new Map<string, Buffer>();
  entries.set("profiles/normalize-profile.json", bytes);

  const manifest = {
    kind: "planning-data-vault",
    formatVersion: 1,
    createdAt: "2026-03-01T00:00:00.000Z",
    appVersion: "1.0.1",
    schemaVersions: {
      profile: 2,
      run: 2,
      assumptions: 2,
    },
    counts: {
      profiles: 1,
      runs: 0,
      runBlobs: 0,
      actionPlans: 0,
      actionProgress: 0,
      assumptionsHistory: 0,
      policies: 0,
    },
    files: {
      "profiles/normalize-profile.json": {
        sizeBytes: bytes.length,
        sha256: hashSha256(bytes),
      },
    },
  };

  return encodeZip([
    { path: "profiles/normalize-profile.json", bytes },
    {
      path: "manifest.json",
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"),
    },
  ]);
}

function makeRunRecordFixture(id: string, title: string, profileId = "backup_profile"): Record<string, unknown> {
  return {
    version: 1,
    schemaVersion: 2,
    id,
    profileId,
    title,
    createdAt: "2026-03-02T00:00:00.000Z",
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-03-01",
        fetchedAt: "2026-03-01T00:00:00.000Z",
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {},
  };
}

function makeDeltaZipWithEntries(entries: Map<string, Buffer>): Buffer {
  const manifest = {
    kind: "planning-data-vault",
    formatVersion: 1,
    mode: "delta",
    createdAt: "2026-03-02T00:00:00.000Z",
    appVersion: "1.0.1",
    conflictPolicy: {
      runId: "skip",
      snapshotId: "skip",
    },
    schemaVersions: {
      profile: 2,
      run: 2,
      assumptions: 2,
    },
    counts: {
      profiles: [...entries.keys()].filter((entry) => entry.startsWith("profiles/")).length,
      runs: [...entries.keys()].filter((entry) => /\/run\.json$/u.test(entry)).length,
      runBlobs: [...entries.keys()].filter((entry) => /\/blobs\/.+\.json$/u.test(entry)).length,
      actionPlans: [...entries.keys()].filter((entry) => /\/action-plan\.json$/u.test(entry)).length,
      actionProgress: [...entries.keys()].filter((entry) => /\/action-progress\.json$/u.test(entry)).length,
      assumptionsHistory: [...entries.keys()].filter((entry) => entry.startsWith("assumptions/history/")).length,
      policies: [...entries.keys()].filter((entry) => entry.startsWith("policies/")).length,
    },
    files: Object.fromEntries(
      [...entries.entries()].map(([filePath, bytes]) => [filePath, {
        sizeBytes: bytes.length,
        sha256: hashSha256(bytes),
      }]),
    ),
  };
  return encodeZip([
    ...[...entries.entries()].map(([filePath, bytes]) => ({ path: filePath, bytes })),
    {
      path: "manifest.json",
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"),
    },
  ]);
}

describe.sequential("ops backup API", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-backup-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions", "history");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    env.PLANNING_PROFILE_META_PATH = path.join(root, "vault", "profiles.meta.json");
    env.PLANNING_BACKUP_SYNC_STATE_PATH = path.join(root, "ops", "backup", "sync-state.json");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, "storage", "journal.ndjson");
    await resetVaultRuntimeForTests();

    await createProfile({
      name: "backup profile",
      profile: profileFixture(),
    });

    await createRunFixture("backup-run-1", "backup run");

    const runDir = resolveRunDir("backup-run-1");
    await fs.promises.mkdir(runDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(runDir, "action-plan.json"),
      `${JSON.stringify({
        version: 1,
        runId: "backup-run-1",
        generatedAt: "2026-03-01T00:00:00.000Z",
        items: [
          {
            actionKey: "act_1",
            title: "테스트 액션",
            description: "테스트 설명",
            steps: ["step-1"],
          },
        ],
      }, null, 2)}\n`,
      "utf-8",
    );
    await fs.promises.writeFile(
      path.join(runDir, "action-progress.json"),
      `${JSON.stringify({
        version: 1,
        runId: "backup-run-1",
        updatedAt: "2026-03-01T00:00:00.000Z",
        items: [
          {
            actionKey: "act_1",
            status: "todo",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        ],
      }, null, 2)}\n`,
      "utf-8",
    );

    const snapshot = {
      version: 1 as const,
      schemaVersion: 2 as const,
      asOf: "2026-03-01",
      fetchedAt: "2026-03-01T00:00:00.000Z",
      korea: {
        baseRatePct: 3.5,
      },
      sources: [
        {
          name: "ecos",
          url: "https://ecos.bok.or.kr",
          fetchedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      warnings: [],
    };
    await saveLatestAssumptionsSnapshot(snapshot);
    await saveAssumptionsSnapshotToHistory(snapshot);
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;
    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;
    if (typeof originalProfileMetaPath === "string") env.PLANNING_PROFILE_META_PATH = originalProfileMetaPath;
    else delete env.PLANNING_PROFILE_META_PATH;
    if (typeof originalBackupSyncStatePath === "string") env.PLANNING_BACKUP_SYNC_STATE_PATH = originalBackupSyncStatePath;
    else delete env.PLANNING_BACKUP_SYNC_STATE_PATH;
    if (typeof originalStorageJournalPath === "string") env.PLANNING_STORAGE_JOURNAL_PATH = originalStorageJournalPath;
    else delete env.PLANNING_STORAGE_JOURNAL_PATH;
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("exports encrypted backup and excludes secret file patterns", async () => {
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
      }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/octet-stream");

    const encryptedBytes = Buffer.from(await response.arrayBuffer());
    const encryptedText = encryptedBytes.toString("utf-8");
    expect(encryptedText.includes("\"kind\": \"planning-data-vault-encrypted\"")).toBe(true);
    expect(encryptedText.includes("ECOS_API_KEY=")).toBe(false);
    expect(encryptedText.includes("GITHUB_TOKEN=")).toBe(false);

    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });

    expect(entries.has("manifest.json")).toBe(true);
    expect([...entries.keys()].some((entry) => entry.includes(".env"))).toBe(false);

    const merged = Buffer.concat([...entries.values()]).toString("utf-8");
    expect(merged.includes("ECOS_API_KEY=")).toBe(false);
    expect(merged.includes("GITHUB_TOKEN=")).toBe(false);
  });

  it("supports streamed+gzipped export for large synthetic blobs", async () => {
    await createLargeRunFixture("backup-run-large", 6 * 1024 * 1024);
    const heapBefore = process.memoryUsage().heapUsed;
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders("csrf-token", LOCAL_HOST, { "accept-encoding": "gzip" }),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        gzip: true,
      }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-transfer-mode")).toBe("stream");
    expect(response.headers.get("content-encoding")).toBe("gzip");

    const gzippedBytes = Buffer.from(await response.arrayBuffer());
    const decryptedEnvelopeBytes = gunzipSync(gzippedBytes);
    const encryptedText = decryptedEnvelopeBytes.toString("utf-8");
    expect(encryptedText.includes("\"kind\": \"planning-data-vault-encrypted\"")).toBe(true);

    const heapAfter = process.memoryUsage().heapUsed;
    const heapDelta = heapAfter - heapBefore;
    expect(heapDelta).toBeLessThan(256 * 1024 * 1024);
  }, 20_000);

  it("handles import preview for large synthetic backup blobs without excessive heap growth", async () => {
    await createLargeRunFixture("backup-run-large-preview", 5 * 1024 * 1024);
    const exportRes = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
      }),
    }));
    expect(exportRes.status).toBe(200);
    const encryptedBytes = Buffer.from(await exportRes.arrayBuffer());

    const heapBefore = process.memoryUsage().heapUsed;
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("file", new File([new Uint8Array(encryptedBytes)], "large.enc.json", { type: "application/json" }));
    const previewRes = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const previewPayload = await previewRes.json() as { ok?: boolean };
    expect(previewRes.status).toBe(200);
    expect(previewPayload.ok).toBe(true);
    const heapAfter = process.memoryUsage().heapUsed;
    expect(heapAfter - heapBefore).toBeLessThan(256 * 1024 * 1024);
  }, 20_000);

  it("rejects preview for invalid encrypted backup", async () => {
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("file", new File([new Uint8Array(Buffer.from("not-a-zip", "utf-8"))], "broken.enc.json", { type: "application/json" }));

    const response = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as { error?: { code?: string; fixHref?: string } };
    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe("BACKUP_INVALID");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("returns LOCKED(423) when vault is configured but currently locked", async () => {
    await configureVaultPassphrase({
      passphrase: "vault-passphrase",
      autoLockMinutes: 30,
    });
    await lockVault();

    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
      }),
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(423);
    expect(payload.error?.code).toBe("LOCKED");
    expect(payload.error?.fixHref).toBe("/ops/security");
  });

  it("restores in merge mode and collects per-item errors", async () => {
    await createProfile({
      name: "existing profile",
      profile: profileFixture(),
    });
    const zip = makeRestoreZip();
    const encrypted = await encryptPlanningDataVaultArchive(zip, "backup-passphrase");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        imported?: { profiles?: number };
        issues?: Array<{ entity?: string; path?: string }>;
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect((payload.data?.imported?.profiles ?? 0)).toBeGreaterThanOrEqual(1);
    expect((payload.data?.issues ?? []).length).toBeGreaterThanOrEqual(1);
    expect((payload.data?.issues ?? []).some((issue) => issue.entity === "profile" && issue.path?.includes("broken-profile.json"))).toBe(true);

    const profiles = await listProfiles();
    expect(profiles.some((profile) => profile.id === "imported-profile")).toBe(true);
    expect(profiles.length).toBeGreaterThanOrEqual(2);
  });

  it("returns normalization disclosures for restored profiles", async () => {
    const zip = makeRestoreZipWithAprDecimalProfile();
    const encrypted = await encryptPlanningDataVaultArchive(zip, "backup-passphrase");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        normalization?: {
          profiles?: Array<{
            id?: string;
            disclosure?: {
              fixesApplied?: Array<{ path?: string; from?: unknown; to?: unknown }>;
            };
          }>;
        };
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    const target = (payload.data?.normalization?.profiles ?? []).find((entry) => entry.id === "normalize-profile");
    expect(target).toBeDefined();
    const aprFix = (target?.disclosure?.fixesApplied ?? []).find((fix) => fix.path === "/debts/0/aprPct");
    expect(aprFix).toBeDefined();
    expect(Number(aprFix?.from)).toBeCloseTo(0.048, 8);
    expect(Number(aprFix?.to)).toBeCloseTo(4.8, 8);
  });

  it("exports delta backup with only changed run and updates sync state", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as { lastExportAt?: string; lastJournalOffset?: number };
    expect(typeof firstState.lastExportAt).toBe("string");
    expect(typeof firstState.lastJournalOffset).toBe("number");

    await createRunFixture("backup-run-2", "delta run");

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const encryptedBytes = Buffer.from(await deltaResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    const runPaths = [...entries.keys()].filter((entry) => /^runs\/[^/]+\/run\.json$/u.test(entry));
    expect(runPaths).toEqual(["runs/backup-run-2/run.json"]);

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      mode?: string;
      counts?: { runs?: number };
    };
    expect(manifest.mode).toBe("delta");
    expect(manifest.counts?.runs).toBe(1);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as { lastExportAt?: string; lastJournalOffset?: number };
    expect(typeof secondState.lastExportAt).toBe("string");
    expect((secondState.lastJournalOffset ?? 0)).toBeGreaterThanOrEqual(firstState.lastJournalOffset ?? 0);
    expect(Date.parse(secondState.lastExportAt ?? "") >= Date.parse(firstState.lastExportAt ?? "")).toBe(true);
  });

  it("restores delta with deterministic conflict policy(skip) and keeps unrelated data", async () => {
    await createRunFixture("conflict-run", "existing conflict");
    await createRunFixture("unrelated-run", "existing unrelated");

    const history = await listAssumptionsHistory(10);
    const conflictSnapshotId = history[0]?.id ?? "";
    const conflictSnapshot = conflictSnapshotId
      ? await loadAssumptionsSnapshotById(conflictSnapshotId)
      : null;

    const deltaEntries = new Map<string, Buffer>();
    deltaEntries.set(
      "runs/conflict-run/run.json",
      Buffer.from(`${JSON.stringify(makeRunRecordFixture("conflict-run", "incoming conflict"), null, 2)}\n`, "utf-8"),
    );
    deltaEntries.set(
      "runs/delta-new-run/run.json",
      Buffer.from(`${JSON.stringify(makeRunRecordFixture("delta-new-run", "delta imported"), null, 2)}\n`, "utf-8"),
    );
    if (conflictSnapshotId && conflictSnapshot) {
      deltaEntries.set(
        `assumptions/history/${conflictSnapshotId}.json`,
        Buffer.from(`${JSON.stringify(conflictSnapshot, null, 2)}\n`, "utf-8"),
      );
    }

    const deltaZip = makeDeltaZipWithEntries(deltaEntries);
    const encrypted = await encryptPlanningDataVaultArchive(deltaZip, "backup-passphrase");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("file", new File([new Uint8Array(encrypted)], "delta.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        imported?: { runs?: number };
        warnings?: string[];
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.imported?.runs).toBe(1);
    expect((payload.data?.warnings ?? []).some((row) => row.includes("delta conflict skipped: run conflict-run"))).toBe(true);
    if (conflictSnapshotId) {
      expect((payload.data?.warnings ?? []).some((row) => row.includes(`delta conflict skipped: snapshot ${conflictSnapshotId}`))).toBe(true);
    }

    const conflictRun = await getRun("conflict-run");
    const importedRun = await getRun("delta-new-run");
    const unrelatedRun = await getRun("unrelated-run");
    expect(conflictRun?.title).toBe("existing conflict");
    expect(importedRun?.title).toBe("delta imported");
    expect(unrelatedRun?.title).toBe("existing unrelated");

    const allRuns = await listRuns({ profileId: "backup_profile", limit: 50 });
    expect(allRuns.some((row) => row.id === "delta-new-run")).toBe(true);
    expect(allRuns.some((row) => row.id === "unrelated-run")).toBe(true);
  });

  it("restores profile-partitioned runs without cross-profile leakage", async () => {
    const profileA = {
      version: 1,
      schemaVersion: 2,
      id: "restored-profile-a",
      name: "restored A",
      profile: profileFixture(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };
    const profileB = {
      version: 1,
      schemaVersion: 2,
      id: "restored-profile-b",
      name: "restored B",
      profile: profileFixture(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    const deltaEntries = new Map<string, Buffer>();
    deltaEntries.set("profiles/restored-profile-a.json", Buffer.from(`${JSON.stringify(profileA, null, 2)}\n`, "utf-8"));
    deltaEntries.set("profiles/restored-profile-b.json", Buffer.from(`${JSON.stringify(profileB, null, 2)}\n`, "utf-8"));
    deltaEntries.set(
      "runs/restored-run-a/run.json",
      Buffer.from(`${JSON.stringify(makeRunRecordFixture("restored-run-a", "run A", "restored-profile-a"), null, 2)}\n`, "utf-8"),
    );
    deltaEntries.set(
      "runs/restored-run-b/run.json",
      Buffer.from(`${JSON.stringify(makeRunRecordFixture("restored-run-b", "run B", "restored-profile-b"), null, 2)}\n`, "utf-8"),
    );

    const deltaZip = makeDeltaZipWithEntries(deltaEntries);
    const encrypted = await encryptPlanningDataVaultArchive(deltaZip, "backup-passphrase");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("file", new File([new Uint8Array(encrypted)], "partitioned.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        imported?: { runs?: number; profiles?: number };
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.imported?.runs).toBe(2);
    expect((payload.data?.imported?.profiles ?? 0)).toBeGreaterThanOrEqual(2);

    const runsA = await listRuns({ profileId: "restored-profile-a", limit: 20 });
    const runsB = await listRuns({ profileId: "restored-profile-b", limit: 20 });
    expect(runsA.some((row) => row.id === "restored-run-a")).toBe(true);
    expect(runsA.some((row) => row.id === "restored-run-b")).toBe(false);
    expect(runsB.some((row) => row.id === "restored-run-b")).toBe(true);
    expect(runsB.some((row) => row.id === "restored-run-a")).toBe(false);
  });

  it("enforces csrf and local-only guards", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const missingCsrfForm = new FormData();
    missingCsrfForm.set("mode", "merge");
    missingCsrfForm.set("passphrase", "backup-passphrase");
    missingCsrfForm.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const csrfMissingResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: missingCsrfForm,
    }));
    const csrfMissingPayload = await csrfMissingResponse.json() as { error?: { code?: string } };
    expect(csrfMissingResponse.status).toBe(403);
    expect(csrfMissingPayload.error?.code).toBe("CSRF");

    const remoteResponse = await backupPreviewPOST(new Request(`${REMOTE_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders("csrf-token", REMOTE_HOST),
      body: (() => {
        const form = new FormData();
        form.set("csrf", "csrf-token");
        form.set("passphrase", "backup-passphrase");
        form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));
        return form;
      })(),
    }));
    const remotePayload = await remoteResponse.json() as { error?: { code?: string } };
    expect(remoteResponse.status).toBe(403);
    expect(remotePayload.error?.code).toBe("LOCAL_ONLY");
  });
});
