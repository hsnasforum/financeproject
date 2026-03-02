import path from "node:path";
import {
  getPlanningUserDir,
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "./namespace";
import { resolvePlanningDataDir } from "../storage/dataDir";

export const PROFILES_DIR = ".data/planning/profiles";
export const RUNS_DIR = ".data/planning/runs";
export const PROFILE_PARTITIONS_DIR = ".data/planning/vault/profiles";
export const RUN_META_FILE = "run.json";
export const RUN_BLOBS_DIR = "blobs";
export const RUNS_INDEX_FILE = "index.json";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function sanitizeRecordId(id: unknown): string {
  const value = typeof id === "string" ? id.trim() : "";
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error("Invalid record id");
  }
  return value;
}

export function resolveProfilesDir(cwd = process.cwd()): string {
  const override = (process.env.PLANNING_PROFILES_DIR ?? "").trim();
  if (override) return path.resolve(cwd, override);
  if (!isPlanningNamespaceEnabled()) return path.join(resolvePlanningDataDir({ cwd }), "profiles");

  const userId = resolvePlanningUserId();
  return path.join(getPlanningUserDir(userId, cwd), "profiles");
}

export function resolveRunsDir(cwd = process.cwd()): string {
  const override = (process.env.PLANNING_RUNS_DIR ?? "").trim();
  if (override) return path.resolve(cwd, override);
  if (!isPlanningNamespaceEnabled()) return path.join(resolvePlanningDataDir({ cwd }), "runs");

  const userId = resolvePlanningUserId();
  return path.join(getPlanningUserDir(userId, cwd), "runs");
}

export function resolveProfilePath(id: string, cwd = process.cwd()): string {
  const safeId = sanitizeRecordId(id);
  return path.join(resolveProfilesDir(cwd), `${safeId}.json`);
}

export function resolveRunPath(id: string, cwd = process.cwd()): string {
  const safeId = sanitizeRecordId(id);
  return path.join(resolveRunsDir(cwd), `${safeId}.json`);
}

export function resolveProfilePartitionsDir(cwd = process.cwd()): string {
  const override = (process.env.PLANNING_PROFILE_PARTITIONS_DIR ?? "").trim();
  if (override) return path.resolve(cwd, override);
  const profilesOverride = (process.env.PLANNING_PROFILES_DIR ?? "").trim();
  if (profilesOverride) {
    const profilesDir = path.resolve(cwd, profilesOverride);
    return path.join(path.dirname(profilesDir), "vault", "profiles");
  }
  const runsOverride = (process.env.PLANNING_RUNS_DIR ?? "").trim();
  if (runsOverride) {
    const runsDir = path.resolve(cwd, runsOverride);
    return path.join(path.dirname(runsDir), "vault", "profiles");
  }
  if (!isPlanningNamespaceEnabled()) return path.join(resolvePlanningDataDir({ cwd }), "vault", "profiles");

  const userId = resolvePlanningUserId();
  return path.join(getPlanningUserDir(userId, cwd), "vault", "profiles");
}

export function resolveProfilePartitionDir(profileId: string, cwd = process.cwd()): string {
  const safeProfileId = sanitizeRecordId(profileId);
  return path.join(resolveProfilePartitionsDir(cwd), safeProfileId);
}

export function resolveProfileRecordPath(profileId: string, cwd = process.cwd()): string {
  return path.join(resolveProfilePartitionDir(profileId, cwd), "profile.json");
}

export function resolveProfileRunsDir(profileId: string, cwd = process.cwd()): string {
  return path.join(resolveProfilePartitionDir(profileId, cwd), "runs");
}

export function resolveProfileRunDir(profileId: string, runId: string, cwd = process.cwd()): string {
  const safeRunId = sanitizeRecordId(runId);
  return path.join(resolveProfileRunsDir(profileId, cwd), safeRunId);
}

export function resolveProfileRunMetaPath(profileId: string, runId: string, cwd = process.cwd()): string {
  return path.join(resolveProfileRunDir(profileId, runId, cwd), RUN_META_FILE);
}

export function resolveProfileRunBlobsDir(profileId: string, runId: string, cwd = process.cwd()): string {
  return path.join(resolveProfileRunDir(profileId, runId, cwd), RUN_BLOBS_DIR);
}

export function resolveRunDir(id: string, cwd = process.cwd()): string {
  const safeId = sanitizeRecordId(id);
  return path.join(resolveRunsDir(cwd), safeId);
}

export function resolveRunMetaPath(id: string, cwd = process.cwd()): string {
  return path.join(resolveRunDir(id, cwd), RUN_META_FILE);
}

export function resolveRunBlobsDir(id: string, cwd = process.cwd()): string {
  return path.join(resolveRunDir(id, cwd), RUN_BLOBS_DIR);
}

export function resolveRunsIndexPath(cwd = process.cwd()): string {
  return path.join(resolveRunsDir(cwd), RUNS_INDEX_FILE);
}
