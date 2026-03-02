import fs from "node:fs/promises";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";
import { resolveProfilePartitionDir, sanitizeRecordId } from "../store/paths";
import {
  normalizeAssumptionsOverrides,
  type AssumptionsOverrideEntry,
} from "./overrides";

export const ASSUMPTIONS_OVERRIDES_PATH = ".data/planning/assumptions/overrides.json";
export const ASSUMPTIONS_PROFILE_OVERRIDES_FILE = "assumptions-overrides.json";

type AssumptionsOverridesFile = {
  version: 1;
  updatedAt: string;
  items: AssumptionsOverrideEntry[];
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning assumptions overrides storage is server-only.");
  }
}

assertServerOnly();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function resolveLegacyOverridesPath(): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH);
  return path.resolve(process.cwd(), override || ASSUMPTIONS_OVERRIDES_PATH);
}

function resolveScopedOverridesPath(profileId?: string): string {
  const safeProfileId = asString(profileId);
  if (!safeProfileId) return resolveLegacyOverridesPath();
  return path.join(resolveProfilePartitionDir(sanitizeRecordId(safeProfileId)), ASSUMPTIONS_PROFILE_OVERRIDES_FILE);
}

function isOverridesFile(value: unknown): value is AssumptionsOverridesFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Number(row.version) !== 1) return false;
  if (!Array.isArray(row.items)) return false;
  return true;
}

async function readDecodedJson(filePath: string): Promise<{
  payload: unknown;
  rewriteToVault: boolean;
} | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(parsed);
    return {
      payload: decoded.payload,
      rewriteToVault: decoded.rewriteToVault,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeOverridesFile(filePath: string, payload: AssumptionsOverridesFile): Promise<void> {
  await atomicWriteJson(filePath, await encodeStoragePayload(payload));
}

function toOverridesFile(input: unknown): AssumptionsOverridesFile {
  if (Array.isArray(input)) {
    const nowIso = new Date().toISOString();
    return {
      version: 1,
      updatedAt: nowIso,
      items: normalizeAssumptionsOverrides(input, nowIso),
    };
  }
  if (isOverridesFile(input)) {
    const updatedAt = normalizeIso(input.updatedAt);
    return {
      version: 1,
      updatedAt,
      items: normalizeAssumptionsOverrides(input.items, updatedAt),
    };
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

export async function loadAssumptionsOverrides(): Promise<AssumptionsOverrideEntry[]> {
  assertServerOnly();
  return loadAssumptionsOverridesByProfile();
}

export async function loadAssumptionsOverridesByProfile(profileId?: string): Promise<AssumptionsOverrideEntry[]> {
  const filePath = resolveScopedOverridesPath(profileId);
  const decoded = await readDecodedJson(filePath);
  if (decoded) {
    const normalized = toOverridesFile(decoded.payload);
    if (decoded.rewriteToVault) {
      await writeOverridesFile(filePath, normalized);
    }
    return normalized.items;
  }
  const safeProfileId = asString(profileId);
  if (!safeProfileId) return [];

  // Legacy migration path: if scoped file is missing, read old global file and move it.
  const legacyPath = resolveLegacyOverridesPath();
  if (legacyPath === filePath) return [];
  const legacyDecoded = await readDecodedJson(legacyPath);
  if (!legacyDecoded) return [];
  const migrated = toOverridesFile(legacyDecoded.payload);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeOverridesFile(filePath, migrated);
  return migrated.items;
}

export async function saveAssumptionsOverrides(input: unknown, profileId?: string): Promise<AssumptionsOverrideEntry[]> {
  assertServerOnly();

  const filePath = resolveScopedOverridesPath(profileId);
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });

  const updatedAt = new Date().toISOString();
  const filePayload: AssumptionsOverridesFile = {
    version: 1,
    updatedAt,
    items: normalizeAssumptionsOverrides(input, updatedAt),
  };

  await writeOverridesFile(filePath, filePayload);
  return filePayload.items;
}

export async function resetAssumptionsOverrides(profileId?: string): Promise<void> {
  assertServerOnly();
  await saveAssumptionsOverrides([], profileId);
}
