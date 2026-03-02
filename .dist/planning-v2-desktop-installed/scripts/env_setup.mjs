#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const examplePath = path.join(root, ".env.local.example");
const envLocalPath = path.join(root, ".env.local");

if (!fs.existsSync(examplePath)) {
  console.error(`[env:setup] missing template: ${path.relative(root, examplePath)}`);
  process.exit(1);
}

if (fs.existsSync(envLocalPath)) {
  console.log("[env:setup] .env.local already exists. skipped.");
  process.exit(0);
}

fs.copyFileSync(examplePath, envLocalPath);
console.log("[env:setup] created .env.local from .env.local.example");
