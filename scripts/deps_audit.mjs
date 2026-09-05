#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";

const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const BULK_ADVISORY_PATH = "/-/npm/v1/security/advisories/bulk";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000];
const RETRYABLE_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
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

function readStringProperty(value, property) {
  const object = asObject(value);
  return typeof object?.[property] === "string" ? object[property] : "";
}

function hasRetryableNetworkCode(error) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    const code = readStringProperty(current, "code").toUpperCase();
    if (RETRYABLE_NETWORK_CODES.has(code)) return true;
    current = asObject(current)?.cause;
  }
  return false;
}

function isTimeoutFailure(error, signal) {
  if (!signal.aborted) return false;
  const errorName = readStringProperty(error, "name");
  if (errorName === "TimeoutError") return true;
  if (errorName !== "AbortError") return false;
  return [signal.reason, asObject(error)?.cause]
    .some((value) => readStringProperty(value, "name") === "TimeoutError");
}

function isRetryableNetworkFailure(error) {
  return hasRetryableNetworkCode(error);
}

function classifyTransientFailure(error, signal) {
  if (isTimeoutFailure(error, signal)) return "timeout";
  if (isRetryableNetworkFailure(error)) return "network";
  return null;
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function createAuditFailure(message, attempts, lastPhase, lastReason, cause) {
  const error = new Error(
    `attempts=${attempts} lastPhase=${lastPhase} lastReason=${lastReason} ${message}`,
    cause === undefined ? undefined : { cause },
  );
  error.attempts = attempts;
  error.lastPhase = lastPhase;
  error.lastReason = lastReason;
  return error;
}

function validateRetryPolicy(options) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("dependency audit maxAttempts must be a positive integer");
  }
  if (!Number.isSafeInteger(attemptTimeoutMs) || attemptTimeoutMs < 1) {
    throw new Error("dependency audit attemptTimeoutMs must be a positive integer");
  }
  if (!Array.isArray(retryDelaysMs) || retryDelaysMs.length < maxAttempts - 1) {
    throw new Error("dependency audit retryDelaysMs must cover every retry");
  }
  if (retryDelaysMs.some((delay) => !Number.isSafeInteger(delay) || delay < 0)) {
    throw new Error("dependency audit retry delays must be non-negative integers");
  }

  return {
    maxAttempts,
    attemptTimeoutMs,
    retryDelaysMs: retryDelaysMs.slice(0, maxAttempts - 1),
  };
}

