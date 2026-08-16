import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isPlanningPackagedRuntime,
  normalizePlanningRuntimePlatform,
  resolvePlanningLegacyServerProductionRoot,
  resolvePlanningRuntimeRoots,
} from "../../storage/runtimeRoots.mjs";

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): string {
  const input = {
    cwd: options?.cwd ?? process.cwd(),
    env: options?.env ?? process.env,
    platform: normalizePlanningRuntimePlatform(options?.platform ?? process.platform),
    homeDir: options?.homeDir ?? os.homedir(),
  };
  const planningRoot = resolvePlanningRuntimeRoots(input).planningRoot;
  const legacyRoot = resolvePlanningLegacyServerProductionRoot(input);
  if (isPlanningPackagedRuntime(input.env)
    && legacyRoot !== planningRoot
    && fsSync.existsSync(legacyRoot)) {
    throw new Error(`PATH_MIGRATION_REQUIRED:${legacyRoot}->${planningRoot}`);
  }
  return planningRoot;
}

export async function ensureDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}
