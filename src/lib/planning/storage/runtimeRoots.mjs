import path from "node:path";

const DEFAULT_APP_NAME = "PlanningV2";
const PACKAGED_TRUE_SET = new Set(["1", "true", "yes", "on", "packaged", "desktop"]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function sanitizePlanningAppName(value) {
  const raw = asString(value);
  if (!raw) return DEFAULT_APP_NAME;
  const sanitized = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-").trim();
  return !sanitized || sanitized === "." || sanitized === ".." ? DEFAULT_APP_NAME : sanitized;
}

export function isPlanningPackagedRuntime(env) {
  const normalized = (value) => PACKAGED_TRUE_SET.has(asString(value).toLowerCase());
  return normalized(env.PLANNING_PACKAGED_MODE)
    || normalized(env.PLANNING_RUNTIME_PACKAGED)
    || asString(env.PLANNING_RUNTIME_MODE).toLowerCase() === "packaged";
}

export function normalizePlanningRuntimePlatform(value) {
  if (value === "win32" || value === "darwin") return value;
  return "linux";
}

function pathApiFor(input) {
  if (input.platform !== "win32") return path.posix;
  const candidates = [
    input.cwd,
    input.homeDir,
    input.env.PLANNING_DATA_DIR,
    input.env.LOCALAPPDATA,
    input.env.APPDATA,
  ].map(asString).filter(Boolean);
  return candidates.some((value) => /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(value)) ? path.win32 : path.posix;
}

function windowsBaseDir(env, homeDir, pathApi) {
  return asString(env.LOCALAPPDATA)
    || asString(env.APPDATA)
    || pathApi.join(homeDir, "AppData", "Local");
}

function packagedBaseDir({ env, homeDir, platform, pathApi }) {
  if (platform === "win32") return windowsBaseDir(env, homeDir, pathApi);
  if (platform === "darwin") return pathApi.join(homeDir, "Library", "Application Support");
  return asString(env.XDG_DATA_HOME) || pathApi.join(homeDir, ".local", "share");
}

function productionBaseDir({ env, homeDir, platform, pathApi }) {
  if (platform === "win32") return windowsBaseDir(env, homeDir, pathApi);
  return asString(env.XDG_DATA_HOME) || pathApi.join(homeDir, ".local", "share");
}

export function resolvePlanningRuntimeRoots(input) {
  const pathApi = pathApiFor(input);
  const cwd = pathApi.resolve(input.cwd);
  const env = Object.freeze({ ...input.env });
  const homeDir = pathApi.resolve(input.homeDir);
  const platform = input.platform;
  const explicit = asString(env.PLANNING_DATA_DIR);

  let mode;
  let planningRoot;
  if (explicit) {
    mode = "explicit";
    planningRoot = pathApi.resolve(cwd, explicit);
  } else if (isPlanningPackagedRuntime(env)) {
    mode = "packaged";
    planningRoot = pathApi.resolve(
      packagedBaseDir({ env, homeDir, platform, pathApi }),
      sanitizePlanningAppName(env.PLANNING_APP_NAME),
      "vault",
    );
  } else if (env.NODE_ENV === "production") {
    mode = "production";
    planningRoot = pathApi.resolve(
      productionBaseDir({ env, homeDir, platform, pathApi }),
      sanitizePlanningAppName(env.PLANNING_APP_NAME),
      "vault",
    );
  } else {
    mode = "development";
    planningRoot = pathApi.resolve(cwd, ".data", "planning");
  }

  const runtimeRoot = pathApi.dirname(planningRoot);
  const controlRoot = explicit
    ? pathApi.join(planningRoot, "runtime")
    : pathApi.join(runtimeRoot, "runtime");

  return Object.freeze({
    mode,
    planningRoot: pathApi.resolve(planningRoot),
    runtimeRoot: pathApi.resolve(runtimeRoot),
    controlRoot: pathApi.resolve(controlRoot),
  });
}

export function resolvePlanningLegacyServerProductionRoot(input) {
  const pathApi = pathApiFor(input);
  const cwd = pathApi.resolve(input.cwd);
  const env = Object.freeze({ ...input.env });
  const homeDir = pathApi.resolve(input.homeDir);
  const explicit = asString(env.PLANNING_DATA_DIR);
  if (explicit) return pathApi.resolve(cwd, explicit);
  return pathApi.resolve(
    productionBaseDir({ env, homeDir, platform: input.platform, pathApi }),
    sanitizePlanningAppName(env.PLANNING_APP_NAME),
    "vault",
  );
}
