#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";

const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const BULK_ADVISORY_PATH = "/-/npm/v1/security/advisories/bulk";
const SEVERITY_ORDER = new Map([
  ["critical", 0],
  ["high", 1],
  ["moderate", 2],
  ["low", 3],
  ["info", 4],
]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function parsePackageKey(key) {
  const baseKey = key.split("(", 1)[0];
  const separator = baseKey.lastIndexOf("@");
  if (separator <= 0 || separator === baseKey.length - 1) {
    throw new Error(`unsupported pnpm package key: ${key}`);
  }
  const name = baseKey.slice(0, separator);
  const version = baseKey.slice(separator + 1);
  if (version.startsWith("link:") || version.startsWith("file:")) return null;
  if (!name || !version) throw new Error(`unsupported pnpm package key: ${key}`);
  return { name, version };
}

export function buildBulkAdvisoryPayload(lockfileSource) {
  const parsed = asObject(loadYaml(lockfileSource));
  if (String(parsed?.lockfileVersion ?? "") !== "9.0") {
    throw new Error(`unsupported pnpm lockfileVersion: ${String(parsed?.lockfileVersion ?? "missing")}`);
  }
  const packages = asObject(parsed?.packages);
  if (!packages) throw new Error("pnpm-lock.yaml packages map is missing");

  const versionsByName = new Map();
  for (const key of Object.keys(packages)) {
    const parsedKey = parsePackageKey(key);
    if (!parsedKey) continue;
    const versions = versionsByName.get(parsedKey.name) ?? new Set();
    versions.add(parsedKey.version);
    versionsByName.set(parsedKey.name, versions);
  }
  if (versionsByName.size === 0) throw new Error("pnpm-lock.yaml contains no auditable package versions");

  return Object.fromEntries(
    [...versionsByName.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

export function collectBulkAdvisories(payload) {
  const response = asObject(payload);
  if (!response) throw new Error("bulk advisory response must be an object");

  const advisories = [];
  for (const [packageName, rows] of Object.entries(response)) {
    if (!Array.isArray(rows)) throw new Error(`bulk advisory response for ${packageName} must be an array`);
    for (const row of rows) {
      const advisory = asObject(row);
      if (!advisory) throw new Error(`bulk advisory entry for ${packageName} must be an object`);
      advisories.push({
        packageName,
        severity: typeof advisory.severity === "string" ? advisory.severity.toLowerCase() : "unknown",
        title: typeof advisory.title === "string" ? advisory.title : "untitled advisory",
        vulnerableVersions: typeof advisory.vulnerable_versions === "string" ? advisory.vulnerable_versions : "unknown",
        url: typeof advisory.url === "string" ? advisory.url : "",
      });
    }
  }

  return advisories.sort((left, right) => {
    const severity = (SEVERITY_ORDER.get(left.severity) ?? 99) - (SEVERITY_ORDER.get(right.severity) ?? 99);
    return severity || left.packageName.localeCompare(right.packageName) || left.title.localeCompare(right.title);
  });
}

function resolveRegistryUrl(env) {
  const configured = env.NPM_CONFIG_REGISTRY || env.npm_config_registry || DEFAULT_REGISTRY;
  const registry = new URL(configured);
  if (registry.protocol !== "https:") throw new Error("dependency audit registry must use HTTPS");
  if (registry.username || registry.password) throw new Error("dependency audit registry URL must not contain credentials");
  registry.pathname = `${registry.pathname.replace(/\/$/, "")}${BULK_ADVISORY_PATH}`;
  registry.search = "";
  registry.hash = "";
  return registry;
}

export async function runDependencyAudit(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("global fetch is unavailable");

  const lockfileSource = await fs.readFile(path.join(cwd, "pnpm-lock.yaml"), "utf8");
  const packages = buildBulkAdvisoryPayload(lockfileSource);
  const versionCount = Object.values(packages).reduce((sum, versions) => sum + versions.length, 0);
  const endpoint = resolveRegistryUrl(env);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "finance-deps-audit/1",
    },
    body: JSON.stringify(packages),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`bulk advisory request failed status=${response.status}${detail ? ` detail=${detail}` : ""}`);
  }

  let responsePayload;
  try {
    responsePayload = await response.json();
  } catch {
    throw new Error("bulk advisory response is not valid JSON");
  }
  const advisories = collectBulkAdvisories(responsePayload);
  return {
    ok: advisories.length === 0,
    packageCount: Object.keys(packages).length,
    versionCount,
    advisories,
  };
}

async function main() {
  const result = await runDependencyAudit();
  console.log(
    `[deps:audit] checked packages=${result.packageCount} versions=${result.versionCount} advisories=${result.advisories.length}`,
  );
  for (const advisory of result.advisories) {
    const link = advisory.url ? ` ${advisory.url}` : "";
    console.error(
      `[deps:audit] ${advisory.severity.toUpperCase()} ${advisory.packageName} vulnerable=${advisory.vulnerableVersions} ${advisory.title}${link}`,
    );
  }
  if (!result.ok) process.exit(1);
  console.log("[deps:audit] PASS");
}

const directPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (directPath === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[deps:audit] FAIL ${message}`);
    process.exit(1);
  });
}
