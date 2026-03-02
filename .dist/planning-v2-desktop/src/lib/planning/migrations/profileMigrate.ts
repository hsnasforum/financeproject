import { LATEST_PROFILE_VERSION } from "./versions.ts";
import { type MigrationResult } from "./types.ts";
import { normalizeProfileInput } from "../v2/profileNormalize.ts";
import { PROFILE_SCHEMA_VERSION } from "../v2/schemaVersion.ts";

type PlanningProfileRecordLike = {
  version: 1;
  schemaVersion?: 2;
  id: string;
  name: string;
  profile: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const parsed = Math.trunc(Number(value.version));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return parsed;
}

function failProfile(fromVersion: number, errors: string[], warnings: string[] = []): MigrationResult<PlanningProfileRecordLike> {
  return {
    ok: false,
    fromVersion,
    toVersion: LATEST_PROFILE_VERSION,
    changed: false,
    warnings,
    errors,
  };
}

export function migrateProfileRecord(input: unknown): MigrationResult<PlanningProfileRecordLike> {
  const fromVersion = readVersion(input);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!isRecord(input)) {
    return failProfile(fromVersion, ["INVALID_RECORD_OBJECT"]);
  }

  const id = asString(input.id);
  if (!id) errors.push("MISSING_ID");

  const profile = input.profile;
  if (!isRecord(profile)) errors.push("MISSING_PROFILE");

  const createdAt = asString(input.createdAt);
  const updatedAt = asString(input.updatedAt);
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) errors.push("MISSING_DATE_CREATED_AT");
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) errors.push("MISSING_DATE_UPDATED_AT");

  const rawName = asString(input.name);
  const name = rawName || "Unnamed";
  if (!rawName) warnings.push("NAME_MISSING_DEFAULTED");

  let changed = false;
  if (fromVersion < 1) {
    warnings.push("VERSION_MISSING_DEFAULTED");
    changed = true;
  }
  if (!rawName) changed = true;

  if (errors.length > 0) {
    return failProfile(fromVersion, errors, warnings);
  }

  const normalized = normalizeProfileInput(profile);
  warnings.push(...normalized.warnings.map((warning) => `NORMALIZE:${warning}`));
  if (normalized.fixes.length > 0) {
    warnings.push(`NORMALIZE_FIXES:${normalized.fixes.length}`);
  }
  if (!normalized.ok) {
    warnings.push("NORMALIZE:PARTIAL");
  }

  const normalizedProfile = normalized.profile as unknown as Record<string, unknown>;
  if (JSON.stringify(profile) !== JSON.stringify(normalizedProfile)) {
    changed = true;
  }

  const data: PlanningProfileRecordLike = {
    version: LATEST_PROFILE_VERSION,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id,
    name,
    profile: normalizedProfile as PlanningProfileRecordLike["profile"],
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };

  const normalizedSame = JSON.stringify(data) === JSON.stringify(input);
  if (!normalizedSame) changed = true;

  return {
    ok: true,
    fromVersion,
    toVersion: LATEST_PROFILE_VERSION,
    changed,
    data,
    warnings,
    errors: [],
  };
}
