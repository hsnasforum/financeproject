#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PLAYWRIGHT_TEST_MATCH = [
  "tests/e2e/**/*.spec.ts",
  "e2e/**/*.e2e.ts",
];

export const PLAYWRIGHT_TEST_IGNORE = [
  "**/.next*/**",
  "**/.dist/**",
  "**/node_modules/**",
  "**/tmp/**",
];

export const INTENTIONAL_E2E_EXCLUSIONS = {};

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isPlaywrightIncludedPath(filePath) {
  const normalized = normalizePath(filePath);
  return (
    (normalized.startsWith("tests/e2e/") && normalized.endsWith(".spec.ts"))
    || (normalized.startsWith("e2e/") && normalized.endsWith(".e2e.ts"))
  );
}

export function classifyE2EInventory(filePaths) {
  const candidates = [...new Set(filePaths.map(normalizePath).filter(Boolean))].sort();
  const included = [];
  const excluded = [];
  const unaccounted = [];

  for (const filePath of candidates) {
    if (isPlaywrightIncludedPath(filePath)) {
      included.push(filePath);
      continue;
    }
    const reason = INTENTIONAL_E2E_EXCLUSIONS[filePath];
    if (typeof reason === "string" && reason.trim()) {
      excluded.push({ filePath, reason });
      continue;
    }
    unaccounted.push(filePath);
  }

  const candidateSet = new Set(candidates);
  const staleExclusions = Object.keys(INTENTIONAL_E2E_EXCLUSIONS)
    .filter((filePath) => !candidateSet.has(filePath))
    .sort();

  return { candidates, included, excluded, unaccounted, staleExclusions };
}

export function assertPlaywrightConfigContract(source) {
  const failures = [];
  if (!/testDir:\s*["']\.["']/.test(source)) {
    failures.push("playwright testDir must be repository root");
  }
  for (const pattern of PLAYWRIGHT_TEST_MATCH) {
    if (!source.includes(`"${pattern}"`) && !source.includes(`'${pattern}'`)) {
      failures.push(`playwright testMatch is missing ${pattern}`);
    }
  }
  for (const pattern of PLAYWRIGHT_TEST_IGNORE) {
    if (!source.includes(`"${pattern}"`) && !source.includes(`'${pattern}'`)) {
      failures.push(`playwright testIgnore is missing ${pattern}`);
    }
  }
  return failures;
}

function readTrackedE2ECandidates(cwd) {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.spec.ts",
      "*.spec.js",
      "*.e2e.ts",
      "*.e2e.js",
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${String(result.stderr ?? "").trim()}`);
  }
  return String(result.stdout ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((filePath) => {
      try {
        fs.lstatSync(path.join(cwd, filePath));
        return true;
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") return false;
        throw error;
      }
    });
}

export function verifyE2EInventory(cwd = process.cwd()) {
  const inventory = classifyE2EInventory(readTrackedE2ECandidates(cwd));
  const configPath = path.join(cwd, "playwright.config.ts");
  const configFailures = assertPlaywrightConfigContract(fs.readFileSync(configPath, "utf8"));
  const failures = [
    ...inventory.unaccounted.map((filePath) => `unaccounted E2E file: ${filePath}`),
    ...inventory.staleExclusions.map((filePath) => `stale E2E exclusion: ${filePath}`),
    ...configFailures,
  ];
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return inventory;
}

function isEntrypoint() {
  const entry = process.argv[1];
  return Boolean(entry) && path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  try {
    const result = verifyE2EInventory();
    process.stdout.write(
      `[e2e:inventory] PASS included=${result.included.length} excluded=${result.excluded.length}\n`,
    );
  } catch (error) {
    process.stderr.write(`[e2e:inventory] FAIL\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
