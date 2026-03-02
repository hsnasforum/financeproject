import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataDir } from "./dataDir";

export type PlanningAppInfo = {
  appVersion: string;
  engineVersion: string;
  dataDir: string;
  hostPolicy: "127.0.0.1";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readPackageVersion(cwd = process.cwd()): Promise<string> {
  const fromEnv = asString(process.env.APP_VERSION)
    || asString(process.env.NEXT_PUBLIC_APP_VERSION)
    || asString(process.env.npm_package_version)
    || asString(process.env.PLANNING_APP_VERSION);
  if (fromEnv) return fromEnv;

  try {
    const packageJsonPath = path.resolve(cwd, "package.json");
    const raw = JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as Record<string, unknown>;
    const version = asString(raw.version);
    return version || "unknown";
  } catch {
    return "unknown";
  }
}

export async function getAppInfo(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): Promise<PlanningAppInfo> {
  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const appVersion = await readPackageVersion(cwd);
  const engineVersion = asString(env.PLANNING_ENGINE_VERSION) || appVersion;
  const dataDir = resolvePlanningDataDir({ cwd, env, platform });

  return {
    appVersion,
    engineVersion,
    dataDir,
    hostPolicy: "127.0.0.1",
  };
}

