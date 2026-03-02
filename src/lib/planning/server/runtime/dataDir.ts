import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_APP_NAME = "PlanningV2";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeAppName(value: unknown): string {
  const raw = asString(value);
  if (!raw) return DEFAULT_APP_NAME;
  const sanitized = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim();
  return sanitized || DEFAULT_APP_NAME;
}

function resolvePackagedPlanningRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const appName = sanitizeAppName(env.PLANNING_APP_NAME);

  if (platform === "win32") {
    const localAppData = asString(env.LOCALAPPDATA) || asString(env.APPDATA);
    const base = localAppData || path.join(os.homedir(), "AppData", "Local");
    return path.resolve(base, appName, "vault");
  }

  const xdgDataHome = asString(env.XDG_DATA_HOME);
  const base = xdgDataHome || path.join(os.homedir(), ".local", "share");
  return path.resolve(base, appName, "vault");
}

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;

  const explicit = asString(env.PLANNING_DATA_DIR);
  if (explicit) return path.resolve(cwd, explicit);

  if (env.NODE_ENV !== "production") {
    return path.resolve(cwd, ".data", "planning");
  }

  return resolvePackagedPlanningRoot(env, platform);
}

export async function ensureDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

