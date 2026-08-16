import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPlanningPackagedRuntime,
  resolvePlanningLegacyServerProductionRoot,
  resolvePlanningRuntimeRoots,
} from "../src/lib/planning/storage/runtimeRoots.mjs";
import { resolvePlanningNonArchiveWriterTarget } from "../src/lib/planning/storage/writerOwnershipRegistry.mjs";

export function resolvePlanningScriptRoots(options = {}) {
  const input = {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    platform: options.platform || process.platform,
    homeDir: options.homeDir || os.homedir(),
  };
  const roots = resolvePlanningRuntimeRoots(input);
  const legacyRoot = resolvePlanningLegacyServerProductionRoot(input);
  if (isPlanningPackagedRuntime(input.env)
    && legacyRoot !== roots.planningRoot
    && fs.existsSync(legacyRoot)) {
    throw new Error(`PATH_MIGRATION_REQUIRED:${legacyRoot}->${roots.planningRoot}`);
  }
  return roots;
}

function resolveRegisteredTarget(targetId, options = {}) {
  return resolvePlanningNonArchiveWriterTarget(targetId, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    platform: options.platform || process.platform,
    homeDir: options.homeDir || os.homedir(),
    externalPath: options.externalPath,
    tempRoot: options.tempRoot,
  }).path;
}

export function resolvePlanningOpsPaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = resolveRegisteredTarget("control.ops", options);
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "ops"), root);
  return Object.freeze({
    root,
    logs: path.join(root, "logs"),
    reports: path.join(root, "reports"),
    state: path.join(root, "state.json"),
  });
}

export function resolvePlanningReleasePaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = resolveRegisteredTarget("output.release", options);
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "release"), root);
  return Object.freeze({
    root,
    logs: path.join(root, "logs"),
    completionRecord: path.join(root, "V2_COMPLETION_RECORD.json"),
  });
}

export function resolvePlanningReportPaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = path.join(resolvePlanningScriptRoots(options).planningRoot, "reports");
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "reports"), root);
  return Object.freeze({ root, samples: path.join(root, "samples") });
}

export function resolvePlanningRegressionPaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = resolveRegisteredTarget("output.regression", options);
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "eval"), root);
  return Object.freeze({ root, latest: path.join(root, "latest.json") });
}

export function resolvePlanningOpenApiPaths(options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = resolveRegisteredTarget("output.openapi", options);
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "openapi"), root);
  return Object.freeze({ root, contract: path.join(root, "planning-v2-api-contract.json") });
}

export function resolvePlanningAssumptionsPath(options = {}) {
  const cwd = options.cwd || process.cwd();
  const canonicalPath = resolveRegisteredTarget("control.assumptions-latest", options);
  assertLegacyPathAbsent(path.join(cwd, ".data", "planning", "assumptions.latest.json"), canonicalPath);
  return canonicalPath;
}

function assertLegacyPathAbsent(legacyPath, canonicalPath) {
  const legacy = path.resolve(legacyPath);
  const canonical = path.resolve(canonicalPath);
  if (legacy === canonical || !fs.existsSync(legacy)) return;
  throw new Error(`PATH_MIGRATION_REQUIRED:${legacy}->${canonical}`);
}
