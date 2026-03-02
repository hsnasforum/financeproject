#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";

function parsePlaywrightTag() {
  const pkgPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) return "latest";
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const raw = String(pkg?.devDependencies?.["@playwright/test"] ?? "").trim();
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  if (!match) return "latest";
  return `v${match[1]}-jammy`;
}

function ensureDocker() {
  const probe = spawnSync("docker", ["--version"], { stdio: "ignore" });
  if (probe.status === 0) return;
  console.error("[e2e:docker] docker is not available. Install Docker Desktop/Engine and retry.");
  process.exit(1);
}

function runDocker() {
  const imageTag = parsePlaywrightTag();
  const image = `mcr.microsoft.com/playwright:${imageTag}`;
  const workdir = process.cwd();
  const storeDir = path.join(workdir, ".pnpm-store");

  const inner = [
    "corepack enable",
    "(pnpm -v >/dev/null 2>&1 || npm i -g pnpm@9)",
    "pnpm config set store-dir /work/.pnpm-store",
    "pnpm install --frozen-lockfile",
    "pnpm e2e",
  ].join(" && ");

  const args = [
    "run",
    "--rm",
    "-v",
    `${workdir}:/work`,
    "-v",
    `${storeDir}:/work/.pnpm-store`,
    "-w",
    "/work",
    "-e",
    "E2E_IN_DOCKER=1",
    image,
    "bash",
    "-lc",
    inner,
  ];

  console.log(`[e2e:docker] image=${image}`);
  const run = spawnSync("docker", args, { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

ensureDocker();
runDocker();
