import path from "node:path";
import { resolvePlanningDataDir } from "../storage/dataDir";
import { getScopedPlanningUserId } from "./userScope";

export const DEFAULT_PLANNING_USER_ID = "default";
export const PLANNING_USERS_DIR = ".data/planning/users";

const SAFE_USER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function sanitizePlanningUserId(userId: unknown): string {
  const value = typeof userId === "string" ? userId.trim() : "";
  if (!SAFE_USER_ID_PATTERN.test(value)) {
    throw new Error("Invalid planning user id");
  }
  return value;
}

export function isPlanningNamespaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBoolean(env.PLANNING_NAMESPACE_ENABLED, false) || isPlanningSingleUserModeEnabled(env);
}

export function isPlanningSingleUserModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBoolean(env.PLANNING_SINGLE_USER_MODE, false);
}

function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export class PlanningStorageModeError extends Error {
  readonly code = "INVALID_STORAGE_MODE";
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "PlanningStorageModeError";
  }
}

export function assertPlanningStorageMode(
  env: NodeJS.ProcessEnv = process.env,
  options: { authRequired?: boolean } = {},
): void {
  const authRequired = options.authRequired ?? isProductionEnv(env);
  if (!isProductionEnv(env) || !authRequired) return;
  if (parseBoolean(env.PLANNING_NAMESPACE_ENABLED, false)) return;
  if (isPlanningSingleUserModeEnabled(env)) return;

  throw new PlanningStorageModeError(
    "운영 환경에서는 PLANNING_NAMESPACE_ENABLED=true 또는 PLANNING_SINGLE_USER_MODE=true 중 하나를 명시해야 합니다.",
  );
}

export function resolvePlanningUserId(
  userId?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (isPlanningSingleUserModeEnabled(env)) return DEFAULT_PLANNING_USER_ID;
  const candidate = (userId ?? getScopedPlanningUserId() ?? env.PLANNING_USER_ID ?? DEFAULT_PLANNING_USER_ID).trim();
  return sanitizePlanningUserId(candidate || DEFAULT_PLANNING_USER_ID);
}

export function getPlanningUserDir(userId: string, cwd = process.cwd()): string {
  const safeUserId = sanitizePlanningUserId(userId);
  return path.join(resolvePlanningDataDir({ cwd }), "users", safeUserId);
}
