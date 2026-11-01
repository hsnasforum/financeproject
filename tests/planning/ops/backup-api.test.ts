import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as backupExportPOST } from "../../../src/app/api/ops/backup/export/route";
import { POST as backupExportFinalizePOST } from "../../../src/app/api/ops/backup/export/finalize/route";
import { POST as settingsBackupExportFinalizePOST } from "../../../src/app/api/settings/backup/export/finalize/route";
import { POST as backupPreviewPOST } from "../../../src/app/api/ops/backup/preview/route";
import { POST as backupRestorePOST } from "../../../src/app/api/ops/backup/restore/route";
import { decodeZip, encodeZip } from "../../../src/lib/ops/backup/zipCodec";
import {
  buildPlanningDataVaultZip,
  decryptPlanningDataVaultArchive,
  encryptPlanningDataVaultArchive,
  previewPlanningDataVaultZip,
  restorePlanningDataVaultZip,
} from "../../../src/lib/ops/backup/planningDataVault";
import {
  createProfile,
  getDefaultProfileId,
  getProfile,
  hardDeleteProfile,
  listProfiles,
  setDefaultProfile,
  upsertProfileRecord,
} from "../../../src/lib/planning/store/profileStore";
import { createRun, getRun, listRuns } from "../../../src/lib/planning/store/runStore";
import { resolveProfileRunDir, resolveRunDir } from "../../../src/lib/planning/store/paths";
import { runWithPlanningUserScope } from "../../../src/lib/planning/store/userScope";
import {
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
  saveAssumptionsSnapshotToHistory,
  saveLatestAssumptionsSnapshot,
} from "../../../src/lib/planning/assumptions/storage";
import {
  __BACKUP_PREVIEW_TOKEN_TTL_MS_FOR_TESTS,
  createBackupPreviewToken,
  resetBackupPreviewTokensForTests,
} from "../../../src/lib/ops/backup/previewToken";
import {
  __BACKUP_EXPORT_RECEIPT_TTL_MS_FOR_TESTS,
  finalizeBackupExportReceipt,
  resetBackupExportReceiptsForTests,
} from "../../../src/lib/ops/backup/backupExportReceipt";
import { listOpsAuditEvents } from "../../../src/lib/ops/securityAuditLog";
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
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;
const originalPlanningTrustAuthHeaders = process.env.PLANNING_TRUST_AUTH_HEADERS;
const originalPlanningNamespaceEnabled = process.env.PLANNING_NAMESPACE_ENABLED;
const originalPlanningUserId = process.env.PLANNING_USER_ID;
const originalOpsAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const BACKUP_PREVIEW_SESSION_COOKIE = "planning_backup_preview_session";
const LEGACY_STORAGE_V3_WARNING = "이 백업에는 상세 계좌·거래·분류(Planning v3) 데이터가 포함되어 있지 않습니다. 사용자별 저장을 쓰지 않는 실행 방식에서 만든 백업이라 복원해도 상세 데이터는 바뀌지 않습니다.";
const VAULT_TEST_LIMITS = { maxEntries: 500, maxBytes: 8 * 1024 * 1024 };
const SAVED_PROFILE_ID = "default-profile";
const SORTED_FIRST_PROFILE_ID = "090693ad-e176-4bd6-9e1e-645558fe60bc";
const SAVED_PROFILE_LIQUID_ASSETS = 20_000_000;

let backupPreviewSessionCookie = "";

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

