import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAssumptionsSnapshotById, loadLatestAssumptionsSnapshot, saveLatestAssumptionsSnapshot } from "../../planning/assumptions/storage";
import { saveAssumptionsOverrides } from "../../planning/assumptions/overridesStorage";
import {
  DEFAULT_VAULT_KDF_PARAMS,
  decryptBytesWithKey,
  deriveKeyFromPassphrase,
  encryptBytesWithKey,
  isVaultEncryptedEnvelope,
  type VaultEncryptedEnvelope,
  type VaultKdfParams,
} from "../../planning/crypto/vaultCrypto";
import { migrateAssumptionsSnapshot } from "../../planning/migrations/snapshotMigrate";
import { atomicWriteJson } from "../../planning/storage/atomicWrite";
import { readStorageJournalEvents } from "../../planning/storage/journal";
import { createRun, getRun, getRunBlob, hardDeleteRun, listRunIndexEntries } from "../../planning/server/store/runStore";
import { hardDeleteProfile, listProfiles, upsertProfileRecord } from "../../planning/store/profileStore";
import {
  resolveProfilePartitionDir,
  resolveProfileRunBlobsDir,
  resolveProfileRunDir,
  resolveRunBlobsDir,
  resolveRunDir,
  resolveRunsIndexPath,
  sanitizeRecordId,
} from "../../planning/store/paths";
import { type PlanningRunActionPlan, type PlanningRunActionProgress, type PlanningRunRecord } from "../../planning/store/types";
import { decodeStoragePayload, encodeStoragePayload } from "../../planning/security/vaultStorage";
import { loadCanonicalRun } from "../../planning/v2/loadCanonicalRun";
import { loadCanonicalProfile } from "../../planning/v2/loadCanonicalProfile";
import { PROFILE_SCHEMA_VERSION, RUN_SCHEMA_VERSION, ASSUMPTIONS_SCHEMA_VERSION } from "../../planning/v2/schemaVersion";
import { type ProfileNormalizationDisclosure } from "../../planning/v2/normalizationDisclosure";
import { resolveOpsDataDir, resolvePlanningDataDir } from "../../planning/storage/dataDir";
import { decodeZip, encodeZip, type ZipFileEntry } from "./zipCodec";

const VAULT_KIND = "planning-data-vault";
const VAULT_FORMAT_VERSION = 1;
const ENCRYPTED_BACKUP_KIND = "planning-data-vault-encrypted";
const ENCRYPTED_BACKUP_VERSION = 1;
const MANIFEST_PATH = "manifest.json";
const PROFILE_DIR = "profiles";
const RUN_DIR = "runs";
const ASSUMPTIONS_DIR = "assumptions";
const POLICIES_DIR = "policies";
const PROFILE_OVERRIDES_FILE = "assumptions-overrides.json";
const OPS_AUTO_MERGE_POLICY_FILE = "auto-merge-policy.json";
const BACKUP_SYNC_STATE_PATH = "backup/sync-state.json";
const KNOWN_BLOB_NAMES = ["simulate", "scenarios", "monteCarlo", "actions", "debtStrategy"] as const;
const BACKUP_SYNC_STATE_VERSION = 1 as const;

type RestoreMode = "merge" | "replace";
type BackupExportMode = "full" | "delta";
type BackupConflictPolicy = "skip";

type BackupSyncState = {
  version: typeof BACKUP_SYNC_STATE_VERSION;
  updatedAt: string;
  lastExportAt?: string;
  lastJournalOffset: number;
  runsIndexHash?: string;
};

type VaultManifest = {
  kind: typeof VAULT_KIND;
  formatVersion: typeof VAULT_FORMAT_VERSION;
  mode: BackupExportMode;
  createdAt: string;
  appVersion: string;
  conflictPolicy: {
    runId: BackupConflictPolicy;
    snapshotId: BackupConflictPolicy;
  };
  syncState?: {
    exportedAt: string;
    previousExportAt?: string;
    previousJournalOffset: number;
    currentJournalOffset: number;
    previousRunsIndexHash?: string;
    currentRunsIndexHash?: string;
  };
  schemaVersions: {
    profile: number;
    run: number;
    assumptions: number;
  };
  counts: {
    profiles: number;
    runs: number;
    runBlobs: number;
    actionPlans: number;
    actionProgress: number;
    assumptionsHistory: number;
    policies: number;
  };
  latestSnapshotId?: string;
  files: Record<string, { sizeBytes: number; sha256: string }>;
};

export type VaultPreviewSummary = {
  manifest: Pick<VaultManifest, "kind" | "formatVersion" | "mode" | "createdAt" | "appVersion" | "schemaVersions" | "counts" | "latestSnapshotId" | "conflictPolicy" | "syncState">;
  actual: {
    totalFiles: number;
    totalBytes: number;
    profiles: number;
    runs: number;
    runBlobs: number;
    actionPlans: number;
    actionProgress: number;
    assumptionsHistory: number;
    policies: number;
  };
  ids: {
    profileIds: string[];
    runIds: string[];
    snapshotIds: string[];
  };
  warnings: string[];
};

export type VaultRestoreIssue = {
  entity: "profile" | "run" | "runBlob" | "actionPlan" | "actionProgress" | "assumptions" | "policy";
  id?: string;
  path: string;
  message: string;
};

export type VaultRestoreSummary = {
  mode: RestoreMode;
  imported: {
    profiles: number;
    runs: number;
    runBlobs: number;
    actionPlans: number;
    actionProgress: number;
    assumptionsHistory: number;
    latestSnapshot: boolean;
    policies: number;
  };
  issues: VaultRestoreIssue[];
  warnings: string[];
  normalization?: {
    profiles: Array<{
      id: string;
      disclosure: ProfileNormalizationDisclosure;
    }>;
  };
};

type ParsedVault = {
  manifest: VaultManifest;
  entries: Map<string, Buffer>;
  warnings: string[];
};

type EncryptedBackupPackage = {
  kind: typeof ENCRYPTED_BACKUP_KIND;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  createdAt: string;
  kdf: VaultKdfParams;
  salt: string;
  envelope: VaultEncryptedEnvelope;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeZipPath(value: string): string {
  return value.trim().replaceAll("\\", "/");
}

function isSafeZipPath(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\")) return false;
  const tokens = value.split("/");
  if (tokens.some((token) => !token || token === "." || token === "..")) return false;
  return true;
}

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  const raw = asString(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function toDateOnly(value: unknown): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return new Date().toISOString().slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

function hashSha256(input: Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function resolveAssumptionsPath(): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolvePlanningDataDir(), "assumptions.latest.json");
}

function resolveAssumptionsHistoryDir(): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolvePlanningDataDir(), "assumptions", "history");
}

