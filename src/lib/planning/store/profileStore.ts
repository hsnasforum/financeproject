import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { runPlanningMigrationsOnStartup } from "../migrations/manager";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";
import { resolvePlanningDataDir } from "../storage/dataDir";
import { type ProfileV2 } from "../v2/types";
import { loadCanonicalProfile } from "../v2/loadCanonicalProfile";
import { PROFILE_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  resolveProfilePath,
  resolveProfilePartitionsDir,
  resolveProfileRecordPath,
  resolveProfilesDir,
  sanitizeRecordId,
} from "./paths";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  restoreFileFromTrash,
} from "./trash";
import { type PlanningProfileMeta, type PlanningProfileRecord } from "./types";

type ProfilePatch = {
  name?: string;
  profile?: ProfileV2;
};

type CreateProfileInput = {
  name: string;
  profile: ProfileV2;
};

type UpsertProfileRecordInput = {
  id: string;
  name: string;
  profile: ProfileV2;
  createdAt?: string;
  updatedAt?: string;
};

type ProfileMetaState = {
  version: 1;
  defaultProfileId?: string;
};

type ProfileRegistryState = {
  version: 1;
  defaultProfileId?: string;
  profiles: Array<{
    profileId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

const PROFILE_META_VERSION = 1;
const PROFILE_REGISTRY_VERSION = 1;
const DEFAULT_PROFILE_ID = "default-profile";
const DEFAULT_PROFILE_NAME = "기본 프로필";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning profile store is server-only.");
  }
}

assertServerOnly();

async function ensureStartupMigrations(): Promise<void> {
  try {
    await runPlanningMigrationsOnStartup();
  } catch {
    // ignore here; /ops/doctor exposes migration failures explicitly
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isProfileRecord(value: unknown): value is PlanningProfileRecord {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.schemaVersion !== undefined) {
    const schemaVersion = Math.trunc(Number(value.schemaVersion));
    if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > PROFILE_SCHEMA_VERSION) return false;
  }
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (typeof value.name !== "string" || !value.name.trim()) return false;
  if (!isRecord(value.profile)) return false;
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) return false;
  if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return false;
  return true;
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name || DEFAULT_PROFILE_NAME;
}

function normalizeIso(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function sortByUpdatedAtDesc(records: PlanningProfileRecord[]): PlanningProfileRecord[] {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.updatedAt);
    const bTs = Date.parse(b.updatedAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
}

function resolveProfileMetaPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_PROFILE_META_PATH);
  if (override) return path.resolve(cwd, override);

  const registryOverride = asString(process.env.PLANNING_PROFILE_REGISTRY_PATH);
  if (registryOverride) {
    return path.join(path.dirname(path.resolve(cwd, registryOverride)), "profiles.meta.json");
  }

  const partitionsOverride = asString(process.env.PLANNING_PROFILE_PARTITIONS_DIR);
  if (partitionsOverride) {
    return path.join(path.dirname(path.resolve(cwd, partitionsOverride)), "profiles.meta.json");
  }

  const profilesOverride = asString(process.env.PLANNING_PROFILES_DIR);
  if (profilesOverride) {
    const profilesDir = path.resolve(cwd, profilesOverride);
    return path.join(path.dirname(profilesDir), "vault", "profiles.meta.json");
  }

  const runsOverride = asString(process.env.PLANNING_RUNS_DIR);
  if (runsOverride) {
    const runsDir = path.resolve(cwd, runsOverride);
    return path.join(path.dirname(runsDir), "vault", "profiles.meta.json");
  }

  return path.join(resolvePlanningDataDir({ cwd }), "vault", "profiles.meta.json");
}

function resolveProfileRegistryPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_PROFILE_REGISTRY_PATH);
  if (override) return path.resolve(cwd, override);

  const partitionsOverride = asString(process.env.PLANNING_PROFILE_PARTITIONS_DIR);
  if (partitionsOverride) {
    return path.join(path.resolve(cwd, partitionsOverride), "index.json");
  }

  const profilesOverride = asString(process.env.PLANNING_PROFILES_DIR);
  if (profilesOverride) {
    const profilesDir = path.resolve(cwd, profilesOverride);
    return path.join(path.dirname(profilesDir), "vault", "profiles", "index.json");
  }

  const runsOverride = asString(process.env.PLANNING_RUNS_DIR);
  if (runsOverride) {
    const runsDir = path.resolve(cwd, runsOverride);
    return path.join(path.dirname(runsDir), "vault", "profiles", "index.json");
  }

  return path.join(resolvePlanningDataDir({ cwd }), "vault", "profiles", "index.json");
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}

