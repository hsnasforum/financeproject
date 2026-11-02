import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataRoot } from "../../deployment/runtimeRoot.mjs";

export function resolvePlanningDataDir(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): string {
  return resolvePlanningDataRoot(options);
}

export async function ensureDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}