function normalizeSnapshotId(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return "";
  if (value.includes("/") || value.includes("\\")) return "";
  return value;
}

function resolveBackupSyncStatePath(): string {
  const override = asString(process.env.PLANNING_BACKUP_SYNC_STATE_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), BACKUP_SYNC_STATE_PATH);
}

function asIsoOrUndefined(value: unknown): string | undefined {
  const normalized = toIso(value, "");
  return normalized || undefined;
}

function parseBackupSyncState(raw: unknown): BackupSyncState | null {
  if (!isRecord(raw)) return null;
  const version = Math.trunc(Number(raw.version));
  if (version !== BACKUP_SYNC_STATE_VERSION) return null;
  const updatedAt = asIsoOrUndefined(raw.updatedAt);
  if (!updatedAt) return null;
  const lastJournalOffset = Math.max(0, Math.trunc(Number(raw.lastJournalOffset) || 0));
  const lastExportAt = asIsoOrUndefined(raw.lastExportAt);
  const runsIndexHash = asString(raw.runsIndexHash).toLowerCase();
  return {
    version: BACKUP_SYNC_STATE_VERSION,
    updatedAt,
    ...(lastExportAt ? { lastExportAt } : {}),
    lastJournalOffset,
    ...(runsIndexHash && /^[a-f0-9]{64}$/.test(runsIndexHash) ? { runsIndexHash } : {}),
  };
}

async function loadBackupSyncState(): Promise<BackupSyncState | null> {
  const loaded = await readJsonFile(resolveBackupSyncStatePath());
  return parseBackupSyncState(loaded);
}

async function saveBackupSyncState(state: BackupSyncState): Promise<void> {
  await writeJsonAtomic(resolveBackupSyncStatePath(), state);
}

async function readFileMtimeMs(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return 0;
    throw error;
  }
}

async function countJournalOffset(): Promise<number> {
  try {
    const events = await readStorageJournalEvents();
    return events.length;
  } catch {
    return 0;
  }
}

async function readRunsIndexHash(): Promise<string | undefined> {
  const loaded = await readStoredJsonBuffer(resolveRunsIndexPath());
  if (!loaded) return undefined;
  return hashSha256(loaded);
}

function maxTimestamp(values: number[]): number {
  const safe = values.filter((value) => Number.isFinite(value) && value > 0);
  if (safe.length < 1) return 0;
  return Math.max(...safe);
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}

async function writeStoreJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const stored = await encodeStoragePayload(payload);
  await writeJsonAtomic(filePath, stored);
}

function toBufferJson(payload: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function readAppVersion(): Promise<string> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = await readJsonFile(pkgPath);
    if (isRecord(pkg) && asString(pkg.version)) return asString(pkg.version);
  } catch {
    // ignore
  }
  return "0.0.0";
}

async function collectRunIds(): Promise<string[]> {
  const rows = await listRunIndexEntries({ limit: 5000, offset: 0 });
  const ids = new Set(rows.map((row) => sanitizeRecordId(row.id)));
  return [...ids].sort((a, b) => a.localeCompare(b));
}

async function readRunAssetMtimeMs(runId: string): Promise<number> {
  const run = await getRun(runId);
  if (!run) return 0;
  const runDir = resolveProfileRunDir(run.profileId, runId);
  const blobsDir = resolveProfileRunBlobsDir(run.profileId, runId);
  const legacyRunDir = resolveRunDir(runId);
  const legacyBlobsDir = resolveRunBlobsDir(runId);
  const metaPath = path.join(runDir, "run.json");
  const planPath = path.join(runDir, "action-plan.json");
  const progressPath = path.join(runDir, "action-progress.json");
  const blobMtimes = await Promise.all([
    readFileMtimeMs(metaPath),
    readFileMtimeMs(planPath),
    readFileMtimeMs(progressPath),
    readFileMtimeMs(blobsDir),
    readFileMtimeMs(path.join(legacyRunDir, "run.json")),
    readFileMtimeMs(path.join(legacyRunDir, "action-plan.json")),
    readFileMtimeMs(path.join(legacyRunDir, "action-progress.json")),
    readFileMtimeMs(legacyBlobsDir),
  ]);
  return maxTimestamp(blobMtimes);
}

async function collectRunBlobBuffers(runId: string, profileId?: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const blobsDir = profileId
    ? resolveProfileRunBlobsDir(profileId, runId)
    : resolveRunBlobsDir(runId);
  let entries;
  try {
    entries = await fs.readdir(blobsDir, { withFileTypes: true, encoding: "utf-8" });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".json")) continue;
    const blobName = entry.name.slice(0, -5);
    if (!blobName) continue;
    const loaded = await readFileIfExists(path.join(blobsDir, entry.name));
    if (!loaded) continue;
    try {
      const decoded = await decodeStoragePayload(JSON.parse(loaded.toString("utf-8")) as unknown);
      out.set(blobName, toBufferJson(decoded.payload));
    } catch {
      out.set(blobName, loaded);
    }
  }

  for (const name of KNOWN_BLOB_NAMES) {
    if (out.has(name)) continue;
    const blob = await getRunBlob(runId, name);
    if (blob === null || blob === undefined) continue;
    out.set(name, toBufferJson(blob));
  }

  return out;
}

async function readStoredJsonBuffer(filePath: string): Promise<Buffer | null> {
  const loaded = await readFileIfExists(filePath);
  if (!loaded) return null;
  try {
    const decoded = await decodeStoragePayload(JSON.parse(loaded.toString("utf-8")) as unknown);
    return toBufferJson(decoded.payload);
  } catch {
    return loaded;
  }
}

