import { resolvePlanningDeploymentPolicy } from "./policy.mjs";

export const PLANNING_RUNTIME_ATTESTATION = "desktop-launcher-v1";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value, fallback = false) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function oneOf(value, allowed, fallback) {
  const normalized = asString(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

export function isDesktopLocalDeploymentRequested(env = {}) {
  return asString(env.PLANNING_DEPLOYMENT_MODE) === "desktop-local";
}

export function normalizePlanningRuntimePolicyInput(env = {}) {
  const attested = asString(env.PLANNING_RUNTIME_ATTESTATION) === PLANNING_RUNTIME_ATTESTATION;
  const sessionToken = asString(env.PLANNING_DESKTOP_SESSION_TOKEN);
  const sessionTokenReady = /^[A-Za-z0-9_-]{43,}$/.test(sessionToken);

  return {
    mode: asString(env.PLANNING_DEPLOYMENT_MODE) || undefined,
    requestedBindHost: asString(env.PLANNING_RUNTIME_BIND_HOST) || undefined,
    singleUserModeEnabled: parseBoolean(env.PLANNING_SINGLE_USER_MODE, false),
    namespaceEnabled: parseBoolean(env.PLANNING_NAMESPACE_ENABLED, false),
    forwardedHeadersTrusted: parseBoolean(env.PLANNING_FORWARDED_HEADERS_TRUSTED, false),
    rawTrustedAuthHeadersEnabled: parseBoolean(env.PLANNING_TRUST_AUTH_HEADERS, false),
    desktopLocalIdentityMode: oneOf(
      env.PLANNING_DESKTOP_IDENTITY_MODE,
      ["desktop-local-session", "other"],
      "unknown",
    ),
    desktopLocalIdentityProvenance: oneOf(
      env.PLANNING_DESKTOP_IDENTITY_PROVENANCE,
      ["launcher-process", "other"],
      "unknown",
    ),
    desktopLocalIdentityReady: attested
      && parseBoolean(env.PLANNING_DESKTOP_IDENTITY_READY, false)
      && sessionTokenReady,
    databaseProvider: oneOf(
      env.PLANNING_DATABASE_PROVIDER,
      ["sqlite", "postgresql"],
      "unknown",
    ),
    databaseConnection: oneOf(
      env.PLANNING_DATABASE_CONNECTION,
      ["file", "network"],
      "unknown",
    ),
    processModel: oneOf(
      env.PLANNING_PROCESS_MODEL,
      ["single", "multi"],
      "unknown",
    ),
    writerExclusivity: attested
      ? oneOf(
        env.PLANNING_WRITER_EXCLUSIVITY,
        ["data-root-exclusive", "process-local-only", "multi-writer"],
        "unknown",
      )
      : "unknown",
    dataRootKind: attested
      ? oneOf(env.PLANNING_DATA_ROOT_KIND, ["local", "shared"], "unknown")
      : "unknown",
    proxyMode: oneOf(
      env.PLANNING_PROXY_MODE,
      ["none", "trusted", "untrusted"],
      "unknown",
    ),
  };
}

export function resolvePlanningRuntimePolicy(env = {}) {
  return resolvePlanningDeploymentPolicy(normalizePlanningRuntimePolicyInput(env));
}

export class PlanningRuntimePolicyError extends Error {
  constructor(decision) {
    super(decision.message);
    this.name = "PlanningRuntimePolicyError";
    this.code = decision.code;
    this.conflicts = decision.conflicts ?? [];
  }
}

export function assertPlanningRuntimePolicy(env = {}) {
  const decision = resolvePlanningRuntimePolicy(env);
  if (decision.ok) return decision;
  throw new PlanningRuntimePolicyError(decision);
}
