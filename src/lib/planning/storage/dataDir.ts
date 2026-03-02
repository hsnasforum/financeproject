import os from "node:os";
import path from "node:path";

const DEFAULT_APP_NAME = "PlanningV2";
const PACKAGED_TRUE_SET = new Set(["1", "true", "yes", "on", "packaged", "desktop"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  const normalized = asString(value).toLowerCase();
  return PACKAGED_TRUE_SET.has(normalized);
}

function sanitizeAppName(value: unknown): string {
  const raw = asString(value);
  if (!raw) return DEFAULT_APP_NAME;
  const sanitized = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim();
  return sanitized || DEFAULT_APP_NAME;
}

export function isPackagedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (normalizeBoolean(env.PLANNING_PACKAGED_MODE)) return true;
  if (normalizeBoolean(env.PLANNING_RUNTIME_PACKAGED)) return true;
  if (asString(env.PLANNING_RUNTIME_MODE).toLowerCase() === "packaged") return true;
  return false;
}

function resolvePackagedBaseDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    const localAppData = asString(env.LOCALAPPDATA);
    const appData = asString(env.APPDATA);
    if (localAppData) return localAppData;
    if (appData) return appData;
    return path.join(os.homedir(), "AppData", "Local");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  const xdgDataHome = asString(env.XDG_DATA_HOME);
  if (xdgDataHome) return xdgDataHome;
  return path.join(os.homedir(), ".local", "share");
}

export function resolveDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;

  const explicit = asString(env.PLANNING_DATA_DIR);
  if (explicit) return path.resolve(cwd, explicit);

  if (!isPackagedRuntime(env)) {
    return path.resolve(cwd, ".data");
  }

  const appName = sanitizeAppName(env.PLANNING_APP_NAME);
  const baseDir = resolvePackagedBaseDir(env, platform);
  return path.resolve(baseDir, appName);
}

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return path.join(resolveDataDir(options), "planning");
}

export function resolveOpsDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return path.join(resolveDataDir(options), "ops");
}