function parseVaultManifest(raw: unknown): VaultManifest {
  if (!isRecord(raw)) throw new Error("MANIFEST_INVALID_OBJECT");
  if (asString(raw.kind) !== VAULT_KIND) throw new Error("MANIFEST_KIND_INVALID");
  if (Math.trunc(Number(raw.formatVersion)) !== VAULT_FORMAT_VERSION) throw new Error("MANIFEST_VERSION_INVALID");
  const modeRaw = asString(raw.mode).toLowerCase();
  const mode: BackupExportMode = modeRaw === "delta" ? "delta" : "full";
  const createdAt = toIso(raw.createdAt, "");
  if (!createdAt) throw new Error("MANIFEST_CREATED_AT_INVALID");
  const appVersion = asString(raw.appVersion) || "0.0.0";
  const schemaVersionsRaw = isRecord(raw.schemaVersions) ? raw.schemaVersions : {};
  const countsRaw = isRecord(raw.counts) ? raw.counts : {};
  const filesRaw = isRecord(raw.files) ? raw.files : {};
  const conflictRaw = isRecord(raw.conflictPolicy) ? raw.conflictPolicy : {};
  const syncStateRaw = isRecord(raw.syncState) ? raw.syncState : null;

  const fileMap: Record<string, { sizeBytes: number; sha256: string }> = {};
  for (const [rawPath, row] of Object.entries(filesRaw)) {
    const entryPath = sanitizeZipPath(rawPath);
    if (!isSafeZipPath(entryPath) || !isRecord(row)) continue;
    const sizeBytes = Math.max(0, Math.trunc(Number(row.sizeBytes)));
    const sha256 = asString(row.sha256).toLowerCase();
    if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) continue;
    fileMap[entryPath] = { sizeBytes, sha256 };
  }

  return {
    kind: VAULT_KIND,
    formatVersion: VAULT_FORMAT_VERSION,
    mode,
    createdAt,
    appVersion,
    conflictPolicy: {
      runId: asString(conflictRaw.runId).toLowerCase() === "skip" ? "skip" : "skip",
      snapshotId: asString(conflictRaw.snapshotId).toLowerCase() === "skip" ? "skip" : "skip",
    },
    ...(syncStateRaw
      ? {
        syncState: {
          exportedAt: toIso(syncStateRaw.exportedAt, createdAt),
          ...(asIsoOrUndefined(syncStateRaw.previousExportAt)
            ? { previousExportAt: toIso(syncStateRaw.previousExportAt, createdAt) }
            : {}),
          previousJournalOffset: Math.max(0, Math.trunc(Number(syncStateRaw.previousJournalOffset) || 0)),
          currentJournalOffset: Math.max(0, Math.trunc(Number(syncStateRaw.currentJournalOffset) || 0)),
          ...(asString(syncStateRaw.previousRunsIndexHash)
            ? { previousRunsIndexHash: asString(syncStateRaw.previousRunsIndexHash).toLowerCase() }
            : {}),
          ...(asString(syncStateRaw.currentRunsIndexHash)
            ? { currentRunsIndexHash: asString(syncStateRaw.currentRunsIndexHash).toLowerCase() }
            : {}),
        },
      }
      : {}),
    schemaVersions: {
      profile: Math.max(1, Math.trunc(Number(schemaVersionsRaw.profile) || PROFILE_SCHEMA_VERSION)),
      run: Math.max(1, Math.trunc(Number(schemaVersionsRaw.run) || RUN_SCHEMA_VERSION)),
      assumptions: Math.max(1, Math.trunc(Number(schemaVersionsRaw.assumptions) || ASSUMPTIONS_SCHEMA_VERSION)),
    },
    counts: {
      profiles: Math.max(0, Math.trunc(Number(countsRaw.profiles) || 0)),
      runs: Math.max(0, Math.trunc(Number(countsRaw.runs) || 0)),
      runBlobs: Math.max(0, Math.trunc(Number(countsRaw.runBlobs) || 0)),
      actionPlans: Math.max(0, Math.trunc(Number(countsRaw.actionPlans) || 0)),
      actionProgress: Math.max(0, Math.trunc(Number(countsRaw.actionProgress) || 0)),
      assumptionsHistory: Math.max(0, Math.trunc(Number(countsRaw.assumptionsHistory) || 0)),
      policies: Math.max(0, Math.trunc(Number(countsRaw.policies) || 0)),
    },
    ...(asString(raw.latestSnapshotId) ? { latestSnapshotId: asString(raw.latestSnapshotId) } : {}),
    files: fileMap,
  };
}

function parseEncryptedBackupPackage(raw: unknown): EncryptedBackupPackage {
  if (!isRecord(raw)) {
    throw new Error("ENCRYPTED_PACKAGE_INVALID");
  }
  if (asString(raw.kind) !== ENCRYPTED_BACKUP_KIND) {
    throw new Error("ENCRYPTED_PACKAGE_KIND_INVALID");
  }
  if (Math.trunc(Number(raw.version)) !== ENCRYPTED_BACKUP_VERSION) {
    throw new Error("ENCRYPTED_PACKAGE_VERSION_INVALID");
  }
  const createdAt = toIso(raw.createdAt, "");
  if (!createdAt) {
    throw new Error("ENCRYPTED_PACKAGE_CREATED_AT_INVALID");
  }
  const kdfRaw = isRecord(raw.kdf) ? raw.kdf : {};
  const kdf: VaultKdfParams = {
    name: "scrypt",
    N: Math.trunc(Number(kdfRaw.N ?? DEFAULT_VAULT_KDF_PARAMS.N)),
    r: Math.trunc(Number(kdfRaw.r ?? DEFAULT_VAULT_KDF_PARAMS.r)),
    p: Math.trunc(Number(kdfRaw.p ?? DEFAULT_VAULT_KDF_PARAMS.p)),
    keyLength: Math.trunc(Number(kdfRaw.keyLength ?? DEFAULT_VAULT_KDF_PARAMS.keyLength)),
  };
  const salt = asString(raw.salt);
  if (!salt) {
    throw new Error("ENCRYPTED_PACKAGE_SALT_INVALID");
  }
  if (!isVaultEncryptedEnvelope(raw.envelope)) {
    throw new Error("ENCRYPTED_PACKAGE_ENVELOPE_INVALID");
  }
  return {
    kind: ENCRYPTED_BACKUP_KIND,
    version: ENCRYPTED_BACKUP_VERSION,
    createdAt,
    kdf,
    salt,
    envelope: raw.envelope,
  };
}

