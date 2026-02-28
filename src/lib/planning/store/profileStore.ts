import fs from "node:fs/promises";
import path from "node:path";
import {
  decryptPlanningJson,
  encryptPlanningJson,
  isPlanningEncryptedEnvelope,
} from "../crypto/encrypt";
import { type ProfileV2 } from "../v2/types";
import {
  resolveProfilePath,
  resolveProfilesDir,
  sanitizeRecordId,
} from "./paths";
import { getPlanningStorageSecurityOptions } from "./security";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  restoreFileFromTrash,
} from "./trash";
import { type PlanningProfileRecord } from "./types";

type ProfilePatch = {
  name?: string;
  profile?: ProfileV2;
};

type CreateProfileInput = {
  name: string;
  profile: ProfileV2;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning profile store is server-only.");
  }
}

assertServerOnly();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProfileRecord(value: unknown): value is PlanningProfileRecord {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (typeof value.name !== "string" || !value.name.trim()) return false;
  if (!isRecord(value.profile)) return false;
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) return false;
  if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return false;
  return true;
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name || "기본 프로필";
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

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function toStoredPayload(payload: unknown): Promise<unknown> {
  const options = getPlanningStorageSecurityOptions();
  if (!options.encryptionEnabled) return payload;
  if (!options.encryptionPassphrase) {
    throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  return encryptPlanningJson(payload, options.encryptionPassphrase);
}

async function readProfileFile(filePath: string): Promise<PlanningProfileRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const options = getPlanningStorageSecurityOptions();
    const parsed = options.encryptionEnabled && isPlanningEncryptedEnvelope(loaded)
      ? await decryptPlanningJson(loaded, options.encryptionPassphrase ?? "")
      : loaded;
    if (!isProfileRecord(parsed)) return null;
    return parsed;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

export async function listProfiles(): Promise<PlanningProfileRecord[]> {
  assertServerOnly();

  const dirPath = resolveProfilesDir();
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
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

  return sortByUpdatedAtDesc(records);
}

export async function getProfile(id: string): Promise<PlanningProfileRecord | null> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const filePath = resolveProfilePath(safeId);
  return readProfileFile(filePath);
}

export async function createProfile(input: CreateProfileInput): Promise<PlanningProfileRecord> {
  assertServerOnly();

  const now = new Date().toISOString();
  const record: PlanningProfileRecord = {
    version: 1,
    id: crypto.randomUUID(),
    name: normalizeName(input.name),
    profile: input.profile,
    createdAt: now,
    updatedAt: now,
  };

  const filePath = resolveProfilePath(record.id);
  await writeJsonAtomic(filePath, await toStoredPayload(record));
  return record;
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<PlanningProfileRecord | null> {
  assertServerOnly();

  const existing = await getProfile(id);
  if (!existing) return null;

  const updated: PlanningProfileRecord = {
    ...existing,
    ...(patch.name !== undefined ? { name: normalizeName(patch.name) } : {}),
    ...(patch.profile !== undefined ? { profile: patch.profile } : {}),
    updatedAt: new Date().toISOString(),
  };

  const filePath = resolveProfilePath(existing.id);
  await writeJsonAtomic(filePath, await toStoredPayload(updated));
  return updated;
}

export async function hardDeleteProfile(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const filePath = resolveProfilePath(safeId);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

export async function restoreProfileFromTrash(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeRecordId(id);
  const filePath = resolveProfilePath(safeId);
  return restoreFileFromTrash(filePath, {
    kind: "profiles",
    id: safeId,
    ext: ".json",
  });
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
  const filePath = resolveProfilePath(safeId);
  return moveFileToTrash(filePath, {
    kind: "profiles",
    id: safeId,
    ext: ".json",
  });
}