async function toStoredPayload(payload: unknown): Promise<unknown> {
  return encodeStoragePayload(payload);
}

function isRecoverableJsonReadError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT") return true;
  return error instanceof SyntaxError;
}

async function readProfileFile(filePath: string): Promise<PlanningProfileRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    const parsed = decoded.payload;
    if (!isProfileRecord(parsed)) return null;
    const canonical = loadCanonicalProfile(parsed.profile);
    const record = {
      ...parsed,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile: canonical.profile,
    };
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, await toStoredPayload(record));
    }
    return record;
  } catch (error) {
    if (isRecoverableJsonReadError(error)) return null;
    throw error;
  }
}

async function readProfileMetaState(): Promise<ProfileMetaState> {
  const filePath = resolveProfileMetaPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    if (!isRecord(decoded.payload)) {
      return { version: PROFILE_META_VERSION };
    }
    const payload = decoded.payload as Record<string, unknown>;
    if (Math.trunc(Number(payload.version)) !== PROFILE_META_VERSION) {
      return { version: PROFILE_META_VERSION };
    }
    const state: ProfileMetaState = {
      version: PROFILE_META_VERSION,
      ...(asString(payload.defaultProfileId) ? { defaultProfileId: asString(payload.defaultProfileId) } : {}),
    };
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, await toStoredPayload(state));
    }
    return state;
  } catch (error) {
    if (isRecoverableJsonReadError(error)) {
      return { version: PROFILE_META_VERSION };
    }
    throw error;
  }
}

async function writeProfileMetaState(state: ProfileMetaState): Promise<void> {
  const filePath = resolveProfileMetaPath();
  await writeJsonAtomic(filePath, await toStoredPayload({
    version: PROFILE_META_VERSION,
    ...(asString(state.defaultProfileId) ? { defaultProfileId: asString(state.defaultProfileId) } : {}),
  }));
}

function toProfileRegistryState(
  records: PlanningProfileRecord[],
  defaultProfileId?: string,
): ProfileRegistryState {
  return {
    version: PROFILE_REGISTRY_VERSION,
    ...(asString(defaultProfileId) ? { defaultProfileId: asString(defaultProfileId) } : {}),
    profiles: sortByUpdatedAtDesc(records).map((record) => ({
      profileId: record.id,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })),
  };
}

async function readProfileRegistryState(): Promise<ProfileRegistryState | null> {
  const filePath = resolveProfileRegistryPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    if (!isRecord(decoded.payload)) return null;
    const payload = decoded.payload as Record<string, unknown>;
    if (Math.trunc(Number(payload.version)) !== PROFILE_REGISTRY_VERSION) return null;
    const profiles = Array.isArray(payload.profiles)
      ? payload.profiles.map((entry) => {
        const row = isRecord(entry) ? entry : {};
        const profileId = asString(row.profileId);
        const name = normalizeName(row.name);
        const fallback = new Date().toISOString();
        const createdAt = normalizeIso(row.createdAt, fallback);
        const updatedAt = normalizeIso(row.updatedAt, createdAt);
        if (!profileId) return null;
        return {
          profileId,
          name,
          createdAt,
          updatedAt,
        };
      }).filter((entry): entry is ProfileRegistryState["profiles"][number] => entry !== null)
      : [];
    const out: ProfileRegistryState = {
      version: PROFILE_REGISTRY_VERSION,
      ...(asString(payload.defaultProfileId) ? { defaultProfileId: asString(payload.defaultProfileId) } : {}),
      profiles,
    };
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, await toStoredPayload(out));
    }
    return out;
  } catch (error) {
    if (isRecoverableJsonReadError(error)) return null;
    throw error;
  }
}

async function writeProfileRegistryState(state: ProfileRegistryState): Promise<void> {
  const filePath = resolveProfileRegistryPath();
  await writeJsonAtomic(filePath, await toStoredPayload(state));
}

async function syncProfileRegistry(records: PlanningProfileRecord[], defaultProfileId?: string): Promise<void> {
  const fileState = toProfileRegistryState(records, defaultProfileId);
  await writeProfileRegistryState(fileState);
}

