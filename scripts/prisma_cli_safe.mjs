import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolvePlanningSqliteDatabase } from "../src/lib/planning/deployment/runtimeDatabase.mjs";

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
  if (finalArgs[0] !== "db" || finalArgs[1] !== "push") return false;
  const configuredUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!configuredUrl.startsWith("file:")) return false;
  const resolved = resolvePlanningSqliteDatabase({ cwd: process.cwd(), env: process.env });
  fs.mkdirSync(path.dirname(resolved.databasePath), { recursive: true });
  const descriptor = fs.openSync(resolved.databasePath, "a");
  fs.closeSync(descriptor);
  process.env.DATABASE_URL = resolved.databaseUrl;
  return true;
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
  }

  const result = spawnSync(process.execPath, [prismaCliPath, ...finalArgs], {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number") {
    process.exit(result.status);
  }
  process.exit(1);
}

main();
