import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

function preloadEnv() {
  const cwd = process.cwd();
  const candidates = [".env.local", "env.local", ".env"];
  const loaded = [];

  for (const name of candidates) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
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

function resolvePrismaBin() {
  const binName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  return path.join(process.cwd(), "node_modules", ".bin", binName);
}

function main() {
  const loaded = preloadEnv();
  const prismaBin = resolvePrismaBin();

  if (!fs.existsSync(prismaBin)) {
    console.error("[prisma:safe] prisma binary not found in node_modules/.bin");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const finalArgs = args.length > 0 ? args : ["generate"];

  console.log(`[prisma:safe] env loaded: ${loaded.length > 0 ? loaded.join(",") : "none"}`);
  console.log(`[prisma:safe] PRISMA_ENGINES_MIRROR host: ${mirrorHost()}`);
  console.log(`[prisma:safe] HTTP_PROXY: ${envState("HTTP_PROXY")}`);
  console.log(`[prisma:safe] HTTPS_PROXY: ${envState("HTTPS_PROXY")}`);
  console.log(`[prisma:safe] NO_PROXY: ${envState("NO_PROXY")}`);

  const result = spawnSync(prismaBin, finalArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number") {
    process.exit(result.status);
  }
  process.exit(1);
}

main();
