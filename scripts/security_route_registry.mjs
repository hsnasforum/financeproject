const CAPABILITY_AXES = Object.freeze([
  "auth",
  "authorization",
  "locality",
  "originCsrf",
  "rateLimit",
  "audit",
]);

const ROUTE_RISK_LEVELS = Object.freeze(["low", "medium", "high"]);

function capabilities(input = {}) {
  return Object.freeze(Object.fromEntries(
    CAPABILITY_AXES.map((axis) => [axis, input[axis] === true]),
  ));
}

export { CAPABILITY_AXES, ROUTE_RISK_LEVELS };

export const CAPABILITY_PROFILES = Object.freeze({
  publicOrigin: Object.freeze({
    execution: "enabled",
    requirements: capabilities({ originCsrf: true }),
  }),
  authenticatedUser: Object.freeze({
    execution: "enabled",
    requirements: capabilities({
      auth: true,
      authorization: true,
      originCsrf: true,
    }),
  }),
  localOpsNonProduction: Object.freeze({
    execution: "enabled",
    requirements: capabilities({
      locality: true,
      originCsrf: true,
    }),
  }),
  signedLocalOps: Object.freeze({
    execution: "enabled",
    requirements: capabilities({
      auth: true,
      authorization: true,
      locality: true,
      originCsrf: true,
    }),
  }),
  operatorCommand: Object.freeze({
    execution: "enabled",
    requirements: capabilities(),
    alternatives: Object.freeze([
      Object.freeze({
        id: "authenticated-internal-job",
        requirements: capabilities({ auth: true, authorization: true }),
      }),
      Object.freeze({
        id: "local-ops",
        requirements: capabilities({ locality: true, originCsrf: true }),
      }),
    ]),
  }),
  enabledHighCostJob: Object.freeze({
    execution: "enabled",
    requirements: capabilities({
      auth: true,
      authorization: true,
      locality: true,
      originCsrf: true,
      rateLimit: true,
      audit: true,
    }),
  }),
  disabledHttp: Object.freeze({
    execution: "disabled",
    requirements: capabilities(),
  }),
});

