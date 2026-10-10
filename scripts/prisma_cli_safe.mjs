import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertPlanningSqliteSchema, resolvePlanningSqliteDatabase } from "../src/lib/planning/deployment/runtimeDatabase.mjs";
import { assertFinlifeIdentityReady } from "../src/lib/finlife/sqliteIdentityMigration.mjs";

function preloadEnv() {
  const cwd = process.cwd();
  const candidates = [".env.local", "env.local", ".env"];
  const loaded = [];

  for (const name of candidates) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    process.loadEnvFile(filePath);
    loaded.push(name);
  }

  return loaded;
}

function envState(name) {
  return (process.env[name] ?? "").trim() ? "set" : "unset";
}

function mirrorHost() {
  const raw = (process.env.PRISMA_ENGINES_MIRROR ?? "").trim();
  if (!raw) return "unset";
  try {
    return new URL(raw).host || "set";
  } catch {
    return "set";
  }
}

function resolvePrismaCliPath() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "node_modules", "prisma", "build", "index.js"),
    path.join(cwd, ".next", "standalone", "node_modules", "prisma", "build", "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

function prepareSqliteDbPush(finalArgs) {
  if (!finalArgs.includes("db") || !finalArgs.includes("push")) return null;
  if (finalArgs.length !== 2 || finalArgs[0] !== "db" || finalArgs[1] !== "push") {
    throw new Error("unsafe db push arguments: use the canonical prisma:db:push script without reset, data-loss, schema, config or URL overrides");
  }
  const resolved = resolvePlanningSqliteDatabase({ cwd: process.cwd(), env: process.env });
  if (fs.existsSync(resolved.databasePath)) {
    const stats = fs.lstatSync(resolved.databasePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("existing SQLite database must be a regular non-symlink file");
    }
    if (stats.size > 0) {
      try {
        assertFinlifeIdentityReady({ cwd: process.cwd(), databasePath: resolved.databasePath });
        assertPlanningSqliteSchema({ cwd: process.cwd(), databasePath: resolved.databasePath });
      } catch (error) {
        throw new Error(`existing SQLite database cannot be changed by db push. ${error.message}`, { cause: error });
      }
      return { ...resolved, noOp: true };
    }
  }
  if (["-wal", "-shm", "-journal"].some((suffix) => fs.existsSync(`${resolved.databasePath}${suffix}`))) {
    throw new Error("existing SQLite database sidecars prevent empty database initialization; inspect the database before proceeding");
  }
  fs.mkdirSync(path.dirname(resolved.databasePath), { recursive: true });
  const descriptor = fs.openSync(resolved.databasePath, fs.existsSync(resolved.databasePath) ? "r+" : "wx");
  fs.closeSync(descriptor);
  process.env.DATABASE_URL = resolved.databaseUrl;
  return { ...resolved, noOp: false };
}

function main() {
  const loaded = preloadEnv();
  const prismaCliPath = resolvePrismaCliPath();

  if (!prismaCliPath) {
    console.error("[prisma:safe] prisma CLI not found in project or standalone node_modules");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const finalArgs = args.length > 0 ? args : ["generate"];
  const sqliteDbPushPrepared = prepareSqliteDbPush(finalArgs);

  console.log(`[prisma:safe] env loaded: ${loaded.length > 0 ? loaded.join(",") : "none"}`);
  console.log(`[prisma:safe] PRISMA_ENGINES_MIRROR host: ${mirrorHost()}`);
  console.log(`[prisma:safe] HTTP_PROXY: ${envState("HTTP_PROXY")}`);
  console.log(`[prisma:safe] HTTPS_PROXY: ${envState("HTTPS_PROXY")}`);
  console.log(`[prisma:safe] NO_PROXY: ${envState("NO_PROXY")}`);
  if (sqliteDbPushPrepared) {
    console.log("[prisma:safe] SQLite database file: ready");
    if (sqliteDbPushPrepared.noOp) {
      console.log("[prisma:safe] existing SQLite database is ready; no schema changes");
      return;
    }
  }

  const result = spawnSync(process.execPath, [prismaCliPath, ...finalArgs], {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number") {
    if (result.status === 0 && sqliteDbPushPrepared) {
      assertPlanningSqliteSchema({ cwd: process.cwd(), databasePath: sqliteDbPushPrepared.databasePath });
      assertFinlifeIdentityReady({ cwd: process.cwd(), databasePath: sqliteDbPushPrepared.databasePath });
    }
    process.exit(result.status);
  }
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`[prisma:safe] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
