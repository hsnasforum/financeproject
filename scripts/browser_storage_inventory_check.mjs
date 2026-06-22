#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(ROOT, "docs", "browser-storage-inventory.json");
const SRC_ROOT = path.join(ROOT, "src");
const STORAGE_PATTERN = /\b(?:window\.)?(localStorage|sessionStorage)\b/u;
const STORAGE_GLOBAL_PATTERN = /\b(?:window\.)?(localStorage|sessionStorage)\b/gu;
const VALID_CATEGORIES = new Set([
  "permanent-user-setting",
  "temporary-draft",
  "dev-ops-unlock",
  "legacy-fallback",
]);
const VALID_STORAGE = new Set(["localStorage", "sessionStorage"]);

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

async function walkSource(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSource(absolutePath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) continue;
    out.push(absolutePath);
  }
  return out;
}

async function findStorageFiles() {
  const sourceFiles = await walkSource(SRC_ROOT);
  const matches = [];
  for (const absolutePath of sourceFiles) {
    const source = await fs.readFile(absolutePath, "utf-8");
    if (STORAGE_PATTERN.test(source)) {
      const storageKinds = [...new Set([...source.matchAll(STORAGE_GLOBAL_PATTERN)].map((match) => match[1]))]
        .sort();
      matches.push({
        file: normalizeRel(path.relative(ROOT, absolutePath)),
        storage: storageKinds,
      });
    }
  }
  return matches.sort((a, b) => a.file.localeCompare(b.file));
}

function fail(message, details = []) {
  console.error(`[browser-storage:check] FAIL ${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

function assertArrayOfStrings(value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    fail(`invalid ${fieldName}`);
  }
}

async function main() {
  const raw = await fs.readFile(INVENTORY_PATH, "utf-8");
  const inventory = JSON.parse(raw);
  if (!inventory || typeof inventory !== "object") fail("inventory must be an object");
  if (inventory.version !== 1) fail("inventory.version must be 1");
  assertArrayOfStrings(inventory.allowedCategories, "allowedCategories");
  const declaredAllowedCategories = new Set(inventory.allowedCategories);
  for (const category of VALID_CATEGORIES) {
    if (!declaredAllowedCategories.has(category)) fail(`missing allowed category: ${category}`);
  }
  if (declaredAllowedCategories.size !== VALID_CATEGORIES.size) {
    fail("allowedCategories contains unexpected values", [...declaredAllowedCategories].filter((category) => !VALID_CATEGORIES.has(category)));
  }
  if (!Array.isArray(inventory.files)) fail("inventory.files must be an array");

  const actual = await findStorageFiles();
  const actualByFile = new Map(actual.map((entry) => [entry.file, entry]));
  const inventoryByFile = new Map();
  const invalid = [];

  for (const entry of inventory.files) {
    if (!entry || typeof entry !== "object") {
      invalid.push("entry must be an object");
      continue;
    }
    if (typeof entry.file !== "string" || !entry.file.startsWith("src/")) {
      invalid.push(`${entry.file ?? "<missing>"}: file must start with src/`);
      continue;
    }
    if (inventoryByFile.has(entry.file)) invalid.push(`${entry.file}: duplicate inventory entry`);
    inventoryByFile.set(entry.file, entry);
    assertArrayOfStrings(entry.storage, `${entry.file}.storage`);
    assertArrayOfStrings(entry.categories, `${entry.file}.categories`);
    for (const storage of entry.storage) {
      if (!VALID_STORAGE.has(storage)) invalid.push(`${entry.file}: invalid storage ${storage}`);
    }
    for (const category of entry.categories) {
      if (!VALID_CATEGORIES.has(category)) invalid.push(`${entry.file}: invalid category ${category}`);
    }
    if (typeof entry.purpose !== "string" || entry.purpose.trim().length < 12) {
      invalid.push(`${entry.file}: purpose is missing or too short`);
    }
    if (typeof entry.rscPlan !== "string" || entry.rscPlan.trim().length < 12) {
      invalid.push(`${entry.file}: rscPlan is missing or too short`);
    }
  }

  for (const actualEntry of actual) {
    const inventoryEntry = inventoryByFile.get(actualEntry.file);
    if (!inventoryEntry) {
      invalid.push(`${actualEntry.file}: missing from docs/browser-storage-inventory.json`);
      continue;
    }
    const expectedStorage = [...inventoryEntry.storage].sort();
    if (JSON.stringify(expectedStorage) !== JSON.stringify(actualEntry.storage)) {
      invalid.push(`${actualEntry.file}: storage mismatch inventory=${expectedStorage.join(",")} actual=${actualEntry.storage.join(",")}`);
    }
  }

  for (const file of inventoryByFile.keys()) {
    if (!actualByFile.has(file)) invalid.push(`${file}: inventory entry no longer has browser storage references`);
  }

  if (invalid.length > 0) fail("inventory mismatch", invalid);

  console.log(`[browser-storage:check] PASS files=${actual.length}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  fail(message);
});
