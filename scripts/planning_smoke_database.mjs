import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatPlanningSqliteDatabaseUrl } from "../src/lib/planning/deployment/runtimeDatabase.mjs";

function tail(value, limit = 4_000) {
  const text = typeof value === "string" ? value : "";
  return text.length > limit ? text.slice(-limit) : text;
}

export function resolvePlanningSmokeDatabaseUrl(options = {}) {
  return formatPlanningSqliteDatabaseUrl({
    cwd: options.appDir,
    databasePath: options.databasePath,
    platform: options.platform,
  });
}

export async function createPlanningSmokeDatabaseFile(databasePath) {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const handle = await fs.open(databasePath, "wx");
  await handle.close();
}

export async function preparePlanningSmokeDatabase(options = {}) {
  const appDir = path.resolve(options.appDir ?? process.cwd());
  const databasePath = path.resolve(options.databasePath);
  await createPlanningSmokeDatabaseFile(databasePath);
  const databaseUrl = resolvePlanningSmokeDatabaseUrl({ appDir, databasePath });
  const result = spawnSync(
    process.execPath,
    ["scripts/prisma_cli_safe.mjs", "db", "push"],
    {
      cwd: appDir,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `could not prepare smoke SQLite schema (exit=${result.status ?? "unknown"})\n${tail(result.stderr || result.stdout)}`,
    );
  }
  return Object.freeze({ databasePath, databaseUrl });
}