export async function encryptPlanningDataVaultArchive(
  zipBytes: Buffer,
  passphrase: string,
): Promise<Buffer> {
  const normalized = asString(passphrase);
  if (!normalized) {
    throw new Error("VAULT_PASSPHRASE_REQUIRED");
  }
  const salt = crypto.randomBytes(16);
  const kdf = { ...DEFAULT_VAULT_KDF_PARAMS };
  const key = await deriveKeyFromPassphrase(normalized, salt, kdf);
  const envelope = encryptBytesWithKey(key, zipBytes);
  const payload: EncryptedBackupPackage = {
    kind: ENCRYPTED_BACKUP_KIND,
    version: ENCRYPTED_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf,
    salt: salt.toString("base64"),
    envelope,
  };
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export async function decryptPlanningDataVaultArchive(
  encryptedBytes: Uint8Array | Buffer,
  passphrase: string,
): Promise<Buffer> {
  const normalized = asString(passphrase);
  if (!normalized) {
    throw new Error("VAULT_PASSPHRASE_REQUIRED");
  }
  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(Buffer.from(encryptedBytes).toString("utf-8")) as unknown;
  } catch {
    throw new Error("ENCRYPTED_PACKAGE_INVALID_JSON");
  }
  const payload = parseEncryptedBackupPackage(payloadRaw);
  const key = await deriveKeyFromPassphrase(normalized, Buffer.from(payload.salt, "base64"), payload.kdf);
  try {
    return decryptBytesWithKey(key, payload.envelope);
  } catch {
    throw new Error("VAULT_PASSPHRASE_INVALID");
  }
}

async function parseVault(
  bytes: Uint8Array | Buffer,
  limits: { maxEntries: number; maxBytes: number },
): Promise<ParsedVault> {
  const entries = await decodeZip(bytes, {
    maxEntries: limits.maxEntries,
    maxTotalBytes: limits.maxBytes,
    maxEntryBytes: limits.maxBytes,
  });
  const manifestBytes = entries.get(MANIFEST_PATH);
  if (!manifestBytes) {
    throw new Error("MANIFEST_NOT_FOUND");
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestBytes.toString("utf-8")) as unknown;
  } catch {
    throw new Error("MANIFEST_INVALID_JSON");
  }
  const manifest = parseVaultManifest(manifestRaw);
  const warnings: string[] = [];

  for (const [entryPath, meta] of Object.entries(manifest.files)) {
    const loaded = entries.get(entryPath);
    if (!loaded) {
      warnings.push(`manifest file missing: ${entryPath}`);
      continue;
    }
    const digest = hashSha256(loaded);
    if (digest !== meta.sha256) {
      warnings.push(`manifest hash mismatch: ${entryPath}`);
    }
    if (loaded.length !== meta.sizeBytes) {
      warnings.push(`manifest size mismatch: ${entryPath}`);
    }
  }

  return { manifest, entries, warnings };
}

function profilePathFromId(id: string): string {
  return `${PROFILE_DIR}/${id}.json`;
}

function profileOverridesPathFromId(id: string): string {
  return `${PROFILE_DIR}/${id}/${PROFILE_OVERRIDES_FILE}`;
}

function runMetaPath(runId: string): string {
  return `${RUN_DIR}/${runId}/run.json`;
}

function runBlobPath(runId: string, blobName: string): string {
  return `${RUN_DIR}/${runId}/blobs/${blobName}.json`;
}

function runActionPlanPath(runId: string): string {
  return `${RUN_DIR}/${runId}/action-plan.json`;
}

function runActionProgressPath(runId: string): string {
  return `${RUN_DIR}/${runId}/action-progress.json`;
}

function assumptionsHistoryPath(id: string): string {
  return `${ASSUMPTIONS_DIR}/history/${id}.json`;
}

function parseProfileEntryPath(entryPath: string): { id: string } | null {
  const matched = /^profiles\/([^/]+)\.json$/u.exec(entryPath);
  if (!matched) return null;
  const id = asString(matched[1]);
  if (!id) return null;
  return { id };
}

function parseProfileOverridesEntryPath(entryPath: string): { profileId: string } | null {
  const matched = /^profiles\/([^/]+)\/assumptions-overrides\.json$/u.exec(entryPath);
  if (!matched) return null;
  const profileId = asString(matched[1]);
  if (!profileId) return null;
  return { profileId };
}

function parseRunMetaEntryPath(entryPath: string): { runId: string } | null {
  const matched = /^runs\/([^/]+)\/run\.json$/u.exec(entryPath);
  if (!matched) return null;
  const runId = asString(matched[1]);
  if (!runId) return null;
  return { runId };
}

function parseRunBlobEntryPath(entryPath: string): { runId: string; blobName: string } | null {
  const matched = /^runs\/([^/]+)\/blobs\/([^/]+)\.json$/u.exec(entryPath);
  if (!matched) return null;
  const runId = asString(matched[1]);
  const blobName = asString(matched[2]);
  if (!runId || !blobName) return null;
  return { runId, blobName };
}

function parseRunActionPlanEntryPath(entryPath: string): { runId: string } | null {
  const matched = /^runs\/([^/]+)\/action-plan\.json$/u.exec(entryPath);
  if (!matched) return null;
  const runId = asString(matched[1]);
  if (!runId) return null;
  return { runId };
}

function parseRunActionProgressEntryPath(entryPath: string): { runId: string } | null {
  const matched = /^runs\/([^/]+)\/action-progress\.json$/u.exec(entryPath);
  if (!matched) return null;
  const runId = asString(matched[1]);
  if (!runId) return null;
  return { runId };
}

function parseAssumptionsHistoryPath(entryPath: string): { id: string } | null {
  const matched = /^assumptions\/history\/([^/]+)\.json$/u.exec(entryPath);
  if (!matched) return null;
  const id = normalizeSnapshotId(asString(matched[1]));
  if (!id) return null;
  return { id };
}

function parseActionPlan(raw: unknown, runId: string): PlanningRunActionPlan | null {
  if (!isRecord(raw) || Number(raw.version) !== 1) return null;
  if (asString(raw.runId) !== runId) return null;
  const generatedAt = toIso(raw.generatedAt, "");
  if (!generatedAt) return null;
  const items = asArray(raw.items)
    .map((row) => {
      if (!isRecord(row)) return null;
      const actionKey = asString(row.actionKey);
      const title = asString(row.title);
      const description = asString(row.description);
      if (!actionKey || !title || !description) return null;
      return {
        actionKey,
        ...(asString(row.sourceActionId) ? { sourceActionId: asString(row.sourceActionId) } : {}),
        title,
        description,
        steps: asArray(row.steps).map((entry) => asString(entry)).filter((entry) => entry.length > 0).slice(0, 20),
        ...(asString(row.href) ? { href: asString(row.href) } : {}),
      };
    })
    .filter((row): row is PlanningRunActionPlan["items"][number] => row !== null);
  return {
    version: 1,
    runId,
    generatedAt,
    items,
  };
}