async function listPartitionProfiles(): Promise<PlanningProfileRecord[]> {
  const dirPath = resolveProfilePartitionsDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const records: PlanningProfileRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = asString(entry.name);
    if (!id) continue;
    try {
      const safeId = sanitizeRecordId(id);
      const filePath = resolveProfileRecordPath(safeId);
      const profile = await readProfileFile(filePath);
      if (profile) records.push(profile);
    } catch {
      continue;
    }
  }
  return records;
}

async function listLegacyProfiles(): Promise<PlanningProfileRecord[]> {
  const dirPath = resolveProfilesDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const records: PlanningProfileRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(dirPath, entry.name);
    const profile = await readProfileFile(filePath);
    if (profile) records.push(profile);
  }
  return records;
}

async function migrateLegacyProfileRecord(profile: PlanningProfileRecord): Promise<void> {
  const safeId = sanitizeRecordId(profile.id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const legacyPath = resolveProfilePath(safeId);

  const existing = await readProfileFile(partitionPath);
  if (!existing) {
    await writeJsonAtomic(partitionPath, await toStoredPayload(profile));
  }
  await fs.unlink(legacyPath).catch(() => undefined);
}

function defaultProfileShape(): ProfileV2 {
  return {
    monthlyIncomeNet: 0,
    monthlyEssentialExpenses: 0,
    monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
  };
}

async function ensureDefaultProfileRecord(records: PlanningProfileRecord[]): Promise<PlanningProfileRecord[]> {
  if (records.length > 0) return records;

  const now = new Date().toISOString();
  const canonical = loadCanonicalProfile(defaultProfileShape());
  const record: PlanningProfileRecord = {
    version: 1,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    profile: canonical.profile,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonAtomic(resolveProfileRecordPath(DEFAULT_PROFILE_ID), await toStoredPayload(record));
  return [record];
}

async function loadAllProfilesWithMigration(): Promise<PlanningProfileRecord[]> {
  const partition = await listPartitionProfiles();
  const byId = new Map<string, PlanningProfileRecord>();
  for (const record of partition) {
    byId.set(record.id, record);
  }

  const legacy = await listLegacyProfiles();
  for (const record of legacy) {
    if (!byId.has(record.id)) {
      byId.set(record.id, record);
    }
    await migrateLegacyProfileRecord(record);
  }

  const ensured = await ensureDefaultProfileRecord([...byId.values()]);
  return sortByUpdatedAtDesc(ensured);
}

async function resolveDefaultProfileId(records: PlanningProfileRecord[]): Promise<string | undefined> {
  if (records.length < 1) return undefined;
  const state = await readProfileMetaState();
  const registry = await readProfileRegistryState();
  const candidates = [
    asString(state.defaultProfileId),
    asString(registry?.defaultProfileId),
  ].filter((entry) => entry.length > 0);
  for (const candidate of candidates) {
    if (!records.some((row) => row.id === candidate)) continue;
    await writeProfileMetaState({
      version: PROFILE_META_VERSION,
      defaultProfileId: candidate,
    });
    await syncProfileRegistry(records, candidate);
    return candidate;
  }

  const nextDefault = records[0].id;
  await writeProfileMetaState({
    version: PROFILE_META_VERSION,
    defaultProfileId: nextDefault,
  });
  await syncProfileRegistry(records, nextDefault);
  return nextDefault;
}

async function ensureDefaultProfileAfterMutation(): Promise<void> {
  const records = await loadAllProfilesWithMigration();
  const defaultProfileId = await resolveDefaultProfileId(records);
  await syncProfileRegistry(records, defaultProfileId);
}

export async function listProfiles(): Promise<PlanningProfileRecord[]> {
  assertServerOnly();
  await ensureStartupMigrations();
  const records = await loadAllProfilesWithMigration();
  await resolveDefaultProfileId(records);
  return records;
}

export async function listProfileMetas(): Promise<PlanningProfileMeta[]> {
  assertServerOnly();
  await ensureStartupMigrations();
  const records = await loadAllProfilesWithMigration();
  const defaultProfileId = await resolveDefaultProfileId(records);
  return records.map((record) => ({
    profileId: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isDefault: record.id === defaultProfileId,
  }));
}

export async function getDefaultProfileId(): Promise<string | undefined> {
  assertServerOnly();
  await ensureStartupMigrations();
  const records = await loadAllProfilesWithMigration();
  return resolveDefaultProfileId(records);
}

export async function setDefaultProfile(profileId: string): Promise<string> {
  assertServerOnly();
  const safeProfileId = sanitizeRecordId(profileId);
  const record = await getProfile(safeProfileId);
  if (!record) {
    throw new Error("PROFILE_NOT_FOUND");
  }
  await writeProfileMetaState({
    version: PROFILE_META_VERSION,
    defaultProfileId: safeProfileId,
  });
  const records = await loadAllProfilesWithMigration();
  await syncProfileRegistry(records, safeProfileId);
  return safeProfileId;
}

export async function getProfile(id: string): Promise<PlanningProfileRecord | null> {
  assertServerOnly();
  await ensureStartupMigrations();

  const safeId = sanitizeRecordId(id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const fromPartition = await readProfileFile(partitionPath);
  if (fromPartition) return fromPartition;

  const legacyPath = resolveProfilePath(safeId);
  const fromLegacy = await readProfileFile(legacyPath);
  if (!fromLegacy) return null;

  await migrateLegacyProfileRecord(fromLegacy);
  return fromLegacy;
}

export async function createProfile(input: CreateProfileInput): Promise<PlanningProfileRecord> {
  assertServerOnly();
  await ensureStartupMigrations();

  const canonical = loadCanonicalProfile(input.profile);
  const now = new Date().toISOString();
  const record: PlanningProfileRecord = {
    version: 1,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: normalizeName(input.name),
    profile: canonical.profile,
    createdAt: now,
    updatedAt: now,
  };

  const filePath = resolveProfileRecordPath(record.id);
  await writeJsonAtomic(filePath, await toStoredPayload(record));
  await ensureDefaultProfileAfterMutation();
  return record;
}

export async function upsertProfileRecord(input: UpsertProfileRecordInput): Promise<PlanningProfileRecord> {
  assertServerOnly();
  await ensureStartupMigrations();

  const safeId = sanitizeRecordId(input.id);
  const canonical = loadCanonicalProfile(input.profile);
  const fallbackNow = new Date().toISOString();
  const createdAt = normalizeIso(input.createdAt, fallbackNow);
  const updatedAt = normalizeIso(input.updatedAt, createdAt);
  const record: PlanningProfileRecord = {
    version: 1,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: safeId,
    name: normalizeName(input.name),
    profile: canonical.profile,
    createdAt,
    updatedAt,
  };

  const filePath = resolveProfileRecordPath(record.id);
  await writeJsonAtomic(filePath, await toStoredPayload(record));
  await ensureDefaultProfileAfterMutation();
  return record;
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<PlanningProfileRecord | null> {
  assertServerOnly();
  await ensureStartupMigrations();

  const existing = await getProfile(id);
  if (!existing) return null;

  const canonicalProfile = patch.profile !== undefined
    ? loadCanonicalProfile(patch.profile).profile
    : undefined;

  const updated: PlanningProfileRecord = {
    ...existing,
    ...(patch.name !== undefined ? { name: normalizeName(patch.name) } : {}),
    ...(canonicalProfile !== undefined ? { profile: canonicalProfile } : {}),
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };

  const filePath = resolveProfileRecordPath(existing.id);
  await writeJsonAtomic(filePath, await toStoredPayload(updated));
  await ensureDefaultProfileAfterMutation();
  return updated;
}

export async function hardDeleteProfile(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const legacyPath = resolveProfilePath(safeId);

  let deleted = false;
  try {
    await fs.unlink(partitionPath);
    deleted = true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
  }
  try {
    await fs.unlink(legacyPath);
    deleted = true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
  }

  if (deleted) {
    await ensureDefaultProfileAfterMutation();
  }
  return deleted;
}

export async function restoreProfileFromTrash(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const filePath = resolveProfileRecordPath(safeId);
  const restored = await restoreFileFromTrash(filePath, {
    kind: "profiles",
    id: safeId,
    ext: ".json",
  });
  if (restored) {
    await ensureDefaultProfileAfterMutation();
  }
  return restored;
}

export async function hardDeleteProfileFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  return deleteFileFromTrash({
    kind: "profiles",
    id: safeId,
    ext: ".json",
  });
}

export async function deleteProfile(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const legacyPath = resolveProfilePath(safeId);
  let moved = await moveFileToTrash(partitionPath, {
    kind: "profiles",
    id: safeId,
    ext: ".json",
  });
  if (!moved) {
    moved = await moveFileToTrash(legacyPath, {
      kind: "profiles",
      id: safeId,
      ext: ".json",
    });
  }
  if (moved) {
    await ensureDefaultProfileAfterMutation();
  }
  return moved;
}
