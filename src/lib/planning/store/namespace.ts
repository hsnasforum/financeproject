import path from "node:path";

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
  return parseBoolean(env.PLANNING_NAMESPACE_ENABLED, false);
}

export function resolvePlanningUserId(
  userId?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidate = (userId ?? env.PLANNING_USER_ID ?? DEFAULT_PLANNING_USER_ID).trim();
  return sanitizePlanningUserId(candidate || DEFAULT_PLANNING_USER_ID);
}

export function getPlanningUserDir(userId: string, cwd = process.cwd()): string {
  const safeUserId = sanitizePlanningUserId(userId);
  return path.resolve(cwd, PLANNING_USERS_DIR, safeUserId);
}