function parseActionProgress(raw: unknown, runId: string): PlanningRunActionProgress | null {
  if (!isRecord(raw) || Number(raw.version) !== 1) return null;
  if (asString(raw.runId) !== runId) return null;
  const updatedAt = toIso(raw.updatedAt, "");
  if (!updatedAt) return null;
  const items = asArray(raw.items)
    .map((row) => {
      if (!isRecord(row)) return null;
      const actionKey = asString(row.actionKey);
      const status = asString(row.status);
      const itemUpdatedAt = toIso(row.updatedAt, "");
      if (!actionKey || !itemUpdatedAt) return null;
      if (!(status === "todo" || status === "doing" || status === "done" || status === "snoozed")) return null;
      return {
        actionKey,
        status,
        ...(asString(row.note) ? { note: asString(row.note) } : {}),
        ...(toIso(row.doneAt, "") ? { doneAt: toIso(row.doneAt, "") } : {}),
        updatedAt: itemUpdatedAt,
      };
    })
    .filter((row): row is PlanningRunActionProgress["items"][number] => row !== null);
  return {
    version: 1,
    runId,
    updatedAt,
    items,
  };
}

async function clearProfiles(): Promise<void> {
  const profiles = await listProfiles();
  for (const row of profiles) {
    await hardDeleteProfile(row.id);
    await fs.rm(resolveProfilePartitionDir(row.id), { recursive: true, force: true }).catch(() => undefined);
  }
}

async function clearRuns(): Promise<void> {
  const runIds = await collectRunIds();
  for (const id of runIds) {
    await hardDeleteRun(id);
  }
  await fs.unlink(resolveRunsIndexPath()).catch(() => undefined);
}

async function clearAssumptions(): Promise<void> {
  await fs.rm(resolveAssumptionsHistoryDir(), { recursive: true, force: true }).catch(() => undefined);
  await fs.unlink(resolveAssumptionsPath()).catch(() => undefined);
}

async function clearPolicies(): Promise<void> {
  await fs.unlink(path.join(resolveOpsDataDir(), OPS_AUTO_MERGE_POLICY_FILE)).catch(() => undefined);
}

function toManifestWithoutFiles(
  manifest: VaultManifest,
): Pick<VaultManifest, "kind" | "formatVersion" | "mode" | "createdAt" | "appVersion" | "schemaVersions" | "counts" | "latestSnapshotId" | "conflictPolicy" | "syncState"> {
  return {
    kind: manifest.kind,
    formatVersion: manifest.formatVersion,
    mode: manifest.mode,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    conflictPolicy: manifest.conflictPolicy,
    schemaVersions: manifest.schemaVersions,
    counts: manifest.counts,
    ...(manifest.latestSnapshotId ? { latestSnapshotId: manifest.latestSnapshotId } : {}),
    ...(manifest.syncState ? { syncState: manifest.syncState } : {}),
  };
}

