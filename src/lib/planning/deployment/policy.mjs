export const PLANNING_DEPLOYMENT_MODES = Object.freeze([
  "desktop-local",
  "web-single",
  "web-multi",
]);

const SUCCESS_DECISION = Object.freeze({
  ok: true,
  mode: "desktop-local",
  bindHost: "127.0.0.1",
  localOnly: true,
  remoteAccessAllowed: false,
  proxyTrust: "none",
  forwardedHeadersTrusted: false,
  processModel: "single",
  writerExclusivity: "data-root-exclusive",
  singleWriter: true,
  dataRootKind: "local",
  userScope: "default",
  databaseProvider: "sqlite",
  databaseConnection: "file",
  identityMode: "desktop-local-session",
  identityProvenance: "launcher-process",
  rawTrustedAuthHeadersAllowed: false,
  restoreApplyAllowed: false,
});

const MODE_FAILURES = Object.freeze({
  missing: Object.freeze({
    ok: false,
    code: "DEPLOYMENT_MODE_MISSING",
    message: "Planning deployment mode is required.",
  }),
  unknown: Object.freeze({
    ok: false,
    code: "DEPLOYMENT_MODE_UNKNOWN",
    message: "Planning deployment mode is unknown.",
  }),
  unsupported: Object.freeze({
    ok: false,
    code: "DEPLOYMENT_MODE_UNSUPPORTED",
    message: "Planning deployment mode is not supported.",
  }),
});

function isMissingMode(mode) {
  return mode === null
    || typeof mode === "undefined"
    || (typeof mode === "string" && mode.trim().length === 0);
}

function isKnownMode(mode) {
  return typeof mode === "string" && PLANNING_DEPLOYMENT_MODES.includes(mode);
}

function policyFailure(conflicts) {
  const immutableConflicts = Object.freeze([...conflicts]);
  const identityOnly = immutableConflicts.length === 1
    && immutableConflicts[0] === "desktopLocalIdentityReady";

  return Object.freeze({
    ok: false,
    code: identityOnly ? "DEPLOYMENT_AUTH_NOT_READY" : "DEPLOYMENT_POLICY_CONFLICT",
    message: identityOnly
      ? "Desktop-local identity is not ready."
      : "Desktop-local deployment policy conflicts with the supplied facts.",
    conflicts: immutableConflicts,
  });
}

function desktopLocalConflicts(input) {
  const conflicts = [];

  if (input?.requestedBindHost !== "127.0.0.1") {
    conflicts.push("requestedBindHost");
  }
  if (input?.proxyMode !== "none") {
    conflicts.push("proxyMode");
  }
  if (input?.forwardedHeadersTrusted !== false) {
    conflicts.push("forwardedHeadersTrusted");
  }
  if (input?.rawTrustedAuthHeadersEnabled !== false) {
    conflicts.push("rawTrustedAuthHeadersEnabled");
  }
  if (input?.desktopLocalIdentityMode !== "desktop-local-session") {
    conflicts.push("desktopLocalIdentityMode");
  }
  if (input?.desktopLocalIdentityProvenance !== "launcher-process") {
    conflicts.push("desktopLocalIdentityProvenance");
  }
  if (input?.processModel !== "single") {
    conflicts.push("processModel");
  }
  if (input?.writerExclusivity !== "data-root-exclusive") {
    conflicts.push("writerExclusivity");
  }
  if (input?.singleUserModeEnabled !== true) {
    conflicts.push("singleUserModeEnabled");
  }
  if (input?.namespaceEnabled !== false) {
    conflicts.push("namespaceEnabled");
  }
  if (input?.dataRootKind !== "local") {
    conflicts.push("dataRootKind");
  }
  if (input?.databaseProvider !== "sqlite") {
    conflicts.push("databaseProvider");
  }
  if (input?.databaseConnection !== "file") {
    conflicts.push("databaseConnection");
  }
  if (input?.desktopLocalIdentityReady !== true) {
    conflicts.push("desktopLocalIdentityReady");
  }

  return conflicts;
}

export function resolvePlanningDeploymentPolicy(input) {
  const mode = input?.mode;

  if (isMissingMode(mode)) {
    return MODE_FAILURES.missing;
  }
  if (!isKnownMode(mode)) {
    return MODE_FAILURES.unknown;
  }
  if (mode !== "desktop-local") {
    return MODE_FAILURES.unsupported;
  }

  const conflicts = desktopLocalConflicts(input);
  if (conflicts.length > 0) {
    return policyFailure(conflicts);
  }

  return Object.freeze({ ...SUCCESS_DECISION });
}
