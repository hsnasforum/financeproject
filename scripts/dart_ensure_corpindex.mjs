#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const envPath = (process.env.DART_CORPCODES_INDEX_PATH ?? "").trim();
const primaryPath = envPath ? path.resolve(root, envPath) : path.join(root, "tmp", "dart", "corpCodes.index.json");
const tmpFallbackPath = path.join(root, "tmp", "dart", "corpCodes.index.json");
const legacyFallbackPath = path.join(root, "src", "data", "dart", "corpCodes.json");
const triedPaths = [primaryPath];
if (!triedPaths.includes(tmpFallbackPath)) triedPaths.push(tmpFallbackPath);
if (!triedPaths.includes(legacyFallbackPath)) triedPaths.push(legacyFallbackPath);
const scriptPath = path.join(root, "scripts", "dart_corpcode_build.py");

for (const candidatePath of triedPaths) {
  if (fs.existsSync(candidatePath)) {
    console.log(`[dart:ensure-corpindex] index exists: ${candidatePath}`);
    process.exit(0);
  }
}

if (!(process.env.OPENDART_API_KEY ?? "").trim()) {
  console.log("[dart:ensure-corpindex] skip: OPENDART_API_KEY is missing");
  process.exit(0);
}

const args = [scriptPath, "--out", primaryPath];
const first = spawnSync("python3", args, { cwd: root, stdio: "inherit", timeout: 120_000 });
if (first.status === 0) {
  process.exit(0);
}
if (first.error && first.error.code !== "ENOENT") {
  process.exit(first.status ?? 1);
}

const second = spawnSync("python", args, { cwd: root, stdio: "inherit", timeout: 120_000 });
if (second.status === 0) {
  process.exit(0);
}

if (second.error && second.error.code === "ENOENT") {
  console.log("[dart:ensure-corpindex] skip: python executable is missing");
  process.exit(0);
}

process.exit(second.status ?? 1);