export async function buildPlanningDataVaultZip(options?: {
  mode?: BackupExportMode;
}): Promise<{
  fileName: string;
  bytes: Buffer;
  manifest: VaultManifest;
}> {
  const mode: BackupExportMode = options?.mode === "delta" ? "delta" : "full";
  const previousState = await loadBackupSyncState();
  const deltaCutoffMs = mode === "delta" && previousState?.lastExportAt
    ? Math.max(0, Date.parse(previousState.lastExportAt))
    : 0;
  const fileEntries = new Map<string, Buffer>();
  const warnings: string[] = [];
  const appVersion = await readAppVersion();
  const nowIso = new Date().toISOString();
  const currentJournalOffset = await countJournalOffset();
  const currentRunsIndexHash = await readRunsIndexHash();

  const profiles = await listProfiles();
  for (const profile of profiles) {
    try {
      const safeId = sanitizeRecordId(profile.id);
      const profileUpdatedAtMs = Math.max(0, Date.parse(profile.updatedAt) || 0);
      if (mode === "delta" && deltaCutoffMs > 0 && profileUpdatedAtMs <= deltaCutoffMs) {
        continue;
      }
      fileEntries.set(profilePathFromId(safeId), toBufferJson(profile));
      const profileOverridesFilePath = path.join(resolveProfilePartitionDir(safeId), PROFILE_OVERRIDES_FILE);
      const profileOverridesMtimeMs = await readFileMtimeMs(profileOverridesFilePath);
      const overridesBytes = await readStoredJsonBuffer(profileOverridesFilePath);
      if (
        overridesBytes
        && (
          mode === "full"
          || deltaCutoffMs < 1
          || profileOverridesMtimeMs > deltaCutoffMs
        )
      ) {
        fileEntries.set(profileOverridesPathFromId(safeId), overridesBytes);
      }
    } catch (error) {
      warnings.push(`profile skipped: ${profile.id} (${error instanceof Error ? error.message : "invalid id"})`);
    }
  }

  const runIds = await collectRunIds();
  for (const runId of runIds) {
    const run = await getRun(runId);
    if (!run) {
      warnings.push(`run missing meta: ${runId}`);
      continue;
    }
    const createdAtMs = Math.max(0, Date.parse(run.createdAt) || 0);
    const runAssetMtimeMs = await readRunAssetMtimeMs(runId);
    if (
      mode === "delta"
      && deltaCutoffMs > 0
      && createdAtMs <= deltaCutoffMs
      && runAssetMtimeMs <= deltaCutoffMs
    ) {
      continue;
    }
    fileEntries.set(runMetaPath(runId), toBufferJson(run));

    const blobs = await collectRunBlobBuffers(runId, run.profileId);
    for (const [blobName, blobBytes] of blobs) {
      if (!blobName) continue;
      fileEntries.set(runBlobPath(runId, blobName), blobBytes);
    }

    const planBytes = await readStoredJsonBuffer(path.join(resolveProfileRunDir(run.profileId, runId), "action-plan.json"));
    if (planBytes) {
      fileEntries.set(runActionPlanPath(runId), planBytes);
    }
    const progressBytes = await readStoredJsonBuffer(path.join(resolveProfileRunDir(run.profileId, runId), "action-progress.json"));
    if (progressBytes) {
      fileEntries.set(runActionProgressPath(runId), progressBytes);
    }
  }

  const runsIndex = await readStoredJsonBuffer(resolveRunsIndexPath());
  const includeRunsIndex = mode === "full"
    || (mode === "delta" && (
      fileEntries.size > 0
      || previousState?.runsIndexHash !== currentRunsIndexHash
    ));
  if (runsIndex && includeRunsIndex) {
    fileEntries.set(`${RUN_DIR}/index.json`, runsIndex);
  }

  const latestSnapshot = await loadLatestAssumptionsSnapshot();
  const latestSnapshotPath = resolveAssumptionsPath();
  const latestSnapshotMtimeMs = await readFileMtimeMs(latestSnapshotPath);
  if (latestSnapshot && (mode === "full" || deltaCutoffMs < 1 || latestSnapshotMtimeMs > deltaCutoffMs)) {
    fileEntries.set(`${ASSUMPTIONS_DIR}/latest.json`, toBufferJson(latestSnapshot));
  }

  let latestSnapshotId: string | undefined;
  const historyDir = resolveAssumptionsHistoryDir();
  let historyEntries;
  try {
    historyEntries = await fs.readdir(historyDir, { withFileTypes: true, encoding: "utf-8" });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
    historyEntries = [];
  }

  for (const entry of historyEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = normalizeSnapshotId(entry.name.slice(0, -5));
    if (!id) continue;
    const historyPath = path.join(historyDir, entry.name);
    const historyMtimeMs = await readFileMtimeMs(historyPath);
    if (mode === "delta" && deltaCutoffMs > 0 && historyMtimeMs <= deltaCutoffMs) {
      continue;
    }
    const snapshot = await loadAssumptionsSnapshotById(id);
    if (!snapshot) continue;
    fileEntries.set(assumptionsHistoryPath(id), toBufferJson(snapshot));
    if (latestSnapshot && snapshot.asOf === latestSnapshot.asOf && snapshot.fetchedAt === latestSnapshot.fetchedAt) {
      latestSnapshotId = id;
    }
  }

  const policyPath = path.join(resolveOpsDataDir(), OPS_AUTO_MERGE_POLICY_FILE);
  const policyMtimeMs = await readFileMtimeMs(policyPath);
  const policyBytes = await readFileIfExists(policyPath);
  if (policyBytes && (mode === "full" || deltaCutoffMs < 1 || policyMtimeMs > deltaCutoffMs)) {
    fileEntries.set(`${POLICIES_DIR}/ops-auto-merge-policy.json`, policyBytes);
  }

  const manifestFiles: VaultManifest["files"] = {};
  for (const [entryPath, bytes] of fileEntries) {
    manifestFiles[entryPath] = {
      sizeBytes: bytes.length,
      sha256: hashSha256(bytes),
    };
  }

  const counts = {
    profiles: [...fileEntries.keys()].filter((entryPath) => parseProfileEntryPath(entryPath)).length,
    runs: [...fileEntries.keys()].filter((entryPath) => parseRunMetaEntryPath(entryPath)).length,
    runBlobs: [...fileEntries.keys()].filter((entryPath) => parseRunBlobEntryPath(entryPath)).length,
    actionPlans: [...fileEntries.keys()].filter((entryPath) => parseRunActionPlanEntryPath(entryPath)).length,
    actionProgress: [...fileEntries.keys()].filter((entryPath) => parseRunActionProgressEntryPath(entryPath)).length,
    assumptionsHistory: [...fileEntries.keys()].filter((entryPath) => parseAssumptionsHistoryPath(entryPath)).length,
    policies: [...fileEntries.keys()].filter((entryPath) => entryPath.startsWith(`${POLICIES_DIR}/`)).length,
  };

  const manifest: VaultManifest = {
    kind: VAULT_KIND,
    formatVersion: VAULT_FORMAT_VERSION,
    mode,
    createdAt: nowIso,
    appVersion,
    conflictPolicy: {
      runId: "skip",
      snapshotId: "skip",
    },
    syncState: {
      exportedAt: nowIso,
      ...(previousState?.lastExportAt ? { previousExportAt: previousState.lastExportAt } : {}),
      previousJournalOffset: previousState?.lastJournalOffset ?? 0,
      currentJournalOffset,
      ...(previousState?.runsIndexHash ? { previousRunsIndexHash: previousState.runsIndexHash } : {}),
      ...(currentRunsIndexHash ? { currentRunsIndexHash } : {}),
    },
    schemaVersions: {
      profile: PROFILE_SCHEMA_VERSION,
      run: RUN_SCHEMA_VERSION,
      assumptions: ASSUMPTIONS_SCHEMA_VERSION,
    },
    counts,
    ...(latestSnapshotId ? { latestSnapshotId } : {}),
    files: manifestFiles,
  };
  fileEntries.set(MANIFEST_PATH, toBufferJson(manifest));

  if (warnings.length > 0) {
    fileEntries.set("warnings.txt", Buffer.from(`${warnings.join("\n")}\n`, "utf-8"));
  }

  const zipEntries: ZipFileEntry[] = [...fileEntries.entries()].map(([entryPath, bytes]) => ({
    path: entryPath,
    bytes,
  }));
  const zipBuffer = encodeZip(zipEntries);
  const stamp = nowIso.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  await saveBackupSyncState({
    version: BACKUP_SYNC_STATE_VERSION,
    updatedAt: nowIso,
    lastExportAt: nowIso,
    lastJournalOffset: currentJournalOffset,
    ...(currentRunsIndexHash ? { runsIndexHash: currentRunsIndexHash } : {}),
  });
  return {
    fileName: mode === "delta"
      ? `planning-data-vault-delta-${stamp}.zip`
      : `planning-data-vault-${stamp}.zip`,
    bytes: zipBuffer,
    manifest,
  };
}

export async function previewPlanningDataVaultZip(
  bytes: Uint8Array | Buffer,
  options: { maxEntries: number; maxBytes: number; maxPreviewIds: number },
): Promise<VaultPreviewSummary> {
  const parsed = await parseVault(bytes, {
    maxEntries: options.maxEntries,
    maxBytes: options.maxBytes,
  });
  const profileIds = [...parsed.entries.keys()]
    .map((entryPath) => parseProfileEntryPath(entryPath))
    .filter((row): row is { id: string } => row !== null)
    .map((row) => row.id)
    .sort((a, b) => a.localeCompare(b));
  const runIds = [...parsed.entries.keys()]
    .map((entryPath) => parseRunMetaEntryPath(entryPath))
    .filter((row): row is { runId: string } => row !== null)
    .map((row) => row.runId)
    .sort((a, b) => a.localeCompare(b));
  const snapshotIds = [...parsed.entries.keys()]
    .map((entryPath) => parseAssumptionsHistoryPath(entryPath))
    .filter((row): row is { id: string } => row !== null)
    .map((row) => row.id)
    .sort((a, b) => a.localeCompare(b));

  const totalBytes = [...parsed.entries.values()].reduce((sum, fileBytes) => sum + fileBytes.length, 0);
  const actual = {
    totalFiles: parsed.entries.size,
    totalBytes,
    profiles: profileIds.length,
    runs: runIds.length,
    runBlobs: [...parsed.entries.keys()].filter((entryPath) => parseRunBlobEntryPath(entryPath)).length,
    actionPlans: [...parsed.entries.keys()].filter((entryPath) => parseRunActionPlanEntryPath(entryPath)).length,
    actionProgress: [...parsed.entries.keys()].filter((entryPath) => parseRunActionProgressEntryPath(entryPath)).length,
    assumptionsHistory: snapshotIds.length,
    policies: [...parsed.entries.keys()].filter((entryPath) => entryPath.startsWith(`${POLICIES_DIR}/`)).length,
  };

  const warnings = [...parsed.warnings];
  if (parsed.manifest.counts.profiles !== actual.profiles) warnings.push("manifest counts mismatch: profiles");
  if (parsed.manifest.counts.runs !== actual.runs) warnings.push("manifest counts mismatch: runs");
  if (parsed.manifest.counts.assumptionsHistory !== actual.assumptionsHistory) warnings.push("manifest counts mismatch: assumptionsHistory");

  return {
    manifest: toManifestWithoutFiles(parsed.manifest),
    actual,
    ids: {
      profileIds: profileIds.slice(0, options.maxPreviewIds),
      runIds: runIds.slice(0, options.maxPreviewIds),
      snapshotIds: snapshotIds.slice(0, options.maxPreviewIds),
    },
    warnings,
  };
}

