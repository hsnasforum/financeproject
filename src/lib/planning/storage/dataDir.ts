import path from "node:path";
import { resolvePlanningDataDir as resolvePlanningDataDirFromRuntime } from "../server/runtime/dataDir";

const PACKAGED_TRUE_SET = new Set(["1", "true", "yes", "on", "packaged", "desktop"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return PACKAGED_TRUE_SET.has(normalized);
}

export function isPackagedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (normalizeBoolean(env.PLANNING_PACKAGED_MODE)) return true;
  if (normalizeBoolean(env.PLANNING_RUNTIME_PACKAGED)) return true;
  if (asString(env.PLANNING_RUNTIME_MODE).toLowerCase() === "packaged") return true;
  return false;
}

export function resolveDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return path.dirname(resolvePlanningDataDir(options));
}

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return resolvePlanningDataDirFromRuntime(options);
}

export function resolveOpsDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return path.join(resolvePlanningDataDir(options), "ops");
}
