import os from "node:os";
import path from "node:path";
import { resolvePlanningDataDir as resolvePlanningDataDirFromRuntime } from "../server/runtime/dataDir";
import { isPlanningPackagedRuntime, normalizePlanningRuntimePlatform, resolvePlanningRuntimeRoots } from "./runtimeRoots.mjs";

export const isPackagedRuntime = isPlanningPackagedRuntime;

export function resolveDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): string {
  return resolvePlanningRuntimeRoots({
    cwd: options?.cwd ?? process.cwd(),
    env: options?.env ?? process.env,
    platform: normalizePlanningRuntimePlatform(options?.platform ?? process.platform),
    homeDir: options?.homeDir ?? os.homedir(),
  }).runtimeRoot;
}

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): string {
  return resolvePlanningDataDirFromRuntime(options);
}

export function resolveOpsDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): string {
  const pathApi = options?.platform === "win32" ? path.win32 : path.posix;
  return pathApi.join(resolvePlanningDataDir(options), "ops");
}