function elapsedSince(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function logRetry(logger, { attempt, maxAttempts, phase, reason, elapsedMs, nextDelayMs }) {
  logger(
    `[deps:audit] RETRY attempt=${attempt}/${maxAttempts} phase=${phase} reason=${reason} elapsedMs=${elapsedMs} retrying=true nextDelayMs=${nextDelayMs}`,
  );
}

function logStop(logger, { attempt, maxAttempts, phase, reason, elapsedMs }) {
  logger(
    `[deps:audit] STOP attempt=${attempt}/${maxAttempts} phase=${phase} reason=${reason} elapsedMs=${elapsedMs} retrying=false nextDelayMs=0`,
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const sleepImpl = options.sleepImpl ?? sleep;
  const logger = options.logger ?? (() => {});
  const timeoutSignalFactory = options.timeoutSignalFactory ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs));
  if (typeof fetchImpl !== "function") throw new Error("global fetch is unavailable");
  if (typeof sleepImpl !== "function") throw new Error("dependency audit sleepImpl must be a function");
  if (typeof logger !== "function") throw new Error("dependency audit logger must be a function");
  if (typeof timeoutSignalFactory !== "function") {
    throw new Error("dependency audit timeoutSignalFactory must be a function");
  }
  const { maxAttempts, attemptTimeoutMs, retryDelaysMs } = validateRetryPolicy(options);

  const lockfileSource = await fs.readFile(path.join(cwd, "pnpm-lock.yaml"), "utf8");
  const packages = buildBulkAdvisoryPayload(lockfileSource);
  const versionCount = Object.values(packages).reduce((sum, versions) => sum + versions.length, 0);
  const endpoint = resolveRegistryUrl(env);
  const requestBody = JSON.stringify(packages);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    logger(`[deps:audit] attempt=${attempt}/${maxAttempts}`);
    const startedAt = Date.now();
    const signal = timeoutSignalFactory(attemptTimeoutMs);
    let response;

    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "finance-deps-audit/1",
        },
        body: requestBody,
        signal,
      });
    } catch (error) {
      const phase = "fetch";
      const reason = classifyTransientFailure(error, signal) ?? "request_error";
      const elapsedMs = elapsedSince(startedAt);
      const canRetry = reason !== "request_error" && attempt < maxAttempts;
      if (canRetry) {
        const nextDelayMs = retryDelaysMs[attempt - 1];
        logRetry(logger, { attempt, maxAttempts, phase, reason, elapsedMs, nextDelayMs });
        await sleepImpl(nextDelayMs);
        continue;
      }

      logStop(logger, { attempt, maxAttempts, phase, reason, elapsedMs });
      const message = reason === "timeout"
        ? `bulk advisory request timed out after ${attemptTimeoutMs}ms: ${describeError(error)}`
        : `bulk advisory request failed before receiving a response: ${describeError(error)}`;
      throw createAuditFailure(message, attempt, phase, reason, error);
    }

    if (!response.ok) {
      const phase = "http_status";
      const statusReason = Number.isInteger(response.status) ? `http_${response.status}` : "http_unknown";
      let detail = "";
      let detailError;
      try {
        detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
      } catch (error) {
        detailError = error;
      }
      const elapsedMs = elapsedSince(startedAt);
      const canRetry = RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < maxAttempts;
      if (canRetry) {
        const nextDelayMs = retryDelaysMs[attempt - 1];
        logRetry(logger, { attempt, maxAttempts, phase, reason: statusReason, elapsedMs, nextDelayMs });
        await sleepImpl(nextDelayMs);
        continue;
      }

      logStop(logger, { attempt, maxAttempts, phase, reason: statusReason, elapsedMs });
      throw createAuditFailure(
        `bulk advisory request failed status=${response.status}${detail ? ` detail=${detail}` : ""}`,
        attempt,
        phase,
        statusReason,
        detailError,
      );
    }

    let responsePayload;
    try {
      responsePayload = await response.json();
    } catch (error) {
      const reason = classifyTransientFailure(error, signal) ?? "invalid_json";
      const phase = reason === "invalid_json" ? "response_parse" : "response_body";
      const elapsedMs = elapsedSince(startedAt);
      const canRetry = reason !== "invalid_json" && attempt < maxAttempts;
      if (canRetry) {
        const nextDelayMs = retryDelaysMs[attempt - 1];
        logRetry(logger, { attempt, maxAttempts, phase, reason, elapsedMs, nextDelayMs });
        await sleepImpl(nextDelayMs);
        continue;
      }

      logStop(logger, {
        attempt,
        maxAttempts,
        phase,
        reason,
        elapsedMs,
      });
      const message = reason === "timeout"
        ? `bulk advisory response body timed out after ${attemptTimeoutMs}ms: ${describeError(error)}`
        : reason === "network"
          ? `bulk advisory response body failed: ${describeError(error)}`
          : "bulk advisory response is not valid JSON";
      throw createAuditFailure(message, attempt, phase, reason, error);
    }

    let advisories;
    try {
      advisories = collectBulkAdvisories(responsePayload);
    } catch (error) {
      logStop(logger, {
        attempt,
        maxAttempts,
        phase: "response_parse",
        reason: "invalid_response",
        elapsedMs: elapsedSince(startedAt),
      });
      throw createAuditFailure(describeError(error), attempt, "response_parse", "invalid_response", error);
    }

    logger(
      `[deps:audit] checked packages=${Object.keys(packages).length} versions=${versionCount} advisories=${advisories.length} attempts=${attempt}`,
    );
    return {
      ok: advisories.length === 0,
      packageCount: Object.keys(packages).length,
      versionCount,
      advisories,
    };
  }

  throw new Error("dependency audit exhausted attempts without a result");
}

async function main() {
  const result = await runDependencyAudit({ logger: (message) => console.log(message) });
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