export const EXACT_MUTATION_ROUTES = Object.freeze([
  Object.freeze({
    id: "authjs-web-protocol",
    method: "POST",
    file: "src/app/api/auth/[...nextauth]/route.ts",
    risk: "high",
    effect: "auth-protocol",
    audience: "public-web-authentication",
    profile: "publicOrigin",
  }),
  Object.freeze({
    id: "feedback-public-submit",
    method: "POST",
    file: "src/app/api/feedback/route.ts",
    risk: "low",
    effect: "public-submission",
    audience: "public",
    profile: "publicOrigin",
  }),
  Object.freeze({
    id: "feedback-management-update",
    method: "PATCH",
    file: "src/app/api/feedback/[id]/route.ts",
    risk: "medium",
    effect: "ops-write",
    audience: "signed-local-ops",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "ops-backup-export",
    method: "POST",
    file: "src/app/api/ops/backup/export/route.ts",
    risk: "medium",
    effect: "authenticated-ops-backup-export",
    audience: "authenticated-local-ops",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "ops-backup-export-finalize",
    method: "POST",
    file: "src/app/api/ops/backup/export/finalize/route.ts",
    risk: "medium",
    effect: "authenticated-ops-backup-checkpoint",
    audience: "authenticated-local-ops",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "settings-backup-export",
    method: "POST",
    file: "src/app/api/settings/backup/export/route.ts",
    risk: "medium",
    effect: "authenticated-user-backup-export",
    audience: "authenticated-local-user",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "settings-backup-export-finalize",
    method: "POST",
    file: "src/app/api/settings/backup/export/finalize/route.ts",
    risk: "medium",
    effect: "authenticated-user-backup-checkpoint",
    audience: "authenticated-local-user",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "settings-backup-preview",
    method: "POST",
    file: "src/app/api/settings/backup/preview/route.ts",
    risk: "medium",
    effect: "authenticated-user-backup-preview",
    audience: "authenticated-local-user",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "settings-backup-restore",
    method: "POST",
    file: "src/app/api/settings/backup/restore/route.ts",
    risk: "high",
    effect: "authenticated-user-data-restore",
    audience: "authenticated-local-user",
    profile: "signedLocalOps",
  }),
  Object.freeze({
    id: "gov24-simple-find",
    method: "POST",
    file: "src/app/api/gov24/simple-find/route.ts",
    risk: "low",
    effect: "bounded-compute",
    audience: "public",
    profile: "publicOrigin",
  }),
  Object.freeze({
    id: "gov24-full-sync-http",
    method: "POST",
    file: "src/app/api/gov24/sync/route.ts",
    risk: "high",
    effect: "external-job",
    audience: "disabled",
    profile: "disabledHttp",
    disabledContract: Object.freeze({
      allowedImports: Object.freeze(["next/server"]),
      errorCodes: Object.freeze(["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"]),
      statuses: Object.freeze([403, 404]),
      commandHint: "pnpm gov24:sync",
      responsePairs: Object.freeze([
        Object.freeze({ code: "NOT_FOUND", status: 404, hint: "forbidden" }),
        Object.freeze({ code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" }),
      ]),
    }),
  }),
  Object.freeze({
    id: "planner-compute",
    method: "POST",
    file: "src/app/api/planner/compute/route.ts",
    risk: "medium",
    effect: "authenticated-compute",
    audience: "authenticated-user",
    profile: "authenticatedUser",
  }),
  Object.freeze({
    id: "dart-corpcode-build",
    method: "POST",
    file: "src/app/api/public/disclosure/corpcodes/build/route.ts",
    risk: "high",
    effect: "operator-process",
    audience: "local-or-build-token",
    profile: "operatorCommand",
  }),
  Object.freeze({
    id: "recommend-compute",
    method: "POST",
    file: "src/app/api/recommend/route.ts",
    risk: "medium",
    effect: "authenticated-compute",
    audience: "authenticated-user",
    profile: "authenticatedUser",
  }),
  Object.freeze({
    id: "live-smoke-http",
    method: "POST",
    file: "src/app/api/sync/smoke/route.ts",
    risk: "high",
    effect: "process-exec",
    audience: "disabled",
    profile: "disabledHttp",
    disabledContract: Object.freeze({
      allowedImports: Object.freeze(["next/server"]),
      errorCodes: Object.freeze(["NOT_FOUND", "OPERATOR_COMMAND_REQUIRED"]),
      statuses: Object.freeze([403, 404]),
      commandHint: "pnpm live:smoke",
      responsePairs: Object.freeze([
        Object.freeze({ code: "NOT_FOUND", status: 404, hint: "forbidden" }),
        Object.freeze({ code: "OPERATOR_COMMAND_REQUIRED", status: 403, hint: "required" }),
      ]),
    }),
  }),
]);

export const FAMILY_MUTATION_ROUTES = Object.freeze([
  Object.freeze({
    id: "dev-mutations",
    prefix: "src/app/api/dev/",
    risk: "high",
    effect: "local-ops-command",
    audience: "local-ops",
    profile: "localOpsNonProduction",
  }),
  Object.freeze({
    id: "ops-mutations",
    prefix: "src/app/api/ops/",
    risk: "high",
    effect: "local-ops-command",
    audience: "local-ops",
    profile: "localOpsNonProduction",
  }),
  Object.freeze({
    id: "planning-mutations",
    prefix: "src/app/api/planning/",
    risk: "medium",
    effect: "authenticated-user-write",
    audience: "authenticated-user",
    profile: "authenticatedUser",
  }),
]);

export const CAPABILITY_PROVIDERS = Object.freeze([
  Object.freeze({
    module: "src/lib/auth/routeHandlers.ts",
    symbols: Object.freeze(["handleWebAuthPost"]),
    enforcement: "wrapper",
    // Auth.js owns CSRF / OAuth state and PKCE validation, not an app same-origin gate.
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/lib/planning/api/routeAuth.ts",
    symbols: Object.freeze(["withPlanningRouteUser"]),
    enforcement: "wrapper",
    callbackIndexes: Object.freeze([1]),
    provides: capabilities({ auth: true, authorization: true }),
  }),
  Object.freeze({
    module: "src/lib/planning/api/routeAuth.ts",
    symbols: Object.freeze(["requirePlanningRouteUser"]),
    enforcement: "result",
    provides: capabilities({ auth: true, authorization: true }),
  }),
  Object.freeze({
    module: "src/lib/planning/api/writeGuard.ts",
    symbols: Object.freeze(["assertPlanningWriteGuard"]),
    enforcement: "throws",
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/lib/dev/devGuards.ts",
    symbols: Object.freeze(["assertLocalHost"]),
    enforcement: "throws",
    provides: capabilities({ locality: true }),
  }),
  Object.freeze({
    module: "src/lib/dev/devGuards.ts",
    symbols: Object.freeze(["assertSameOrigin", "assertCsrf", "requireCsrf"]),
    enforcement: "throws",
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/lib/dev/devGuards.ts",
    symbols: Object.freeze(["guardDevMutationRequest"]),
    enforcement: "result",
    provides: capabilities({ locality: true, originCsrf: true }),
  }),
  Object.freeze({
    module: "src/app/api/ops/security/_lib.ts",
    symbols: Object.freeze(["guardLocalRequest"]),
    enforcement: "result",
    provides: capabilities({ locality: true, originCsrf: true }),
  }),
  Object.freeze({
    module: "src/app/api/feedback/_lib/managementGuard.ts",
    symbols: Object.freeze(["guardFeedbackManagementAccess"]),
    enforcement: "result",
    provides: capabilities({ auth: true, authorization: true, locality: true }),
  }),
  Object.freeze({
    module: "src/app/api/feedback/_lib/trustedOriginGuard.ts",
    symbols: Object.freeze(["guardFeedbackMutationOrigin"]),
    enforcement: "result",
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/app/api/gov24/_lib/trustedOriginGuard.ts",
    symbols: Object.freeze(["guardGov24MutationOrigin"]),
    enforcement: "result",
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/lib/publicApis/dart/indexBuildGuard.ts",
    symbols: Object.freeze(["canBuildCorpIndex"]),
    enforcement: "result",
    provides: capabilities({ auth: true, authorization: true }),
  }),
  Object.freeze({
    module: "src/lib/planning/security/vaultCsrf.ts",
    symbols: Object.freeze(["consumeVaultCsrfOrThrow"]),
    enforcement: "throws",
    provides: capabilities({ originCsrf: true }),
  }),
  Object.freeze({
    module: "src/lib/audit/auditLogStore.ts",
    symbols: Object.freeze(["append"]),
    enforcement: "effect",
    provides: capabilities({ audit: true }),
  }),
  Object.freeze({
    module: "src/lib/ops/securityAuditLog.ts",
    symbols: Object.freeze(["appendOpsAuditEvent"]),
    enforcement: "effect",
    provides: capabilities({ audit: true }),
  }),
  Object.freeze({
    module: "src/lib/planning/server/profiles/routeService.ts",
    symbols: Object.freeze([
      "recordCurrentUserProfileAudit",
      "recordCurrentUserProfileTrashAudit",
    ]),
    enforcement: "effect",
    provides: capabilities({ audit: true }),
  }),
]);

export const ROUTE_SECURITY_REGISTRY = Object.freeze({
  profiles: CAPABILITY_PROFILES,
  exactRoutes: EXACT_MUTATION_ROUTES,
  familyRoutes: FAMILY_MUTATION_ROUTES,
  providers: CAPABILITY_PROVIDERS,
});

export function mutationRouteKey(method, file) {
  return `${String(method).toUpperCase()} ${String(file).replaceAll("\\", "/")}`;
}

export function resolveMutationRouteContract(method, file, registry = ROUTE_SECURITY_REGISTRY) {
  const normalizedMethod = String(method).toUpperCase();
  const normalizedFile = String(file).replaceAll("\\", "/");
  const exactMatches = registry.exactRoutes.filter(
    (entry) => entry.method === normalizedMethod && entry.file === normalizedFile,
  );
  if (exactMatches.length > 1) {
    return { ok: false, reason: "duplicate-exact", matches: exactMatches };
  }
  if (exactMatches.length === 1) {
    return { ok: true, source: "exact", contract: exactMatches[0] };
  }

  const familyMatches = registry.familyRoutes.filter((entry) => normalizedFile.startsWith(entry.prefix));
  if (familyMatches.length === 0) {
    return { ok: false, reason: "unclassified", matches: [] };
  }
  if (familyMatches.length > 1) {
    return { ok: false, reason: "ambiguous-family", matches: familyMatches };
  }
  return { ok: true, source: "family", contract: familyMatches[0] };
}

export function validateRouteSecurityRegistry(registry = ROUTE_SECURITY_REGISTRY) {
  const issues = [];
  const exactKeys = new Set();
  const familyIds = new Set();
  const riskLevels = new Set(ROUTE_RISK_LEVELS);
  const enforcementModes = new Set(["throws", "result", "wrapper", "effect"]);

  for (const [name, profile] of Object.entries(registry.profiles)) {
    if (profile.execution !== "enabled" && profile.execution !== "disabled") {
      issues.push(`profile ${name}: invalid execution mode`);
    }
    for (const axis of CAPABILITY_AXES) {
      if (typeof profile.requirements?.[axis] !== "boolean") {
        issues.push(`profile ${name}: missing boolean capability axis ${axis}`);
      }
    }
    if (profile.alternatives !== undefined) {
      if (!Array.isArray(profile.alternatives) || profile.alternatives.length < 2) {
        issues.push(`profile ${name}: alternatives must contain at least two requirement sets`);
      } else {
        const alternativeIds = new Set();
        for (const alternative of profile.alternatives) {
          if (typeof alternative.id !== "string" || !alternative.id.trim() || alternativeIds.has(alternative.id)) {
            issues.push(`profile ${name}: alternative ids must be unique non-empty strings`);
          }
          alternativeIds.add(alternative.id);
          for (const axis of CAPABILITY_AXES) {
            if (typeof alternative.requirements?.[axis] !== "boolean") {
              issues.push(`profile ${name}/${alternative.id}: missing boolean capability axis ${axis}`);
            }
          }
        }
      }
    }
  }

  for (const entry of registry.exactRoutes) {
    const key = mutationRouteKey(entry.method, entry.file);
    if (exactKeys.has(key)) issues.push(`duplicate exact route ${key}`);
    exactKeys.add(key);
    if (!registry.profiles[entry.profile]) issues.push(`exact route ${key}: unknown profile ${entry.profile}`);
    if (!riskLevels.has(entry.risk)) issues.push(`exact route ${key}: invalid risk ${entry.risk}`);
    if (typeof entry.effect !== "string" || !entry.effect.trim()) issues.push(`exact route ${key}: missing effect`);
    if (typeof entry.audience !== "string" || !entry.audience.trim()) issues.push(`exact route ${key}: missing audience`);
    if (registry.profiles[entry.profile]?.execution === "disabled" && !entry.disabledContract) {
      issues.push(`exact route ${key}: disabled profile requires disabledContract`);
    }
    if (registry.profiles[entry.profile]?.execution === "disabled" && entry.disabledContract) {
      const responsePairs = entry.disabledContract.responsePairs;
      if (!Array.isArray(responsePairs) || responsePairs.length === 0) {
        issues.push(`exact route ${key}: disabledContract requires responsePairs`);
      } else {
        const pairKeys = new Set();
        for (const pair of responsePairs) {
          const pairKey = `${pair.code}/${pair.status}`;
          if (
            typeof pair.code !== "string"
            || !pair.code.trim()
            || !Number.isInteger(pair.status)
            || !["required", "forbidden", "optional"].includes(pair.hint)
            || pairKeys.has(pairKey)
          ) {
            issues.push(`exact route ${key}: invalid disabled response pair ${pairKey}`);
          }
          pairKeys.add(pairKey);
        }
      }
    }
  }

  for (const entry of registry.familyRoutes) {
    if (familyIds.has(entry.id)) issues.push(`duplicate family id ${entry.id}`);
    familyIds.add(entry.id);
    if (!entry.prefix?.endsWith("/")) issues.push(`family ${entry.id}: prefix must end with /`);
    if (!registry.profiles[entry.profile]) issues.push(`family ${entry.id}: unknown profile ${entry.profile}`);
    if (!riskLevels.has(entry.risk)) issues.push(`family ${entry.id}: invalid risk ${entry.risk}`);
    if (typeof entry.effect !== "string" || !entry.effect.trim()) issues.push(`family ${entry.id}: missing effect`);
    if (typeof entry.audience !== "string" || !entry.audience.trim()) issues.push(`family ${entry.id}: missing audience`);
    if (registry.profiles[entry.profile]?.execution === "disabled") {
      issues.push(`family ${entry.id}: disabled profiles must use exact routes`);
    }
  }

  for (const provider of registry.providers) {
    if (typeof provider.module !== "string" || !provider.module.trim()) {
      issues.push("capability provider: missing module");
    }
    if (!Array.isArray(provider.symbols) || provider.symbols.length === 0) {
      issues.push(`capability provider ${provider.module}: missing symbols`);
    }
    if (!enforcementModes.has(provider.enforcement)) {
      issues.push(`capability provider ${provider.module}: invalid enforcement ${provider.enforcement}`);
    }
    if (
      provider.callbackIndexes !== undefined
      && (
        !Array.isArray(provider.callbackIndexes)
        || provider.callbackIndexes.some((index) => !Number.isInteger(index) || index < 0)
      )
    ) {
      issues.push(`capability provider ${provider.module}: callbackIndexes must be non-negative integers`);
    }
    for (const axis of CAPABILITY_AXES) {
      if (typeof provider.provides?.[axis] !== "boolean") {
        issues.push(`capability provider ${provider.module}: missing boolean capability axis ${axis}`);
      }
    }
  }

  return issues;
}