export async function restorePlanningDataVaultZip(
  bytes: Uint8Array | Buffer,
  options: { maxEntries: number; maxBytes: number; mode: RestoreMode },
): Promise<VaultRestoreSummary> {
  const parsed = await parseVault(bytes, {
    maxEntries: options.maxEntries,
    maxBytes: options.maxBytes,
  });
  const issues: VaultRestoreIssue[] = [];
  const warnings = [...parsed.warnings];
  const normalizationProfiles: Array<{ id: string; disclosure: ProfileNormalizationDisclosure }> = [];
  const imported = {
    profiles: 0,
    runs: 0,
    runBlobs: 0,
    actionPlans: 0,
    actionProgress: 0,
    assumptionsHistory: 0,
    latestSnapshot: false,
    policies: 0,
  };

  if (options.mode === "replace") {
    await clearProfiles();
    await clearRuns();
    await clearAssumptions();
    await clearPolicies();
  }
  const deltaMergeMode = options.mode !== "replace" && parsed.manifest.mode === "delta";

  // profiles
  const profilePaths = [...parsed.entries.keys()]
    .filter((entryPath) => parseProfileEntryPath(entryPath))
    .sort((a, b) => a.localeCompare(b));
  for (const entryPath of profilePaths) {
    const idFromPath = parseProfileEntryPath(entryPath)?.id ?? "";
    const bytesRow = parsed.entries.get(entryPath);
    if (!bytesRow) continue;
    try {
      const raw = JSON.parse(bytesRow.toString("utf-8")) as unknown;
      const row = isRecord(raw) ? raw : {};
      const fallbackId = sanitizeRecordId(idFromPath || crypto.randomUUID());
      const id = sanitizeRecordId(asString(row.id) || fallbackId);
      const name = asString(row.name) || id;
      const profilePayload = isRecord(row.profile) ? row.profile : row;
      const canonical = loadCanonicalProfile(profilePayload);
      await upsertProfileRecord({
        id,
        name,
        profile: canonical.profile as Parameters<typeof upsertProfileRecord>[0]["profile"],
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      });
      if (canonical.normalization.defaultsApplied.length > 0 || canonical.normalization.fixesApplied.length > 0) {
        normalizationProfiles.push({
          id,
          disclosure: canonical.normalization,
        });
      }
      imported.profiles += 1;
    } catch (error) {
      issues.push({
        entity: "profile",
        id: idFromPath || undefined,
        path: entryPath,
        message: error instanceof Error ? error.message : "profile restore failed",
      });
    }
  }

  const profileOverridesPaths = [...parsed.entries.keys()]
    .filter((entryPath) => parseProfileOverridesEntryPath(entryPath))
    .sort((a, b) => a.localeCompare(b));
  for (const entryPath of profileOverridesPaths) {
    const parsedProfileId = parseProfileOverridesEntryPath(entryPath)?.profileId ?? "";
    const bytesRow = parsed.entries.get(entryPath);
    if (!bytesRow) continue;
    try {
      const raw = JSON.parse(bytesRow.toString("utf-8")) as unknown;
      const safeProfileId = sanitizeRecordId(parsedProfileId);
      const payload = isRecord(raw) && Array.isArray(raw.items) ? raw.items : raw;
      await saveAssumptionsOverrides(payload, safeProfileId);
    } catch (error) {
      issues.push({
        entity: "profile",
        id: parsedProfileId || undefined,
        path: entryPath,
        message: error instanceof Error ? error.message : "profile overrides restore failed",
      });
    }
  }

  // runs and run assets
  const runPaths = [...parsed.entries.keys()]
    .filter((entryPath) => parseRunMetaEntryPath(entryPath))
    .sort((a, b) => a.localeCompare(b));
  for (const entryPath of runPaths) {
    const runId = parseRunMetaEntryPath(entryPath)?.runId ?? "";
    const bytesRow = parsed.entries.get(entryPath);
    if (!bytesRow) continue;
    try {
      const raw = JSON.parse(bytesRow.toString("utf-8")) as unknown;
      const canonical = loadCanonicalRun(raw);
      const safeRunId = sanitizeRecordId(canonical.run.id || runId);

      const outputs: PlanningRunRecord["outputs"] = {
        ...canonical.run.outputs,
      };

      const runBlobPaths = [...parsed.entries.keys()]
        .filter((candidate) => parseRunBlobEntryPath(candidate)?.runId === safeRunId);
      for (const blobPath of runBlobPaths) {
        const blobMeta = parseRunBlobEntryPath(blobPath);
        if (!blobMeta) continue;
        const blobBytes = parsed.entries.get(blobPath);
        if (!blobBytes) continue;
        try {
          const blobRaw = JSON.parse(blobBytes.toString("utf-8")) as unknown;
          if (blobMeta.blobName === "simulate") {
            outputs.simulate = blobRaw as PlanningRunRecord["outputs"]["simulate"];
          } else if (blobMeta.blobName === "scenarios") {
            outputs.scenarios = blobRaw as PlanningRunRecord["outputs"]["scenarios"];
          } else if (blobMeta.blobName === "monteCarlo") {
            outputs.monteCarlo = blobRaw as PlanningRunRecord["outputs"]["monteCarlo"];
          } else if (blobMeta.blobName === "actions") {
            outputs.actions = blobRaw as PlanningRunRecord["outputs"]["actions"];
          } else if (blobMeta.blobName === "debtStrategy") {
            outputs.debtStrategy = blobRaw as PlanningRunRecord["outputs"]["debtStrategy"];
          } else {
            warnings.push(`unknown run blob skipped: ${blobPath}`);
            continue;
          }
          imported.runBlobs += 1;
        } catch (error) {
          issues.push({
            entity: "runBlob",
            id: safeRunId,
            path: blobPath,
            message: error instanceof Error ? error.message : "run blob restore failed",
          });
        }
      }

      if (await getRun(safeRunId)) {
        if (deltaMergeMode) {
          warnings.push(`delta conflict skipped: run ${safeRunId} already exists`);
          continue;
        }
        await hardDeleteRun(safeRunId);
      }

      await createRun({
        ...canonical.run,
        id: safeRunId,
        createdAt: toIso(canonical.run.createdAt),
        outputs,
      }, {
        enforceRetention: false,
        storeRawOutputs: true,
      });
      imported.runs += 1;

      const planPath = runActionPlanPath(safeRunId);
      const planBytes = parsed.entries.get(planPath);
      if (planBytes) {
        try {
          const planRaw = JSON.parse(planBytes.toString("utf-8")) as unknown;
          const plan = parseActionPlan(planRaw, safeRunId);
          if (!plan) throw new Error("INVALID_ACTION_PLAN");
          await writeStoreJsonAtomic(path.join(resolveProfileRunDir(canonical.run.profileId, safeRunId), "action-plan.json"), plan);
          imported.actionPlans += 1;
        } catch (error) {
          issues.push({
            entity: "actionPlan",
            id: safeRunId,
            path: planPath,
            message: error instanceof Error ? error.message : "action plan restore failed",
          });
        }
      }

      const progressPath = runActionProgressPath(safeRunId);
      const progressBytes = parsed.entries.get(progressPath);
      if (progressBytes) {
        try {
          const progressRaw = JSON.parse(progressBytes.toString("utf-8")) as unknown;
          const progress = parseActionProgress(progressRaw, safeRunId);
          if (!progress) throw new Error("INVALID_ACTION_PROGRESS");
          await writeStoreJsonAtomic(path.join(resolveProfileRunDir(canonical.run.profileId, safeRunId), "action-progress.json"), progress);
          imported.actionProgress += 1;
        } catch (error) {
          issues.push({
            entity: "actionProgress",
            id: safeRunId,
            path: progressPath,
            message: error instanceof Error ? error.message : "action progress restore failed",
          });
        }
      }
    } catch (error) {
      issues.push({
        entity: "run",
        id: runId || undefined,
        path: entryPath,
        message: error instanceof Error ? error.message : "run restore failed",
      });
    }
  }

  // assumptions history
  const assumptionsPaths = [...parsed.entries.keys()]
    .filter((entryPath) => parseAssumptionsHistoryPath(entryPath))
    .sort((a, b) => a.localeCompare(b));
  for (const entryPath of assumptionsPaths) {
    const snapshotId = parseAssumptionsHistoryPath(entryPath)?.id ?? "";
    const bytesRow = parsed.entries.get(entryPath);
    if (!bytesRow) continue;
    try {
      const raw = JSON.parse(bytesRow.toString("utf-8")) as unknown;
      const migrated = migrateAssumptionsSnapshot(raw);
      if (!migrated.ok) {
        throw new Error(migrated.errors.join(", ") || "snapshot migration failed");
      }
      const snapshotData = migrated.data;
      if (!snapshotData) {
        throw new Error("snapshot migration returned empty payload");
      }
      const safeId = normalizeSnapshotId(snapshotId);
      if (!safeId) throw new Error("INVALID_SNAPSHOT_ID");
      if (deltaMergeMode) {
        const existingSnapshot = await loadAssumptionsSnapshotById(safeId);
        if (existingSnapshot) {
          warnings.push(`delta conflict skipped: snapshot ${safeId} already exists`);
          continue;
        }
      }
      await writeStoreJsonAtomic(path.join(resolveAssumptionsHistoryDir(), `${safeId}.json`), {
        ...snapshotData,
        asOf: toDateOnly(snapshotData.asOf),
        fetchedAt: toIso(snapshotData.fetchedAt),
      });
      imported.assumptionsHistory += 1;
    } catch (error) {
      issues.push({
        entity: "assumptions",
        id: snapshotId || undefined,
        path: entryPath,
        message: error instanceof Error ? error.message : "assumptions restore failed",
      });
    }
  }

  // latest snapshot
  const latestPath = `${ASSUMPTIONS_DIR}/latest.json`;
  const latestBytes = parsed.entries.get(latestPath);
  if (latestBytes) {
    try {
      const raw = JSON.parse(latestBytes.toString("utf-8")) as unknown;
      const migrated = migrateAssumptionsSnapshot(raw);
      if (!migrated.ok) {
        throw new Error(migrated.errors.join(", ") || "latest snapshot migration failed");
      }
      const snapshotData = migrated.data;
      if (!snapshotData) {
        throw new Error("latest snapshot migration returned empty payload");
      }
      await saveLatestAssumptionsSnapshot({
        ...snapshotData,
        version: 1,
        asOf: toDateOnly(snapshotData.asOf),
        fetchedAt: toIso(snapshotData.fetchedAt),
      });
      imported.latestSnapshot = true;
    } catch (error) {
      issues.push({
        entity: "assumptions",
        path: latestPath,
        message: error instanceof Error ? error.message : "latest snapshot restore failed",
      });
    }
  }

  // policies
  const autoMergePolicyEntry = `${POLICIES_DIR}/ops-auto-merge-policy.json`;
  const policyBytes = parsed.entries.get(autoMergePolicyEntry);
  if (policyBytes) {
    try {
      const payload = JSON.parse(policyBytes.toString("utf-8")) as unknown;
      await writeJsonAtomic(path.join(resolveOpsDataDir(), OPS_AUTO_MERGE_POLICY_FILE), payload);
      imported.policies += 1;
    } catch (error) {
      issues.push({
        entity: "policy",
        path: autoMergePolicyEntry,
        message: error instanceof Error ? error.message : "policy restore failed",
      });
    }
  }

  return {
    mode: options.mode,
    imported,
    issues,
    warnings,
    ...(normalizationProfiles.length > 0 ? { normalization: { profiles: normalizationProfiles } } : {}),
  };
}
