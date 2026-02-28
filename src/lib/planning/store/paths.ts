import path from "node:path";
import {
  getPlanningUserDir,
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "./namespace";

export const PROFILES_DIR = ".data/planning/profiles";
export const RUNS_DIR = ".data/planning/runs";

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
  if (!isPlanningNamespaceEnabled()) return path.resolve(cwd, PROFILES_DIR);

  const userId = resolvePlanningUserId();
  return path.join(getPlanningUserDir(userId, cwd), "profiles");
}

export function resolveRunsDir(cwd = process.cwd()): string {
  const override = (process.env.PLANNING_RUNS_DIR ?? "").trim();
  if (override) return path.resolve(cwd, override);
  if (!isPlanningNamespaceEnabled()) return path.resolve(cwd, RUNS_DIR);

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
