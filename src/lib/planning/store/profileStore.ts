import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";
import { readJsonFile, storageSchemaCorrupted, toStorageReadError } from "../storage/serverFileRead";
import { PlanningV2ValidationError } from "../v2/types";
import { validateProfileV2 } from "../v2/validate";
import { type ProfileV2 } from "../v2/types";
import { loadCanonicalProfile } from "../v2/loadCanonicalProfile";
import { PROFILE_SCHEMA_VERSION } from "../v2/schemaVersion";
import {
  PROFILES_DIR,
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
  resolveTrashKindDir,
} from "./trash";
import { isPlanningNamespaceEnabled } from "./namespace";
import { ensurePlanningStartupMigrations } from "./startupMigrationGate";
import { type PlanningProfileMeta, type PlanningProfileRecord } from "./types";
import { sha256Hex, stableStringify } from "../cache/key";
import { withPlanningStoreWriteLock } from "../storage/storeWriteLock";

export type ProfileMonthlyPatch = Partial<Pick<ProfileV2, "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses">>;

type ProfilePatch = {
  name?: string;
  profile?: ProfileV2;
  monthlyCashflow?: ProfileMonthlyPatch;
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

export type PlanningProfileListWithDefault = {
  profiles: PlanningProfileRecord[];
  defaultProfileId?: string;
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

function withProfileWriteLock<T>(id: string, callback: () => Promise<T>): Promise<T> {
  sanitizeRecordId(id);
  // Existing mutations also refresh registry metadata and may migrate siblings.
  // One user-store lock avoids acquiring profile locks in inconsistent orders.
  return withPlanningStoreWriteLock(`planning:profiles:${resolveProfilePartitionsDir()}`, callback);
}

async function ensureStartupMigrations(preflightAllProfiles = false): Promise<void> {
  // The startup runner scans this fixed legacy directory, ignoring store overrides.
  // Check our bodies before it can normalize them or a same-ID legacy counterpart.
  if (preflightAllProfiles) {
    await assertProfileBodiesReadable();
  } else if (resolveProfilesDir() === path.resolve(process.cwd(), PROFILES_DIR)) {
    const legacy = await listLegacyProfiles(false);
    for (const record of legacy) {
      await readProfileFile(resolveProfileRecordPath(record.id), false);
    }
  }
  await ensurePlanningStartupMigrations({ mode: "best-effort" });
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
  if (isPlanningNamespaceEnabled()) {
    return path.join(path.dirname(resolveProfilePartitionsDir(cwd)), "profiles.meta.json");
  }

  const override = asString(process.env.PLANNING_PROFILE_META_PATH);
  if (override) return path.resolve(cwd, override);

  const registryOverride = asString(process.env.PLANNING_PROFILE_REGISTRY_PATH);
  if (registryOverride) {
    return path.join(path.dirname(path.resolve(cwd, registryOverride)), "profiles.meta.json");
  }

  return path.join(path.dirname(resolveProfilePartitionsDir(cwd)), "profiles.meta.json");
}

function resolveProfileRegistryPath(cwd = process.cwd()): string {
  if (isPlanningNamespaceEnabled()) {
    return path.join(resolveProfilePartitionsDir(cwd), "index.json");
  }

  const override = asString(process.env.PLANNING_PROFILE_REGISTRY_PATH);
  if (override) return path.resolve(cwd, override);

  return path.join(resolveProfilePartitionsDir(cwd), "index.json");
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

function storedValue(row: Record<string, unknown>, keys: string[], fallback: unknown): unknown {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  return key === undefined ? fallback : row[key];
}

async function readProfileFile(filePath: string, rewriteToVault = true, preserveStoredRecord = false): Promise<PlanningProfileRecord | null> {
  // Only the target file read may report absence. Decode/rewrite errors must propagate.
  const loaded = await readJsonFile(filePath);
  if (loaded.kind === "not-found") return null;
  const decoded = await decodeStoragePayload(loaded.value);
  const parsed = decoded.payload;
  if (!isProfileRecord(parsed)) throw storageSchemaCorrupted(filePath);
  let canonical: ReturnType<typeof loadCanonicalProfile>;
  try {
    canonical = loadCanonicalProfile(parsed.profile);
    // Keep omitted legacy defaults/aliases, but validate supplied amounts and months
    // before normalization can hide invalid values. This projection is never stored.
    const legacy = Number(parsed.schemaVersion ?? (parsed.profile as { schemaVersion?: unknown }).schemaVersion ?? 1) < PROFILE_SCHEMA_VERSION;
    const raw = parsed.profile as unknown as Record<string, unknown>;
    const cashflow = isRecord(raw.cashflow) ? raw.cashflow : {};
    const assets = isRecord(raw.assets) ? raw.assets : {};
    const debts = raw.debts !== undefined ? raw.debts : raw.liabilities;
    const goals = raw.goals !== undefined ? raw.goals : raw.goalsV2;
    validateProfileV2(legacy ? {
      ...raw,
      monthlyIncomeNet: raw.monthlyIncomeNet !== undefined ? raw.monthlyIncomeNet : cashflow.monthlyIncomeKrw,
      monthlyEssentialExpenses: raw.monthlyEssentialExpenses !== undefined ? raw.monthlyEssentialExpenses : cashflow.monthlyFixedExpensesKrw,
      monthlyDiscretionaryExpenses: raw.monthlyDiscretionaryExpenses !== undefined ? raw.monthlyDiscretionaryExpenses : cashflow.monthlyVariableExpensesKrw,
      liquidAssets: raw.liquidAssets !== undefined ? raw.liquidAssets : assets.cashKrw,
      investmentAssets: raw.investmentAssets !== undefined ? raw.investmentAssets : assets.investmentsKrw,
      debts: Array.isArray(debts) ? debts.map((entry, index) => {
        if (!isRecord(entry)) return entry;
        const normalized = canonical.profile.debts[index];
        return {
          ...normalized,
          balance: storedValue(entry, ["balance", "principalKrw", "principal"], normalized?.balance ?? 0),
          minimumPayment: storedValue(entry, ["minimumPayment", "minimumPaymentKrw", "monthlyPaymentKrw", "monthlyPayment"], normalized?.minimumPayment ?? 0),
          remainingMonths: storedValue(entry, ["remainingMonths", "termMonths"], normalized?.remainingMonths),
        };
      }) : debts,
      goals: Array.isArray(goals) ? goals.map((entry, index) => {
        if (!isRecord(entry)) return entry;
        const normalized = canonical.profile.goals[index];
        return {
          ...normalized,
          targetAmount: storedValue(entry, ["targetAmount", "amount"], normalized?.targetAmount ?? 0),
          currentAmount: storedValue(entry, ["currentAmount", "savedAmount"], normalized?.currentAmount ?? 0),
          minimumMonthlyContribution: storedValue(entry, ["minimumMonthlyContribution"], normalized?.minimumMonthlyContribution ?? 0),
          targetMonth: storedValue(entry, ["targetMonth", "dueMonth"], normalized?.targetMonth),
        };
      }) : goals,
    } : parsed.profile);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) throw storageSchemaCorrupted(filePath);
    throw error;
  }
  const record = {
    ...parsed,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile: canonical.profile,
  };
  if (rewriteToVault && decoded.rewriteToVault) {
    return withProfileWriteLock(record.id, async () => {
      const current = await readProfileFile(filePath, false, preserveStoredRecord);
      if (!current) return null;
      await writeJsonAtomic(filePath, await toStoredPayload(current));
      return current;
    });
  }
  return preserveStoredRecord ? parsed : record;
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

async function listPartitionProfiles(rewriteToVault = true): Promise<PlanningProfileRecord[]> {
  const dirPath = resolveProfilePartitionsDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw toStorageReadError(error, dirPath);
  }

  const records: PlanningProfileRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = asString(entry.name);
    if (!id) continue;
    let safeId: string;
    try {
      safeId = sanitizeRecordId(id);
    } catch {
      continue;
    }
    const filePath = resolveProfileRecordPath(safeId);
    const profile = await readProfileFile(filePath, rewriteToVault);
    if (profile) records.push(profile);
  }
  return records;
}

async function listLegacyProfiles(rewriteToVault = true): Promise<PlanningProfileRecord[]> {
  const dirPath = resolveProfilesDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw toStorageReadError(error, dirPath);
  }

  const records: PlanningProfileRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(dirPath, entry.name);
    const profile = await readProfileFile(filePath, rewriteToVault);
    if (profile) records.push(profile);
  }
  return records;
}