async function createRunFixture(id: string, title = "backup run", options?: { createdAt?: string }): Promise<void> {
  await createRun({
    id,
    profileId: "backup_profile",
    title,
    ...(options?.createdAt ? { createdAt: options.createdAt } : {}),
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

// Replaces the fixture profile with two profiles. The older one is default and sorts last by path.
async function seedTwoProfilesWithSortedLastDefault(): Promise<void> {
  const fixtureProfiles = await listProfiles();
  await upsertProfileRecord({
    id: SAVED_PROFILE_ID,
    name: "saved profile",
    profile: { ...profileFixture(), liquidAssets: SAVED_PROFILE_LIQUID_ASSETS },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  });
  await upsertProfileRecord({
    id: SORTED_FIRST_PROFILE_ID,
    name: "draft profile",
    profile: profileFixture(),
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
  });
  for (const row of fixtureProfiles) await hardDeleteProfile(row.id);
  await setDefaultProfile(SAVED_PROFILE_ID);
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

function buildCookie(csrf = "csrf-token", backupSessionCookie = backupPreviewSessionCookie): string {
  return [`planning_vault_csrf=${csrf}`, backupSessionCookie].filter(Boolean).join("; ");
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

function localJsonHeaders(csrf = "csrf-token", host = LOCAL_HOST, extra?: Record<string, string>): HeadersInit {
  return localHeaders(csrf, host, {
    "content-type": "application/json",
    ...(extra ?? {}),
  });
}

function captureBackupPreviewSessionCookie(response: Response): void {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const sessionMatch = new RegExp(`${BACKUP_PREVIEW_SESSION_COOKIE}=([^;,]+)`, "u").exec(setCookie);
  backupPreviewSessionCookie = sessionMatch ? `${BACKUP_PREVIEW_SESSION_COOKIE}=${sessionMatch[1]}` : backupPreviewSessionCookie;
}

function hashSha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function previewReceiptStorePath(): string {
  return path.join(env.PLANNING_DATA_DIR as string, "ops", "backup", "preview-receipts.json");
}

function exportReceiptStorePath(): string {
  return path.join(env.PLANNING_DATA_DIR as string, "ops", "backup", "export-receipts.json");
}

function exportReceiptFrom(response: Response): string {
  const receipt = response.headers.get("x-planning-backup-export-receipt")?.trim() ?? "";
  expect(receipt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  return receipt;
}

async function finalizeOpsExport(
  receipt: string,
  options?: { csrf?: string; extraHeaders?: HeadersInit },
): Promise<Response> {
  const csrf = options?.csrf ?? "csrf-token";
  return backupExportFinalizePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export/finalize`, {
    method: "POST",
    headers: localHeaders(csrf, LOCAL_HOST, {
      "content-type": "application/json",
      ...(options?.extraHeaders ?? {}),
    }),
    body: JSON.stringify({ csrf, receipt }),
  }));
}

async function consumeAndFinalizeOpsExport(response: Response): Promise<void> {
  const receipt = exportReceiptFrom(response);
  await response.arrayBuffer();
  const finalized = await finalizeOpsExport(receipt);
  expect(finalized.status).toBe(200);
}

function expectNoRawBackupErrorMessage(message: string | undefined): void {
  expect(message).toBe(
    "선택한 파일은 이 앱에서 만든 암호화 백업 파일이 아니거나 파일이 손상되었습니다. 다시 내보낸 백업 파일을 선택해 주세요.",
  );
  expect(message).not.toMatch(/INVALID_|MANIFEST_|ZIP_|ENCRYPTED_PACKAGE_/u);
}

async function previewTokenForEncryptedBackup(
  encrypted: Uint8Array | Buffer,
  fileName = "restore.enc.json",
  options?: { csrf?: string; passphrase?: string },
): Promise<string> {
  const csrf = options?.csrf ?? "csrf-token";
  const passphrase = options?.passphrase ?? "backup-passphrase";
  const form = new FormData();
  form.set("csrf", csrf);
  form.set("passphrase", passphrase);
  form.set("file", new File([new Uint8Array(encrypted)], fileName, { type: "application/json" }));

  const response = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
    method: "POST",
    headers: localHeaders(csrf),
    body: form,
  }));
  const payload = await response.json() as { ok?: boolean; previewToken?: string };
  expect(response.status).toBe(200);
  expect(payload.ok).toBe(true);
  expect(payload.previewToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  captureBackupPreviewSessionCookie(response);
  return payload.previewToken ?? "";
}

async function keepOnlyJournalTransactionsForRun(runId: string): Promise<number> {
  const journalPath = env.PLANNING_STORAGE_JOURNAL_PATH as string;
  const raw = await fs.promises.readFile(journalPath, "utf-8");
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const parsed = lines.map((line) => JSON.parse(line) as { txId?: unknown; payload?: { runId?: unknown } });
  const targetTxIds = new Set(parsed
    .filter((event) => event.payload?.runId === runId)
    .map((event) => typeof event.txId === "string" ? event.txId : "")
    .filter((txId) => txId.length > 0));
  const kept = lines.filter((line, index) => {
    const txId = parsed[index]?.txId;
    return typeof txId === "string" && targetTxIds.has(txId);
  });
  expect(kept.length).toBeGreaterThan(0);
  await fs.promises.writeFile(journalPath, `${kept.join("\n")}\n`, "utf-8");
  return kept.length;
}

async function appendRunCreateJournalTransaction(
  runId: string,
  outcome: "COMMIT" | "ROLLBACK",
  at: string,
): Promise<void> {
  const journalPath = env.PLANNING_STORAGE_JOURNAL_PATH as string;
  const txId = `tx_test_${runId}_${outcome.toLowerCase()}`;
  const lines = [
    {
      version: 1,
      event: "BEGIN",
      txId,
      kind: "RUN_CREATE",
      at,
      payload: { runId },
    },
    {
      version: 1,
      event: "STEP",
      txId,
      kind: "RUN_CREATE",
      at,
      step: "WRITE_META",
      payload: { runId },
    },
    {
      version: 1,
      event: outcome,
      txId,
      kind: "RUN_CREATE",
      at,
      note: "test transaction boundary",
    },
  ].map((event) => JSON.stringify(event));
  await fs.promises.appendFile(journalPath, `${lines.join("\n")}\n`, "utf-8");
}

async function withBlockedReceiptStoreDir<T>(fn: () => Promise<T>): Promise<T> {
  const blockerPath = path.join(env.PLANNING_DATA_DIR as string, "ops", "backup");
  await fs.promises.rm(blockerPath, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(blockerPath), { recursive: true });
  await fs.promises.writeFile(blockerPath, "not-a-directory", "utf-8");
  try {
    return await fn();
  } finally {
    await fs.promises.rm(blockerPath, { recursive: true, force: true });
  }
}

async function withMalformedReceiptLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = `${previewReceiptStorePath()}.lock`;
  await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.promises.writeFile(lockPath, "{ broken-lock", "utf-8");
  try {
    return await fn();
  } finally {
    await fs.promises.rm(lockPath, { force: true });
  }
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

type ManifestIntegrityMutation = "missing" | "hash" | "size" | "unexpected";

async function makeManifestIntegrityMismatchZip(mutation: ManifestIntegrityMutation): Promise<{
  path: string;
  zip: Buffer;
}> {
  const entries = await decodeZip(makeRestoreZipWithAprDecimalProfile(), {
    maxEntries: 50,
    maxTotalBytes: 1024 * 1024,
  });
  const profilePath = "profiles/normalize-profile.json";
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) throw new Error("test manifest missing");
  const manifest = JSON.parse(manifestBytes.toString("utf-8")) as {
    files: Record<string, { sha256: string; sizeBytes: number }>;
  };
  let affectedPath = profilePath;

  if (mutation === "missing") {
    entries.delete(profilePath);
  } else if (mutation === "hash") {
    manifest.files[profilePath].sha256 = "0".repeat(64);
  } else if (mutation === "size") {
    manifest.files[profilePath].sizeBytes += 1;
  } else {
    affectedPath = "profiles/unexpected-profile.json";
    entries.set(affectedPath, Buffer.from("{}\n", "utf-8"));
  }

  entries.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"));
  return {
    path: affectedPath,
    zip: encodeZip([...entries.entries()].map(([entryPath, bytes]) => ({ path: entryPath, bytes }))),
  };
}

describe.sequential("ops backup API", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-backup-api-"));
    backupPreviewSessionCookie = "";
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "assumptions", "history");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    env.PLANNING_PROFILE_META_PATH = path.join(root, "vault", "profiles.meta.json");
    env.PLANNING_BACKUP_SYNC_STATE_PATH = path.join(root, "ops", "backup", "sync-state.json");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, "storage", "journal.ndjson");
    env.PLANNING_DATA_DIR = path.join(root, "planning-data");
    env.PLANNING_AUTH_REQUIRED = "0";
    delete env.PLANNING_TRUST_AUTH_HEADERS;
    delete env.PLANNING_NAMESPACE_ENABLED;
    delete env.PLANNING_USER_ID;
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");
    await resetVaultRuntimeForTests();
    await resetBackupPreviewTokensForTests();
    await resetBackupExportReceiptsForTests();

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
    await resetVaultRuntimeForTests();
    await resetBackupPreviewTokensForTests();
    await resetBackupExportReceiptsForTests();
    backupPreviewSessionCookie = "";
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
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    if (typeof originalPlanningAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
    if (typeof originalPlanningTrustAuthHeaders === "string") env.PLANNING_TRUST_AUTH_HEADERS = originalPlanningTrustAuthHeaders;
    else delete env.PLANNING_TRUST_AUTH_HEADERS;
    if (typeof originalPlanningNamespaceEnabled === "string") env.PLANNING_NAMESPACE_ENABLED = originalPlanningNamespaceEnabled;
    else delete env.PLANNING_NAMESPACE_ENABLED;
    if (typeof originalPlanningUserId === "string") env.PLANNING_USER_ID = originalPlanningUserId;
    else delete env.PLANNING_USER_ID;
    if (typeof originalOpsAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalOpsAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps replace restore transaction helpers outside the vault orchestration module", () => {
    const vaultPath = path.join(process.cwd(), "src/lib/ops/backup/planningDataVault.ts");
    const transactionPath = path.join(process.cwd(), "src/lib/ops/backup/replaceRestoreTransaction.ts");
    const vaultSource = fs.readFileSync(vaultPath, "utf-8");
    const transactionSource = fs.readFileSync(transactionPath, "utf-8");

    expect(transactionSource).toContain("export async function createReplaceRestoreSnapshot");
    expect(transactionSource).toContain("export async function rollbackReplaceRestoreSnapshot");
    expect(transactionSource).toContain("export async function recoverPendingReplaceRestoreSnapshot");
    expect(vaultSource).toContain("from \"./replaceRestoreTransaction\"");
    expect(vaultSource).not.toContain("async function createReplaceRestoreSnapshot");
    expect(vaultSource).not.toContain("async function rollbackReplaceRestoreSnapshot");
    expect(vaultSource).not.toContain("async function readPendingReplaceRestoreSnapshot");
  });

  it("exports encrypted backup and excludes secret file patterns", async () => {
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
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

  it("keeps the delta checkpoint unchanged until a saved file is explicitly finalized", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    exportReceiptFrom(fullResponse);
    await fullResponse.arrayBuffer();

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    await expect(fs.promises.stat(syncStatePath)).rejects.toMatchObject({ code: "ENOENT" });
    const pendingStore = JSON.parse(await fs.promises.readFile(exportReceiptStorePath(), "utf-8")) as {
      receipts?: Record<string, { status?: string }>;
      version?: number;
    };
    expect(pendingStore.version).toBe(1);
    expect(Object.values(pendingStore.receipts ?? {})).toHaveLength(1);
    expect(Object.values(pendingStore.receipts ?? {})[0]?.status).toBe("pending");

    const repeatedResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(repeatedResponse.status).toBe(200);
    exportReceiptFrom(repeatedResponse);
    const repeatedEncrypted = Buffer.from(await repeatedResponse.arrayBuffer());
    const repeatedZip = await decryptPlanningDataVaultArchive(repeatedEncrypted, "backup-passphrase");
    const repeatedEntries = await decodeZip(repeatedZip, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    expect(repeatedEntries.has("runs/backup-run-1/run.json")).toBe(true);
    await expect(fs.promises.stat(syncStatePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("finalizes a pending export once and keeps duplicate confirmation idempotent", async () => {
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(response.status).toBe(200);
    const receipt = exportReceiptFrom(response);
    await response.arrayBuffer();

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    await expect(fs.promises.stat(syncStatePath)).rejects.toMatchObject({ code: "ENOENT" });

    const firstFinalize = await finalizeOpsExport(receipt);
    const firstPayload = await firstFinalize.json() as { ok?: boolean; data?: { status?: string } };
    expect(firstFinalize.status).toBe(200);
    expect(firstPayload).toMatchObject({ ok: true, data: { status: "committed" } });
    const checkpointAfterFirst = await fs.promises.readFile(syncStatePath, "utf-8");

    const duplicateFinalize = await finalizeOpsExport(receipt);
    const duplicatePayload = await duplicateFinalize.json() as { ok?: boolean; data?: { status?: string } };
    expect(duplicateFinalize.status).toBe(200);
    expect(duplicatePayload).toMatchObject({ ok: true, data: { status: "already-finalized" } });
    expect(await fs.promises.readFile(syncStatePath, "utf-8")).toBe(checkpointAfterFirst);
  });

  it("rejects an expired export receipt without advancing the checkpoint", async () => {
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
    }));
    expect(response.status).toBe(200);
    const receipt = exportReceiptFrom(response);
    await response.arrayBuffer();

    const result = await finalizeBackupExportReceipt({
      nowMs: Date.now() + __BACKUP_EXPORT_RECEIPT_TTL_MS_FOR_TESTS + 1,
      receipt,
      scope: "ops",
      userId: "default",
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
    await expect(fs.promises.stat(env.PLANNING_BACKUP_SYNC_STATE_PATH as string)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails export safely when the durable confirmation store cannot be written", async () => {
    const response = await withBlockedReceiptStoreDir(() => backupExportPOST(new Request(
      `${LOCAL_ORIGIN}/api/ops/backup/export`,
      {
        method: "POST",
        headers: localJsonHeaders(),
        body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
      },
    )));
    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe("BACKUP_RECEIPT_STORE_UNAVAILABLE");
    await expect(fs.promises.stat(env.PLANNING_BACKUP_SYNC_STATE_PATH as string)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails finalize safely when the durable confirmation store is corrupted", async () => {
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
    }));
    expect(response.status).toBe(200);
    const receipt = exportReceiptFrom(response);
    await response.arrayBuffer();
    await fs.promises.writeFile(exportReceiptStorePath(), "{ broken-store", "utf-8");

    const finalized = await finalizeOpsExport(receipt);
    const payload = await finalized.json() as { error?: { code?: string } };
    expect(finalized.status).toBe(503);
    expect(payload.error?.code).toBe("BACKUP_RECEIPT_STORE_UNAVAILABLE");
    await expect(fs.promises.stat(env.PLANNING_BACKUP_SYNC_STATE_PATH as string)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not move the checkpoint backward when an older pending export is confirmed later", async () => {
    const olderResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
    }));
    expect(olderResponse.status).toBe(200);
    const olderReceipt = exportReceiptFrom(olderResponse);
    await olderResponse.arrayBuffer();

    await createRunFixture("backup-run-newer-export", "newer export run");
    const newerResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
    }));
    expect(newerResponse.status).toBe(200);
    const newerReceipt = exportReceiptFrom(newerResponse);
    await newerResponse.arrayBuffer();

    const newerFinalize = await finalizeOpsExport(newerReceipt);
    expect(newerFinalize.status).toBe(200);
    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const checkpointAfterNewer = await fs.promises.readFile(syncStatePath, "utf-8");

    const olderFinalize = await finalizeOpsExport(olderReceipt);
    const olderPayload = await olderFinalize.json() as { ok?: boolean; data?: { status?: string } };
    expect(olderFinalize.status).toBe(200);
    expect(olderPayload).toMatchObject({ ok: true, data: { status: "superseded" } });
    expect(await fs.promises.readFile(syncStatePath, "utf-8")).toBe(checkpointAfterNewer);
  });

  it("binds export confirmation to the signed receipt, user, and backup scope", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "1";
    const aliceHeader = { "x-planning-user-id": "alice" };
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders("csrf-token", LOCAL_HOST, aliceHeader),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase", mode: "full" }),
    }));
    expect(response.status).toBe(200);
    const receipt = exportReceiptFrom(response);
    await response.arrayBuffer();

    const wrongUser = await finalizeOpsExport(receipt, {
      extraHeaders: { "x-planning-user-id": "bob" },
    });
    expect(wrongUser.status).toBe(400);

    const wrongScope = await settingsBackupExportFinalizePOST(new Request(
      `${LOCAL_ORIGIN}/api/settings/backup/export/finalize`,
      {
        method: "POST",
        headers: localHeaders("csrf-token", LOCAL_HOST, {
          "content-type": "application/json",
          ...aliceHeader,
        }),
        body: JSON.stringify({ csrf: "csrf-token", receipt }),
      },
    ));
    expect(wrongScope.status).toBe(400);

    const tamperedReceipt = `${receipt.slice(0, -1)}${receipt.endsWith("A") ? "B" : "A"}`;
    const tampered = await finalizeOpsExport(tamperedReceipt, { extraHeaders: aliceHeader });
    expect(tampered.status).toBe(400);

    const valid = await finalizeOpsExport(receipt, { extraHeaders: aliceHeader });
    const validPayload = await valid.json() as { ok?: boolean; data?: { status?: string } };
    expect(valid.status).toBe(200);
    expect(validPayload).toMatchObject({ ok: true, data: { status: "committed" } });
  });

  it.each([
    ["without credentials", buildCookie()],
    ["with a fake session cookie", `${buildCookie()}; authjs.session-token=fake-session`],
  ])("rejects ops export %s before consuming JSON", async (_name, cookie) => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "1";
    const request = new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders("csrf-token", LOCAL_HOST, { cookie }),
      body: JSON.stringify({ csrf: "csrf-token", passphrase: "backup-passphrase" }),
    });

    const response = await backupExportPOST(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects an oversized declared ops export body before reading it", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "1";
    const request = new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders("csrf-token", LOCAL_HOST, {
        "content-length": String(32 * 1024 + 1),
        "x-planning-user-id": "alice",
      }),
      body: "not-read",
    });

    const response = await backupExportPOST(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("runs backup ops routes inside the current planning user scope for audit meta", async () => {
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_NAMESPACE_ENABLED = "1";
    const authHeaders = { "x-planning-user-id": "alice" };

    const exportResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders("csrf-token", LOCAL_HOST, authHeaders),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
      }),
    }));
    expect(exportResponse.status).toBe(200);
    await exportResponse.arrayBuffer();

    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewForm = new FormData();
    previewForm.set("csrf", "csrf-token");
    previewForm.set("passphrase", "backup-passphrase");
    previewForm.set("file", new File([new Uint8Array(encrypted)], "scoped.enc.json", { type: "application/json" }));
    const previewResponse = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders("csrf-token", LOCAL_HOST, authHeaders),
      body: previewForm,
    }));
    expect(previewResponse.status).toBe(200);
    captureBackupPreviewSessionCookie(previewResponse);
    const previewPayload = await previewResponse.json() as { previewToken?: string };
    expect(typeof previewPayload.previewToken).toBe("string");

    const restoreForm = new FormData();
    restoreForm.set("csrf", "csrf-token");
    restoreForm.set("passphrase", "backup-passphrase");
    restoreForm.set("mode", "merge");
    restoreForm.set("previewToken", previewPayload.previewToken ?? "");
    restoreForm.set("file", new File([new Uint8Array(encrypted)], "scoped.enc.json", { type: "application/json" }));
    const restoreResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders("csrf-token", LOCAL_HOST, authHeaders),
      body: restoreForm,
    }));
    expect(restoreResponse.status).toBe(200);

    const rows = await listOpsAuditEvents({ limit: 20 });
    for (const eventType of ["OPS_BACKUP_EXPORT_SUCCESS", "OPS_BACKUP_PREVIEW_SUCCESS", "OPS_BACKUP_RESTORE_SUCCESS"]) {
      const row = rows.find((entry) => entry.eventType === eventType);
      expect(row?.meta).toMatchObject({
        planningNamespaceEnabled: true,
        planningUserId: "alice",
        authSource: "trusted-header",
      });
    }
  });

  it("supports streamed+gzipped export for large synthetic blobs", async () => {
    await createLargeRunFixture("backup-run-large", 6 * 1024 * 1024);
    const heapBefore = process.memoryUsage().heapUsed;
    const response = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders("csrf-token", LOCAL_HOST, { "accept-encoding": "gzip" }),
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
      headers: localJsonHeaders(),
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

  it("warns during preview when a restore entry cannot be parsed safely", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      previewToken?: string;
      data?: { warnings?: string[] };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.previewToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(payload.data?.warnings ?? []).toContain(
      "미리보기에서 복원 파일 형식을 확인하지 못했습니다: profiles/broken-profile.json",
    );
    expect((payload.data?.warnings ?? []).join("\n")).not.toMatch(/Unexpected|INVALID_|restore failed|JSON/u);
  });

  it("warns and leaves detail data untouched when a full backup excludes it in shared storage mode", async () => {
    const detailPath = path.join(env.PLANNING_DATA_DIR as string, "planning-v3", "accounts.json");
    await fs.promises.mkdir(path.dirname(detailPath), { recursive: true });
    await fs.promises.writeFile(detailPath, `${JSON.stringify({ version: 2, items: [{ id: "acc-1", name: "합성 계좌", kind: "bank" }] })}\n`, "utf-8");
    const detailBefore = await fs.promises.readFile(detailPath);

    const exported = await buildPlanningDataVaultZip({ mode: "full", ...VAULT_TEST_LIMITS });
    const entries = await decodeZip(exported.bytes, { maxEntries: 500, maxTotalBytes: 8 * 1024 * 1024 });
    expect(exported.manifest.planningV3).toEqual({ included: false, totalBytes: 0, reason: "legacy-storage-mode" });
    expect([...entries.keys()].filter((entryPath) => entryPath.startsWith("planning-v3/"))).toEqual([]);

    const preview = await previewPlanningDataVaultZip(exported.bytes, { ...VAULT_TEST_LIMITS, maxPreviewIds: 10 });
    expect(preview.manifest.planningV3).toEqual({ included: false, totalBytes: 0, reason: "legacy-storage-mode" });
    expect(preview.warnings).toContain(LEGACY_STORAGE_V3_WARNING);

    const restored = await restorePlanningDataVaultZip(exported.bytes, { mode: "replace", ...VAULT_TEST_LIMITS });
    expect(restored.committed).toBe(true);
    expect(restored.imported.planningV3Files).toBe(0);
    expect(restored.warnings).toContain(LEGACY_STORAGE_V3_WARNING);
    expect(await fs.promises.readFile(detailPath)).toEqual(detailBefore);
  });

  it("keeps the delta warning separate from the shared storage warning", async () => {
    const exported = await buildPlanningDataVaultZip({ mode: "delta", ...VAULT_TEST_LIMITS });
    const preview = await previewPlanningDataVaultZip(exported.bytes, { ...VAULT_TEST_LIMITS, maxPreviewIds: 10 });

    expect(preview.manifest.planningV3).toEqual({ included: false, totalBytes: 0, reason: "delta-stable-only" });
    expect(preview.warnings).toContain("변경분 백업은 Planning v3 파일 변경 이력을 추적하지 않으므로 Planning v3 데이터는 포함하지 않습니다.");
    expect(preview.warnings).not.toContain(LEGACY_STORAGE_V3_WARNING);
  });

  it("uses the manifest reason instead of inferring exclusion from zero detail files", async () => {
    const exported = await buildPlanningDataVaultZip({ mode: "full", ...VAULT_TEST_LIMITS });
    const entries = await decodeZip(exported.bytes, { maxEntries: 500, maxTotalBytes: 8 * 1024 * 1024 });
    const manifest = JSON.parse((entries.get("manifest.json") as Buffer).toString("utf-8")) as Record<string, unknown>;
    manifest.planningV3 = { included: false, totalBytes: 0 };
    entries.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"));
    const withoutReason = encodeZip([...entries.entries()].map(([entryPath, bytes]) => ({ path: entryPath, bytes })));

    const preview = await previewPlanningDataVaultZip(withoutReason, { ...VAULT_TEST_LIMITS, maxPreviewIds: 10 });

    expect(preview.actual.planningV3Files).toBe(0);
    expect(preview.warnings).not.toContain(LEGACY_STORAGE_V3_WARNING);
  });

  it("does not warn about exclusion when a user-scoped backup has no detail files yet", async () => {
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_USER_ID = "alice";

    const preview = await runWithPlanningUserScope({ userId: "alice", authSource: "test" }, async () => {
      const exported = await buildPlanningDataVaultZip({ mode: "full", scope: "user", userId: "alice", ...VAULT_TEST_LIMITS });
      return await previewPlanningDataVaultZip(exported.bytes, {
        ...VAULT_TEST_LIMITS,
        maxPreviewIds: 10,
        scope: "user",
        userId: "alice",
      });
    });

    expect(preview.manifest.planningV3).toEqual({ included: true, totalBytes: 0 });
    expect(preview.actual.planningV3Owners).toBe(13);
    expect(preview.actual.planningV3Files).toBe(0);
    expect(preview.warnings).not.toContain(LEGACY_STORAGE_V3_WARNING);
  });

  it("persists preview receipts in the planning data directory", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted);

    expect(previewToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    const storePath = previewReceiptStorePath();
    const rawStore = await fs.promises.readFile(storePath, "utf-8");
    const store = JSON.parse(rawStore) as {
      hmacSecret?: unknown;
      receipts?: Record<string, unknown>;
      version?: unknown;
    };
    expect(store.version).toBe(1);
    expect(typeof store.hmacSecret).toBe("string");
    expect(Object.keys(store.receipts ?? {})).toHaveLength(1);
  });

  it("returns preview guidance instead of crashing when the preview receipt store is corrupted", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted);
    const storePath = previewReceiptStorePath();
    await fs.promises.writeFile(storePath, "{ broken-json", "utf-8");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("복원 전 미리보기 확인을 먼저 완료해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("returns storage guidance when preview receipts cannot be saved", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await withBlockedReceiptStoreDir(() => backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    })));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe("BACKUP_RECEIPT_STORE_UNAVAILABLE");
    expect(payload.error?.message).toBe("미리보기 확인 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하고, 반복되면 운영 데이터 디렉터리 권한과 잠금 파일 상태를 확인해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("returns storage guidance without deleting a malformed preview receipt lock", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await withMalformedReceiptLock(async () => {
      const previewResponse = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
        method: "POST",
        headers: localHeaders(),
        body: form,
      }));
      await expect(fs.promises.readFile(`${previewReceiptStorePath()}.lock`, "utf-8")).resolves.toBe("{ broken-lock");
      return previewResponse;
    });
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe("BACKUP_RECEIPT_STORE_UNAVAILABLE");
    expect(payload.error?.message).toBe("미리보기 확인 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하고, 반복되면 운영 데이터 디렉터리 권한과 잠금 파일 상태를 확인해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("returns storage guidance when preview receipts cannot be checked before restore", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted);
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await withBlockedReceiptStoreDir(() => backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    })));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe("BACKUP_RECEIPT_STORE_UNAVAILABLE");
    expect(payload.error?.message).toBe("미리보기 확인 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하고, 반복되면 운영 데이터 디렉터리 권한과 잠금 파일 상태를 확인해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("rejects preview for invalid encrypted backup", async () => {
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set(
      "file",
      new File([new Uint8Array(Buffer.from("not-a-zip", "utf-8"))], "broken.enc.json", { type: "application/json" }),
    );

    const response = await backupPreviewPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/preview`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe("BACKUP_INVALID");
    expectNoRawBackupErrorMessage(payload.error?.message);
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("requires preview before inspecting a restore archive", async () => {
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set(
      "file",
      new File([new Uint8Array(Buffer.from("not-a-zip", "utf-8"))], "broken.enc.json", { type: "application/json" }),
    );

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("복원 전 미리보기 확인을 먼저 완료해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("requires a successful preview token before restoring a valid backup", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
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
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("복원 전 미리보기 확인을 먼저 완료해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/backup");
  });

  it("keeps the preview token usable after a different backup file mismatch", async () => {
    const firstEncrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const secondEncrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(firstEncrypted, "first.enc.json");
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(secondEncrypted)], "second.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      error?: { code?: string; details?: { retryPreviewToken?: boolean }; message?: string; fixHref?: string };
    };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("미리보기 확인과 현재 파일 또는 암호가 일치하지 않습니다. 선택한 파일과 암호를 확인한 뒤 다시 복원해 주세요.");
    expect(payload.error?.details?.retryPreviewToken).toBe(true);
    expect(payload.error?.fixHref).toBe("/ops/backup");

    const retryForm = new FormData();
    retryForm.set("csrf", "csrf-token");
    retryForm.set("passphrase", "backup-passphrase");
    retryForm.set("mode", "merge");
    retryForm.set("previewToken", previewToken);
    retryForm.set("file", new File([new Uint8Array(firstEncrypted)], "first.enc.json", { type: "application/json" }));

    const retryResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: retryForm,
    }));
    const retryPayload = await retryResponse.json() as { ok?: boolean };
    expect(retryResponse.status).toBe(200);
    expect(retryPayload.ok).toBe(true);
  });

  it("restores after the csrf token changes when the preview session is unchanged", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted, "restore.enc.json", { csrf: "preview-csrf" });
    expect(backupPreviewSessionCookie).toContain(`${BACKUP_PREVIEW_SESSION_COOKIE}=`);

    const form = new FormData();
    form.set("csrf", "fresh-csrf");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders("fresh-csrf"),
      body: form,
    }));
    const payload = await response.json() as { ok?: boolean };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });

  it("keeps the preview token usable for the original browser session after a different session mismatch", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted, "restore.enc.json", { csrf: "preview-session" });
    const originalBackupPreviewSessionCookie = backupPreviewSessionCookie;
    backupPreviewSessionCookie = `${BACKUP_PREVIEW_SESSION_COOKIE}=other-browser-session`;
    const form = new FormData();
    form.set("csrf", "restore-session");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders("restore-session"),
      body: form,
    }));
    const payload = await response.json() as {
      error?: { code?: string; details?: { retryPreviewToken?: boolean }; message?: string; fixHref?: string };
    };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("현재 브라우저의 미리보기 확인 정보가 일치하지 않습니다. 다시 미리보기 확인 후 복원해 주세요.");
    expect(payload.error?.details?.retryPreviewToken).toBeUndefined();
    expect(payload.error?.fixHref).toBe("/ops/backup");

    backupPreviewSessionCookie = originalBackupPreviewSessionCookie;
    const retryForm = new FormData();
    retryForm.set("csrf", "preview-session");
    retryForm.set("passphrase", "backup-passphrase");
    retryForm.set("mode", "merge");
    retryForm.set("previewToken", previewToken);
    retryForm.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const retryResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders("preview-session"),
      body: retryForm,
    }));
    const retryPayload = await retryResponse.json() as { ok?: boolean };
    expect(retryResponse.status).toBe(200);
    expect(retryPayload.ok).toBe(true);
  });

  it("rejects reusing a consumed preview token", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    const previewToken = await previewTokenForEncryptedBackup(encrypted);

    const firstForm = new FormData();
    firstForm.set("csrf", "csrf-token");
    firstForm.set("passphrase", "backup-passphrase");
    firstForm.set("mode", "merge");
    firstForm.set("previewToken", previewToken);
    firstForm.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const firstResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: firstForm,
    }));
    const firstPayload = await firstResponse.json() as { ok?: boolean };
    expect(firstResponse.status).toBe(200);
    expect(firstPayload.ok).toBe(true);

    const secondForm = new FormData();
    secondForm.set("csrf", "csrf-token");
    secondForm.set("passphrase", "backup-passphrase");
    secondForm.set("mode", "merge");
    secondForm.set("previewToken", previewToken);
    secondForm.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const secondResponse = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: secondForm,
    }));
    const secondPayload = await secondResponse.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(secondResponse.status).toBe(428);
    expect(secondPayload.error?.code).toBe("VALIDATION");
    expect(secondPayload.error?.message).toBe("복원 전 미리보기 확인을 먼저 완료해 주세요.");
    expect(secondPayload.error?.fixHref).toBe("/ops/backup");
  });

  it("returns clear guidance when the preview token expired before restore", async () => {
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");
    backupPreviewSessionCookie = `${BACKUP_PREVIEW_SESSION_COOKIE}=expired-preview-session`;
    const previewToken = await createBackupPreviewToken({
      archiveBytes: encrypted,
      nowMs: Date.now() - __BACKUP_PREVIEW_TOKEN_TTL_MS_FOR_TESTS,
      passphrase: "backup-passphrase",
      sessionToken: "expired-preview-session",
    });
    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", previewToken);
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(428);
    expect(payload.error?.code).toBe("VALIDATION");
    expect(payload.error?.message).toBe("미리보기 확인이 만료되었습니다. 다시 미리보기 확인 후 복원해 주세요.");
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
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
      }),
    }));
    const payload = await response.json() as { error?: { code?: string; message?: string; fixHref?: string } };
    expect(response.status).toBe(423);
    expect(payload.error?.code).toBe("LOCKED");
    expect(payload.error?.message).toBe("운영 보안 잠금을 해제한 뒤 다시 시도해 주세요.");
    expect(payload.error?.fixHref).toBe("/ops/security");
  });

  it("restores in merge mode and collects per-item errors", async () => {
    await createProfile({
      name: "existing profile",
      profile: profileFixture(),
    });
    const defaultBefore = await getDefaultProfileId();
    const zip = makeRestoreZip();
    const encrypted = await encryptPlanningDataVaultArchive(zip, "backup-passphrase");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", await previewTokenForEncryptedBackup(encrypted));
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
        issues?: Array<{ entity?: string; message?: string; path?: string }>;
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect((payload.data?.imported?.profiles ?? 0)).toBeGreaterThanOrEqual(1);
    expect((payload.data?.issues ?? []).length).toBeGreaterThanOrEqual(1);
    const brokenProfileIssue = (payload.data?.issues ?? [])
      .find((issue) => issue.entity === "profile" && issue.path?.includes("broken-profile.json"));
    expect(brokenProfileIssue?.message).toBe("상담 정보 파일을 복원하지 못했습니다. 백업 파일이 손상되었거나 지원하지 않는 형식입니다.");
    expect(brokenProfileIssue?.message).not.toMatch(/Unexpected|INVALID_|restore failed|JSON/u);

    const profiles = await listProfiles();
    expect(profiles.some((profile) => profile.id === "imported-profile")).toBe(true);
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    expect(await getDefaultProfileId()).toBe(defaultBefore);
  });

  it("keeps existing data and reports an error when replace restore has invalid entries", async () => {
    const beforeProfileIds = (await listProfiles())
      .map((profile) => profile.id)
      .sort((a, b) => a.localeCompare(b));
    const defaultBefore = await getDefaultProfileId();
    const encrypted = await encryptPlanningDataVaultArchive(makeRestoreZip(), "backup-passphrase");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "replace");
    form.set("previewToken", await previewTokenForEncryptedBackup(encrypted));
    form.set("file", new File([new Uint8Array(encrypted)], "restore.enc.json", { type: "application/json" }));

    const response = await backupRestorePOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/restore`, {
      method: "POST",
      headers: localHeaders(),
      body: form,
    }));
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("RESTORE_NOT_COMMITTED");
    expect(payload.error?.message).toBe("복원을 완료하지 못했습니다. 기존 데이터는 변경되지 않았습니다.");

    const afterProfiles = await listProfiles();
    expect(afterProfiles.map((profile) => profile.id).sort((a, b) => a.localeCompare(b))).toEqual(beforeProfileIds);
    expect(afterProfiles.some((profile) => profile.id === "imported-profile")).toBe(false);
    expect(await getDefaultProfileId()).toBe(defaultBefore);

    const successRows = await listOpsAuditEvents({ eventType: "OPS_BACKUP_RESTORE_SUCCESS", limit: 20 });
    const errorRows = await listOpsAuditEvents({ eventType: "OPS_BACKUP_RESTORE_ERROR", limit: 20 });
    expect(successRows).toHaveLength(0);
    expect(errorRows.some((row) => row.meta?.code === "RESTORE_NOT_COMMITTED")).toBe(true);
  });

  it.each([
    ["missing", "백업 목록에는 있지만 실제 파일을 찾지 못했습니다"],
    ["hash", "백업 파일의 무결성 확인값이 맞지 않습니다"],
    ["size", "백업 파일 크기 정보가 실제와 다릅니다"],
    ["unexpected", "백업 목록에 없는 파일이 포함되어 있어 건너뛰었습니다"],
  ] as const)("keeps existing data when replace detects a %s manifest mismatch", async (mutation, message) => {
    const beforeProfileIds = (await listProfiles())
      .map((profile) => profile.id)
      .sort((a, b) => a.localeCompare(b));
    const archive = await makeManifestIntegrityMismatchZip(mutation);

    const result = await restorePlanningDataVaultZip(archive.zip, {
      mode: "replace",
      maxEntries: 50,
      maxBytes: 1024 * 1024,
    });

    expect(result.committed).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity: "restore",
        path: archive.path,
        message: `${message}: ${archive.path}`,
      }),
    ]));
    expect((await listProfiles()).map((profile) => profile.id).sort((a, b) => a.localeCompare(b)))
      .toEqual(beforeProfileIds);
  });

  it("rolls back replace restore when a commit write fails", async () => {
    const beforeProfileIds = (await listProfiles())
      .map((profile) => profile.id)
      .sort((a, b) => a.localeCompare(b));
    const defaultBefore = await getDefaultProfileId();
    const zip = makeRestoreZipWithAprDecimalProfile();

    const result = await restorePlanningDataVaultZip(zip, {
      mode: "replace",
      maxEntries: 50,
      maxBytes: 1024 * 1024,
      faultInjection: {
        beforeWrite(operation: { entity?: string }) {
          if (operation.entity === "profile") {
            throw new Error("fault: profile write failed");
          }
        },
      },
    } as Parameters<typeof restorePlanningDataVaultZip>[1] & {
      faultInjection: {
        beforeWrite(operation: { entity?: string }): void;
      };
    }) as Awaited<ReturnType<typeof restorePlanningDataVaultZip>> & { committed?: boolean };

    expect(result.committed).toBe(false);
    expect(result.issues.some((issue) => issue.message === "복원을 완료하지 못했습니다. 기존 데이터는 변경되지 않았습니다.")).toBe(true);

    const afterProfiles = await listProfiles();
    expect(afterProfiles.map((profile) => profile.id).sort((a, b) => a.localeCompare(b))).toEqual(beforeProfileIds);
    expect(afterProfiles.some((profile) => profile.id === "normalize-profile")).toBe(false);
    expect(await getDefaultProfileId()).toBe(defaultBefore);
  });

  it("keeps the current default profile after replace when the backup contains it", async () => {
    await seedTwoProfilesWithSortedLastDefault();
    const exported = await buildPlanningDataVaultZip({ mode: "full", ...VAULT_TEST_LIMITS });

    const restored = await restorePlanningDataVaultZip(exported.bytes, { mode: "replace", ...VAULT_TEST_LIMITS });

    expect(restored.committed).toBe(true);
    expect(restored.imported.profiles).toBe(2);
    expect(await getDefaultProfileId()).toBe(SAVED_PROFILE_ID);
    expect((await listProfiles()).map((profile) => profile.id).sort((a, b) => a.localeCompare(b)))
      .toEqual([SORTED_FIRST_PROFILE_ID, SAVED_PROFILE_ID]);
    expect((await getProfile(SAVED_PROFILE_ID))?.profile.liquidAssets).toBe(SAVED_PROFILE_LIQUID_ASSETS);
  });

  it("uses the existing fallback after replace when the backup does not contain the current default", async () => {
    await seedTwoProfilesWithSortedLastDefault();
    const exported = await buildPlanningDataVaultZip({ mode: "full", ...VAULT_TEST_LIMITS });
    await upsertProfileRecord({
      id: "current-only-profile",
      name: "current only profile",
      profile: profileFixture(),
      createdAt: "2026-03-03T00:00:00.000Z",
      updatedAt: "2026-03-03T00:00:00.000Z",
    });
    await setDefaultProfile("current-only-profile");

    const restored = await restorePlanningDataVaultZip(exported.bytes, { mode: "replace", ...VAULT_TEST_LIMITS });

    expect(restored.committed).toBe(true);
    expect(await getDefaultProfileId()).toBe(SORTED_FIRST_PROFILE_ID);
    expect((await listProfiles()).map((profile) => profile.id).sort((a, b) => a.localeCompare(b)))
      .toEqual([SORTED_FIRST_PROFILE_ID, SAVED_PROFILE_ID]);
  });

  it("rolls back replace restore when keeping the current default fails", async () => {
    await seedTwoProfilesWithSortedLastDefault();
    const exported = await buildPlanningDataVaultZip({ mode: "full", ...VAULT_TEST_LIMITS });

    const result = await restorePlanningDataVaultZip(exported.bytes, {
      mode: "replace",
      ...VAULT_TEST_LIMITS,
      faultInjection: {
        beforeWrite(operation) {
          if (operation.path === "profiles.meta.json") throw new Error("fault: default profile write failed");
        },
      },
    });

    expect(result.committed).toBe(false);
    expect(await getDefaultProfileId()).toBe(SAVED_PROFILE_ID);
    expect((await listProfiles()).map((profile) => profile.id).sort((a, b) => a.localeCompare(b)))
      .toEqual([SORTED_FIRST_PROFILE_ID, SAVED_PROFILE_ID]);
  });

  it("returns normalization disclosures for restored profiles", async () => {
    const zip = makeRestoreZipWithAprDecimalProfile();
    const encrypted = await encryptPlanningDataVaultArchive(zip, "backup-passphrase");

    const form = new FormData();
    form.set("csrf", "csrf-token");
    form.set("passphrase", "backup-passphrase");
    form.set("mode", "merge");
    form.set("previewToken", await previewTokenForEncryptedBackup(encrypted));
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
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
    };
    expect(typeof firstState.lastExportAt).toBe("string");
    expect(typeof firstState.lastJournalOffset).toBe("number");
    expect(firstState.lastJournalBoundary?.offset).toBe(firstState.lastJournalOffset);
    expect(firstState.lastJournalBoundary?.tailHash).toMatch(/^[a-f0-9]{64}$/u);
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }

    await createRunFixture("backup-run-2", "delta run", {
      createdAt: firstExportAt,
    });
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-2"), "run.json"),
      cutoffDate,
      cutoffDate,
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const deltaReceipt = exportReceiptFrom(deltaResponse);
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
      syncState?: {
        previousJournalOffset?: number;
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        currentJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.mode).toBe("delta");
    expect(manifest.counts?.runs).toBe(1);
    expect(manifest.syncState?.previousJournalOffset).toBe(firstState.lastJournalOffset);
    expect(manifest.syncState?.previousJournalBoundary).toEqual(firstState.lastJournalBoundary);
    expect(manifest.syncState?.currentJournalBoundary?.offset).toBeGreaterThan(firstState.lastJournalOffset ?? 0);
    expect(manifest.syncState?.currentJournalBoundary?.tailHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "offset",
      startOffset: firstState.lastJournalOffset,
    });
    expect((await finalizeOpsExport(deltaReceipt)).status).toBe(200);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
      lastJournalScan?: {
        mode?: string;
        startOffset?: number;
        fallbackReason?: string;
      };
    };
    expect(typeof secondState.lastExportAt).toBe("string");
    expect((secondState.lastJournalOffset ?? 0)).toBeGreaterThanOrEqual(firstState.lastJournalOffset ?? 0);
    expect(secondState.lastJournalBoundary?.offset).toBe(secondState.lastJournalOffset);
    expect(secondState.lastJournalBoundary?.tailHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Date.parse(secondState.lastExportAt ?? "") >= Date.parse(firstState.lastExportAt ?? "")).toBe(true);
    expect(secondState.lastJournalScan).toEqual({
      mode: "offset",
      startOffset: firstState.lastJournalOffset,
    });
  });

  it("does not advance the delta checkpoint when encryption fails", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const checkpointBeforeFailure = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(checkpointBeforeFailure) as { lastExportAt?: string };
    if (!firstState.lastExportAt) throw new Error("first export timestamp missing");

    await createRunFixture("backup-run-after-failed-encryption", "delta after failed encryption", {
      createdAt: firstState.lastExportAt,
    });

    const failedResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "",
        mode: "delta",
      }),
    }));
    expect(failedResponse.status).toBe(400);
    expect(await fs.promises.readFile(syncStatePath, "utf-8")).toBe(checkpointBeforeFailure);

    const retryResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(retryResponse.status).toBe(200);
    const encryptedBytes = Buffer.from(await retryResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    expect(entries.has("runs/backup-run-after-failed-encryption/run.json")).toBe(true);
  });

  it("does not export unchanged run from rolled back run-create journal transaction", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
    };
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-1"), "run.json"),
      cutoffDate,
      cutoffDate,
    );
    await fs.promises.utimes(
      path.join(resolveRunDir("backup-run-1"), "action-plan.json"),
      cutoffDate,
      cutoffDate,
    );
    await fs.promises.utimes(
      path.join(resolveRunDir("backup-run-1"), "action-progress.json"),
      cutoffDate,
      cutoffDate,
    );
    await appendRunCreateJournalTransaction(
      "backup-run-1",
      "ROLLBACK",
      new Date(cutoffDate.getTime() + 1_000).toISOString(),
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
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
    expect(runPaths).not.toContain("runs/backup-run-1/run.json");

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      counts?: { runs?: number };
      syncState?: {
        previousJournalOffset?: number;
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        currentJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.counts?.runs).toBe(0);
    expect(manifest.syncState?.previousJournalOffset).toBe(firstState.lastJournalOffset);
    expect(manifest.syncState?.previousJournalBoundary).toEqual(firstState.lastJournalBoundary);
    expect(manifest.syncState?.currentJournalBoundary?.offset).toBe((firstState.lastJournalOffset ?? 0) + 3);
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "offset",
      startOffset: firstState.lastJournalOffset,
    });
  });

  it("exports delta run when previous journal offset is stale after compaction", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
    };
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }

    await createRunFixture("backup-run-compact", "delta run after compacted journal", {
      createdAt: firstExportAt,
    });
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-compact"), "run.json"),
      cutoffDate,
      cutoffDate,
    );
    await keepOnlyJournalTransactionsForRun("backup-run-compact");
    await fs.promises.writeFile(
      syncStatePath,
      `${JSON.stringify({
        ...firstState,
        lastJournalOffset: 999_999,
      }, null, 2)}\n`,
      "utf-8",
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const deltaReceipt = exportReceiptFrom(deltaResponse);
    const encryptedBytes = Buffer.from(await deltaResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    const runPaths = [...entries.keys()].filter((entry) => /^runs\/[^/]+\/run\.json$/u.test(entry));
    expect(runPaths).toContain("runs/backup-run-compact/run.json");

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      syncState?: {
        previousJournalOffset?: number;
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        currentJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.syncState?.previousJournalOffset).toBe(999_999);
    expect(manifest.syncState?.previousJournalBoundary).toEqual(firstState.lastJournalBoundary);
    expect(manifest.syncState?.currentJournalBoundary?.offset).toBeGreaterThan(0);
    expect(manifest.syncState?.currentJournalBoundary?.tailHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-offset-out-of-range",
    });
    expect((await finalizeOpsExport(deltaReceipt)).status).toBe(200);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as {
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
      lastJournalScan?: {
        mode?: string;
        startOffset?: number;
        fallbackReason?: string;
      };
    };
    expect(secondState.lastJournalBoundary).toEqual(manifest.syncState?.currentJournalBoundary);
    expect(secondState.lastJournalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-offset-out-of-range",
    });
  });

  it("exports delta run when previous sync state lacks a journal boundary", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
    };
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }

    await createRunFixture("backup-run-legacy-boundary", "delta run after legacy sync state", {
      createdAt: firstExportAt,
    });
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-legacy-boundary"), "run.json"),
      cutoffDate,
      cutoffDate,
    );
    const retainedEventCount = await keepOnlyJournalTransactionsForRun("backup-run-legacy-boundary");
    const legacyState = JSON.parse(firstStateRaw) as Record<string, unknown>;
    delete legacyState.lastJournalBoundary;
    delete legacyState.lastJournalScan;
    legacyState.lastJournalOffset = retainedEventCount;
    await fs.promises.writeFile(
      syncStatePath,
      `${JSON.stringify(legacyState, null, 2)}\n`,
      "utf-8",
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const deltaReceipt = exportReceiptFrom(deltaResponse);
    const encryptedBytes = Buffer.from(await deltaResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    const runPaths = [...entries.keys()].filter((entry) => /^runs\/[^/]+\/run\.json$/u.test(entry));
    expect(runPaths).toContain("runs/backup-run-legacy-boundary/run.json");

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      syncState?: {
        previousJournalOffset?: number;
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.syncState?.previousJournalOffset).toBe(retainedEventCount);
    expect(manifest.syncState?.previousJournalBoundary).toBeUndefined();
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-boundary-missing",
    });
    expect((await finalizeOpsExport(deltaReceipt)).status).toBe(200);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as {
      lastJournalScan?: {
        mode?: string;
        startOffset?: number;
        fallbackReason?: string;
      };
    };
    expect(secondState.lastJournalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-boundary-missing",
    });
  });

  it("exports delta run when previous journal boundary offset no longer matches sync offset", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
    };
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }

    await createRunFixture("backup-run-boundary-mismatch", "delta run after boundary offset mismatch", {
      createdAt: firstExportAt,
    });
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-boundary-mismatch"), "run.json"),
      cutoffDate,
      cutoffDate,
    );
    const retainedEventCount = await keepOnlyJournalTransactionsForRun("backup-run-boundary-mismatch");
    const staleBoundary = {
      offset: retainedEventCount + 1,
      tailHash: "1".repeat(64),
    };
    await fs.promises.writeFile(
      syncStatePath,
      `${JSON.stringify({
        ...firstState,
        lastJournalOffset: retainedEventCount,
        lastJournalBoundary: staleBoundary,
      }, null, 2)}\n`,
      "utf-8",
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const deltaReceipt = exportReceiptFrom(deltaResponse);
    const encryptedBytes = Buffer.from(await deltaResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    const runPaths = [...entries.keys()].filter((entry) => /^runs\/[^/]+\/run\.json$/u.test(entry));
    expect(runPaths).toContain("runs/backup-run-boundary-mismatch/run.json");

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      syncState?: {
        previousJournalOffset?: number;
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.syncState?.previousJournalOffset).toBe(retainedEventCount);
    expect(manifest.syncState?.previousJournalBoundary).toEqual(staleBoundary);
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-boundary-mismatch",
    });
    expect((await finalizeOpsExport(deltaReceipt)).status).toBe(200);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as {
      lastJournalScan?: {
        mode?: string;
        startOffset?: number;
        fallbackReason?: string;
      };
    };
    expect(secondState.lastJournalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-boundary-mismatch",
    });
  });

  it("exports delta run when retained journal tail no longer matches previous boundary", async () => {
    const fullResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "full",
      }),
    }));
    expect(fullResponse.status).toBe(200);
    await consumeAndFinalizeOpsExport(fullResponse);

    const syncStatePath = env.PLANNING_BACKUP_SYNC_STATE_PATH as string;
    const firstStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const firstState = JSON.parse(firstStateRaw) as {
      lastExportAt?: string;
      lastJournalOffset?: number;
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
    };
    const firstExportAt = firstState.lastExportAt;
    if (typeof firstExportAt !== "string") {
      throw new Error("first delta export timestamp missing");
    }

    await createRunFixture("backup-run-tail-mismatch", "delta run after retained journal rewrite", {
      createdAt: firstExportAt,
    });
    const cutoffDate = new Date(firstExportAt);
    expect(Number.isFinite(cutoffDate.getTime())).toBe(true);
    await fs.promises.utimes(
      path.join(resolveProfileRunDir("backup_profile", "backup-run-tail-mismatch"), "run.json"),
      cutoffDate,
      cutoffDate,
    );
    const retainedEventCount = await keepOnlyJournalTransactionsForRun("backup-run-tail-mismatch");
    const staleTailHash = "0".repeat(64);
    await fs.promises.writeFile(
      syncStatePath,
      `${JSON.stringify({
        ...firstState,
        lastJournalOffset: retainedEventCount,
        lastJournalBoundary: {
          offset: retainedEventCount,
          tailHash: staleTailHash,
        },
      }, null, 2)}\n`,
      "utf-8",
    );

    const deltaResponse = await backupExportPOST(new Request(`${LOCAL_ORIGIN}/api/ops/backup/export`, {
      method: "POST",
      headers: localJsonHeaders(),
      body: JSON.stringify({
        csrf: "csrf-token",
        passphrase: "backup-passphrase",
        mode: "delta",
      }),
    }));
    expect(deltaResponse.status).toBe(200);

    const deltaReceipt = exportReceiptFrom(deltaResponse);
    const encryptedBytes = Buffer.from(await deltaResponse.arrayBuffer());
    const zipBytes = await decryptPlanningDataVaultArchive(encryptedBytes, "backup-passphrase");
    const entries = await decodeZip(zipBytes, {
      maxEntries: 5000,
      maxTotalBytes: 25 * 1024 * 1024,
    });
    const runPaths = [...entries.keys()].filter((entry) => /^runs\/[^/]+\/run\.json$/u.test(entry));
    expect(runPaths).toContain("runs/backup-run-tail-mismatch/run.json");

    const manifest = JSON.parse((entries.get("manifest.json") ?? Buffer.from("{}")).toString("utf-8")) as {
      syncState?: {
        previousJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        currentJournalBoundary?: {
          offset?: number;
          tailHash?: string;
        };
        journalScan?: {
          mode?: string;
          startOffset?: number;
          fallbackReason?: string;
        };
      };
    };
    expect(manifest.syncState?.previousJournalBoundary).toEqual({
      offset: retainedEventCount,
      tailHash: staleTailHash,
    });
    expect(manifest.syncState?.journalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-tail-mismatch",
    });
    expect(manifest.syncState?.currentJournalBoundary?.offset).toBe(retainedEventCount);
    expect(manifest.syncState?.currentJournalBoundary?.tailHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.syncState?.currentJournalBoundary?.tailHash).not.toBe(staleTailHash);
    expect((await finalizeOpsExport(deltaReceipt)).status).toBe(200);

    const secondStateRaw = await fs.promises.readFile(syncStatePath, "utf-8");
    const secondState = JSON.parse(secondStateRaw) as {
      lastJournalBoundary?: {
        offset?: number;
        tailHash?: string;
      };
      lastJournalScan?: {
        mode?: string;
        startOffset?: number;
        fallbackReason?: string;
      };
    };
    expect(secondState.lastJournalBoundary).toEqual(manifest.syncState?.currentJournalBoundary);
    expect(secondState.lastJournalScan).toEqual({
      mode: "full-scan",
      startOffset: 0,
      fallbackReason: "previous-tail-mismatch",
    });
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
    form.set("previewToken", await previewTokenForEncryptedBackup(encrypted, "delta.enc.json"));
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
    expect((payload.data?.warnings ?? []).some((row) => row.includes("이미 같은 상담 기록이 있어 변경분 복원에서 건너뛰었습니다: conflict-run"))).toBe(true);
    if (conflictSnapshotId) {
      expect((payload.data?.warnings ?? []).some((row) => row.includes(`이미 같은 가정 스냅샷이 있어 변경분 복원에서 건너뛰었습니다: ${conflictSnapshotId}`))).toBe(true);
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
    form.set("previewToken", await previewTokenForEncryptedBackup(encrypted, "partitioned.enc.json"));
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
