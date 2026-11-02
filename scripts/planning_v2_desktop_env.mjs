import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

export const PLANNING_DESKTOP_ENV_FILES = [".env.local", "env.local", ".env"];
export const PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS = Object.freeze([
  "DATABASE_URL",
  "PLANNING_APP_NAME",
  "PLANNING_DATA_DIR",
]);

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * @param {{
 *   cwd?: string;
 *   env?: NodeJS.ProcessEnv;
 *   authoritativeKeys?: string[];
 * }} [options]
 */
export async function loadPlanningDesktopEnvironment({
  cwd = process.cwd(),
  env = process.env,
  authoritativeKeys = [],
} = {}) {
  const loadedFiles = [];

  for (const key of authoritativeKeys) {
    delete env[key];
  }

  for (const filename of PLANNING_DESKTOP_ENV_FILES) {
    const filePath = path.join(cwd, filename);
    let source;
    try {
      source = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") continue;
      throw error;
    }

    const parsed = parseEnv(source);
    for (const [key, value] of Object.entries(parsed)) {
      if (!hasOwn(env, key)) env[key] = value;
    }
    loadedFiles.push(filename);
  }

  return { env, loadedFiles };
}