async function migrateLegacyProfileRecord(profile: PlanningProfileRecord): Promise<void> {
  const safeId = sanitizeRecordId(profile.id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const legacyPath = resolveProfilePath(safeId);

  await withProfileWriteLock(safeId, async () => {
    const existing = await readProfileFile(partitionPath);
    if (!existing) {
      // A monthly update may have committed while this reader waited for the lock.
      const current = await readProfileFile(legacyPath, false);
      if (!current) return;
      await writeJsonAtomic(partitionPath, await toStoredPayload(current));
    }
    await fs.unlink(legacyPath).catch(() => undefined);
  });
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
  await assertProfileBodiesReadable();
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

async function assertProfileBodiesReadable(): Promise<void> {
  // Fail before migrating, rewriting to Vault, or mutating an otherwise healthy sibling.
  await listPartitionProfiles(false);
  await listLegacyProfiles(false);
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

async function loadProfilesWithDefault(): Promise<PlanningProfileListWithDefault> {
  assertServerOnly();
  await ensureStartupMigrations(true);
  const records = await loadAllProfilesWithMigration();
  const defaultProfileId = await resolveDefaultProfileId(records);
  return {
    profiles: records,
    ...(defaultProfileId ? { defaultProfileId } : {}),
  };
}

export async function listProfilesWithDefault(): Promise<PlanningProfileListWithDefault> {
  return loadProfilesWithDefault();
}

export async function listProfiles(): Promise<PlanningProfileRecord[]> {
  const loaded = await loadProfilesWithDefault();
  return loaded.profiles;
}

export async function listProfileMetas(): Promise<PlanningProfileMeta[]> {
  const loaded = await loadProfilesWithDefault();
  return loaded.profiles.map((record) => ({
    profileId: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isDefault: record.id === loaded.defaultProfileId,
  }));
}

export async function getDefaultProfileId(): Promise<string | undefined> {
  const loaded = await loadProfilesWithDefault();
  return loaded.defaultProfileId;
}

export async function setDefaultProfile(profileId: string): Promise<string> {
  assertServerOnly();
  const safeProfileId = sanitizeRecordId(profileId);
  await assertProfileBodiesReadable();
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

async function readProfileRecordAfterStartupMigrations(
  id: string,
): Promise<PlanningProfileRecord | null> {
  const safeId = sanitizeRecordId(id);
  const partitionPath = resolveProfileRecordPath(safeId);
  const fromPartition = await readProfileFile(partitionPath);
  if (fromPartition) return fromPartition;

  const legacyPath = resolveProfilePath(safeId);
  const fromLegacy = await readProfileFile(legacyPath);
  if (!fromLegacy) return null;

  await migrateLegacyProfileRecord(fromLegacy);
  return await readProfileFile(partitionPath) ?? fromLegacy;
}

export async function getProfile(id: string): Promise<PlanningProfileRecord | null> {
  assertServerOnly();
  await ensureStartupMigrations();
  return readProfileRecordAfterStartupMigrations(id);
}

export async function createProfile(input: CreateProfileInput): Promise<PlanningProfileRecord> {
  assertServerOnly();
  await ensureStartupMigrations(true);

  const canonical = loadCanonicalProfile(input.profile);
  await assertProfileBodiesReadable();
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
  return withProfileWriteLock(input.id, () => upsertProfileRecordUnlocked(input));
}

async function upsertProfileRecordUnlocked(input: UpsertProfileRecordInput): Promise<PlanningProfileRecord> {
  assertServerOnly();
  await ensureStartupMigrations(true);

  const safeId = sanitizeRecordId(input.id);
  const canonical = loadCanonicalProfile(input.profile);
  await assertProfileBodiesReadable();
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

export class ProfileUpdateConflictError extends Error {
  constructor() {
    super("프로필이 변경되어 preflight를 다시 확인해야 합니다.");
    this.name = "ProfileUpdateConflictError";
  }
}

async function readProfileUpdateSnapshot(id: string) {
  const safeId = sanitizeRecordId(id);
  for (const filePath of [resolveProfileRecordPath(safeId), resolveProfilePath(safeId)]) {
    // A rejected draft must not trigger migrations, encryption rewrites or default creation.
    const record = await readProfileFile(filePath, false, true);
    if (record) return { record, filePath, revision: sha256Hex(stableStringify(record)) };
  }
  return null;
}

export async function getProfileUpdateSnapshot(id: string) {
  assertServerOnly();
  await assertProfileBodiesReadable();
  const snapshot = await readProfileUpdateSnapshot(id);
  return snapshot ? { record: snapshot.record, revision: snapshot.revision } : null;
}

export async function updateProfile(
  id: string,
  patch: ProfilePatch,
  options?: { expectedRevision?: string },
): Promise<PlanningProfileRecord | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  return withProfileWriteLock(safeId, async () => {
    if (patch.monthlyCashflow === undefined) return updateWholeProfile(safeId, patch);
    if (!options?.expectedRevision) throw new ProfileUpdateConflictError();
    await assertProfileBodiesReadable();
    const snapshot = await readProfileUpdateSnapshot(safeId);
    if (!snapshot) return null;
    if (snapshot.revision !== options.expectedRevision) throw new ProfileUpdateConflictError();
    const monthly = patch.monthlyCashflow;
    const profile = {
      ...snapshot.record.profile,
      ...(monthly.monthlyIncomeNet !== undefined ? { monthlyIncomeNet: monthly.monthlyIncomeNet } : {}),
      ...(monthly.monthlyEssentialExpenses !== undefined ? { monthlyEssentialExpenses: monthly.monthlyEssentialExpenses } : {}),
      ...(monthly.monthlyDiscretionaryExpenses !== undefined ? { monthlyDiscretionaryExpenses: monthly.monthlyDiscretionaryExpenses } : {}),
    };
    const cashflow = profile.cashflow;
    if (cashflow && typeof cashflow === "object" && !Array.isArray(cashflow)) {
      // Legacy aliases take precedence on read. Synchronize only aliases for supplied monthly fields.
      profile.cashflow = {
        ...cashflow,
        ...(monthly.monthlyIncomeNet !== undefined && "monthlyIncomeKrw" in cashflow ? { monthlyIncomeKrw: monthly.monthlyIncomeNet } : {}),
        ...(monthly.monthlyEssentialExpenses !== undefined && "monthlyFixedExpensesKrw" in cashflow ? { monthlyFixedExpensesKrw: monthly.monthlyEssentialExpenses } : {}),
        ...(monthly.monthlyDiscretionaryExpenses !== undefined && "monthlyVariableExpensesKrw" in cashflow ? { monthlyVariableExpensesKrw: monthly.monthlyDiscretionaryExpenses } : {}),
      };
    }
    // Validate the canonical projection, but retain all non-target stored fields verbatim.
    validateProfileV2(loadCanonicalProfile(profile).profile);
    const previousTime = Date.parse(snapshot.record.updatedAt);
    const updatedTime = Number.isFinite(previousTime) ? Math.max(Date.now(), previousTime + 1) : Date.now();
    const updated = { ...snapshot.record, profile, updatedAt: new Date(updatedTime).toISOString() };
    await writeJsonAtomic(snapshot.filePath, await toStoredPayload(updated));
    // ID/name/default are unchanged. Derived registry metadata is refreshed by list readers.
    // Keeping this a single atomic write avoids reporting failure after a profile was committed.
    return updated;
  });
}

async function updateWholeProfile(id: string, patch: ProfilePatch): Promise<PlanningProfileRecord | null> {
  assertServerOnly();
  await ensureStartupMigrations(true);
  await assertProfileBodiesReadable();

  const existing = await readProfileRecordAfterStartupMigrations(id);
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
  return withProfileWriteLock(id, () => hardDeleteProfileUnlocked(id));
}

async function hardDeleteProfileUnlocked(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  await assertProfileBodiesReadable();
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
  return withProfileWriteLock(id, () => restoreProfileFromTrashUnlocked(id));
}

async function restoreProfileFromTrashUnlocked(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  await assertProfileBodiesReadable();
  const trashPath = path.join(resolveTrashKindDir("profiles"), `${safeId}.json`);
  if (!await readProfileFile(trashPath, false)) return false;
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
  return withProfileWriteLock(id, () => deleteProfileUnlocked(id));
}

async function deleteProfileUnlocked(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  await assertProfileBodiesReadable();
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
