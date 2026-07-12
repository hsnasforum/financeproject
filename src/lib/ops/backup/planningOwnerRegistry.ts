import path from "node:path";
import { resolvePlanningDataDir } from "../../planning/server/runtime/dataDir";
import {
  isPlanningNamespaceEnabled,
  isPlanningSingleUserModeEnabled,
  resolvePlanningUserId,
} from "../../planning/store/namespace";

export const PLANNING_DATA_OWNER_IDS = [
  "stable.profile-run-vault",
  "stable.reports",
  "v3.accounts",
  "v3.opening-balances",
  "v3.batches",
  "v3.drafts",
  "v3.category-rules",
  "v3.transaction-overrides",
  "v3.news",
  "v3.indicators",
  "v3.alerts",
  "v3.journal",
  "v3.exposure",
  "v3.csv-drafts",
  "v3.routines",
  "v3.scenario-overrides",
  "v3.legacy-transactions",
] as const;

export type PlanningDataOwnerId = typeof PLANNING_DATA_OWNER_IDS[number];

export type PlanningOwnerNamespace =
  | { mode: "shared" }
  | { mode: "user"; userId: string };

export type PlanningArchiveContextInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  userId?: string;
};

export type PlanningArchiveContext = Readonly<{
  cwd: string;
  env: Readonly<NodeJS.ProcessEnv>;
  platform: NodeJS.Platform;
  namespaceEnabled: boolean;
  userId?: string;
  planningDataDir: string;
  runtimeDataRoot: string;
  userDataDir: string;
}>;

export type PlanningOwnerLocation = Readonly<{
  logicalPath: string;
  targetPath: string;
  kind: "file" | "directory";
  legacy?: boolean;
}>;

export type PlanningDataOwnerDescriptor = Readonly<{
  ownerId: string;
  schemaVersion: number;
  logicalPath: string;
  requiredInManifest: boolean;
  emptyAllowed: boolean;
  resolveNamespace: (context: PlanningArchiveContext) => PlanningOwnerNamespace;
  resolveLocations: (context: PlanningArchiveContext) => readonly PlanningOwnerLocation[];
}>;

export type ResolvedPlanningDataOwner = Readonly<{
  ownerId: string;
  schemaVersion: number;
  logicalPath: string;
  requiredInManifest: boolean;
  emptyAllowed: boolean;
  namespace: PlanningOwnerNamespace;
  locations: readonly PlanningOwnerLocation[];
}>;

export class PlanningOwnerContractError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PlanningOwnerContractError";
    this.code = code;
  }
}

const OWNER_ID_RE = /^[a-z][a-z0-9.-]{2,63}$/u;
const WINDOWS_RESERVED_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function frozenNamespace(namespace: PlanningOwnerNamespace): PlanningOwnerNamespace {
  return Object.freeze(namespace.mode === "user"
    ? { mode: "user" as const, userId: namespace.userId }
    : { mode: "shared" as const });
}

export function normalizePlanningOwnerLogicalPath(value: unknown): string {
  const raw = asString(value).normalize("NFC");
  if (
    !raw
    || raw.startsWith("/")
    || raw.includes("\\")
    || /[\u0000-\u001F\u007F<>:"|?*]/u.test(raw)
  ) {
    throw new PlanningOwnerContractError("OWNER_LOGICAL_PATH_INVALID", raw || "empty");
  }
  const segments = raw.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || /[. ]$/u.test(segment) || WINDOWS_RESERVED_RE.test(segment)) {
      throw new PlanningOwnerContractError("OWNER_LOGICAL_PATH_INVALID", raw);
    }
  }
  return segments.join("/");
}

function normalizePhysicalPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/u, "").normalize("NFC");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathsOverlap(left: string, right: string, platform: NodeJS.Platform): boolean {
  const a = normalizePhysicalPath(left, platform);
  const b = normalizePhysicalPath(right, platform);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function pathIsInside(parentPath: string, childPath: string, platform: NodeJS.Platform): boolean {
  const parent = normalizePhysicalPath(parentPath, platform);
  const child = normalizePhysicalPath(childPath, platform);
  return child === parent || child.startsWith(`${parent}/`);
}

function resolveEnvPath(context: PlanningArchiveContext, key: string, fallback: string): string {
  const configured = asString(context.env[key]);
  return configured ? path.resolve(context.cwd, configured) : path.resolve(fallback);
}

function userBoundNamespace(context: PlanningArchiveContext): PlanningOwnerNamespace {
  if (!context.namespaceEnabled) return frozenNamespace({ mode: "shared" });
  if (!context.userId) {
    throw new PlanningOwnerContractError("OWNER_USER_ID_REQUIRED");
  }
  return frozenNamespace({ mode: "user", userId: context.userId });
}

function sharedNamespace(): PlanningOwnerNamespace {
  return frozenNamespace({ mode: "shared" });
}

function location(
  logicalPath: string,
  targetPath: string,
  kind: PlanningOwnerLocation["kind"],
  legacy = false,
): PlanningOwnerLocation {
  return Object.freeze({
    logicalPath: normalizePlanningOwnerLogicalPath(logicalPath),
    targetPath: path.resolve(targetPath),
    kind,
    ...(legacy ? { legacy: true } : {}),
  });
}

function addFileLocationWhenOutsideDirectories(
  locations: PlanningOwnerLocation[],
  logicalPath: string,
  targetPath: string,
  platform: NodeJS.Platform,
): void {
  if (locations.some((entry) => entry.kind === "directory" && pathIsInside(entry.targetPath, targetPath, platform))) return;
  locations.push(location(logicalPath, targetPath, "file"));
}

function stableProfileRunLocations(context: PlanningArchiveContext): readonly PlanningOwnerLocation[] {
  const profilesOverride = !context.namespaceEnabled && asString(context.env.PLANNING_PROFILES_DIR);
  const runsOverride = !context.namespaceEnabled && asString(context.env.PLANNING_RUNS_DIR);
  const profilesDir = context.namespaceEnabled
    ? path.join(context.userDataDir, "profiles")
    : resolveEnvPath(context, "PLANNING_PROFILES_DIR", path.join(context.planningDataDir, "profiles"));
  const runsDir = context.namespaceEnabled
    ? path.join(context.userDataDir, "runs")
    : resolveEnvPath(context, "PLANNING_RUNS_DIR", path.join(context.planningDataDir, "runs"));

  let partitionsDir: string;
  if (context.namespaceEnabled) {
    partitionsDir = path.join(context.userDataDir, "vault", "profiles");
  } else if (asString(context.env.PLANNING_PROFILE_PARTITIONS_DIR)) {
    partitionsDir = resolveEnvPath(context, "PLANNING_PROFILE_PARTITIONS_DIR", "");
  } else if (profilesOverride) {
    partitionsDir = path.join(path.dirname(profilesDir), "vault", "profiles");
  } else if (runsOverride) {
    partitionsDir = path.join(path.dirname(runsDir), "vault", "profiles");
  } else {
    partitionsDir = path.join(context.planningDataDir, "vault", "profiles");
  }

  const locations: PlanningOwnerLocation[] = [
    location("profiles", profilesDir, "directory", true),
    location("runs", runsDir, "directory"),
    location("vault/profiles", partitionsDir, "directory"),
  ];

  const registryOverride = !context.namespaceEnabled && asString(context.env.PLANNING_PROFILE_REGISTRY_PATH);
  const registryPath = registryOverride
    ? path.resolve(context.cwd, registryOverride)
    : path.join(partitionsDir, "index.json");
  addFileLocationWhenOutsideDirectories(locations, "vault/index.json", registryPath, context.platform);

  const metaOverride = !context.namespaceEnabled && asString(context.env.PLANNING_PROFILE_META_PATH);
  const metaPath = metaOverride
    ? path.resolve(context.cwd, metaOverride)
    : registryOverride
      ? path.join(path.dirname(registryPath), "profiles.meta.json")
      : path.join(path.dirname(partitionsDir), "profiles.meta.json");
  addFileLocationWhenOutsideDirectories(locations, "vault/profiles.meta.json", metaPath, context.platform);

  return locations;
}

function reportsLocations(context: PlanningArchiveContext): readonly PlanningOwnerLocation[] {
  const reportsDir = context.namespaceEnabled
    ? path.join(context.userDataDir, "reports")
    : resolveEnvPath(context, "PLANNING_REPORTS_DIR", path.join(context.planningDataDir, "reports"));
  return [location("reports", reportsDir, "directory")];
}

function planningV3Root(context: PlanningArchiveContext): string {
  return path.join(context.userDataDir, "planning-v3");
}

function planningV3LegacyRoot(context: PlanningArchiveContext): string {
  return path.join(context.userDataDir, "v3");
}

function resolveV3StorePath(
  context: PlanningArchiveContext,
  envKey: string,
  fallback: string,
): string {
  if (context.namespaceEnabled) return path.resolve(fallback);
  return resolveEnvPath(context, envKey, fallback);
}

const descriptors: readonly PlanningDataOwnerDescriptor[] = [
  {
    ownerId: "stable.profile-run-vault",
    schemaVersion: 1,
    logicalPath: "planning/stable/profile-run-vault",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: stableProfileRunLocations,
  },
  {
    ownerId: "stable.reports",
    schemaVersion: 1,
    logicalPath: "planning/stable/reports",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: reportsLocations,
  },
  {
    ownerId: "v3.accounts",
    schemaVersion: 1,
    logicalPath: "planning/v3/accounts",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("accounts.json", resolveV3StorePath(context, "PLANNING_V3_ACCOUNTS_PATH", path.join(planningV3Root(context), "accounts.json")), "file"),
      location("legacy/accounts.json", path.join(planningV3LegacyRoot(context), "accounts", "accounts.json"), "file", true),
    ],
  },
  {
    ownerId: "v3.opening-balances",
    schemaVersion: 1,
    logicalPath: "planning/v3/opening-balances",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("opening-balances.json", resolveV3StorePath(context, "PLANNING_V3_OPENING_BALANCES_PATH", path.join(planningV3Root(context), "opening-balances.json")), "file"),
    ],
  },
  {
    ownerId: "v3.batches",
    schemaVersion: 1,
    logicalPath: "planning/v3/batches",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("batches", resolveV3StorePath(context, "PLANNING_V3_BATCHES_DIR", path.join(planningV3Root(context), "batches")), "directory"),
    ],
  },
  {
    ownerId: "v3.drafts",
    schemaVersion: 1,
    logicalPath: "planning/v3/drafts",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("drafts", resolveV3StorePath(context, "PLANNING_V3_DRAFTS_DIR", path.join(planningV3Root(context), "drafts")), "directory"),
      location("legacy", path.join(planningV3LegacyRoot(context), "drafts"), "directory", true),
    ],
  },
  {
    ownerId: "v3.category-rules",
    schemaVersion: 1,
    logicalPath: "planning/v3/category-rules",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("category-rules.json", resolveV3StorePath(context, "PLANNING_V3_CATEGORY_RULES_PATH", path.join(planningV3Root(context), "category-rules.json")), "file"),
    ],
  },
  {
    ownerId: "v3.transaction-overrides",
    schemaVersion: 1,
    logicalPath: "planning/v3/transaction-overrides",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("txn-overrides", resolveV3StorePath(context, "PLANNING_V3_TXN_OVERRIDES_DIR", path.join(planningV3Root(context), "txn-overrides")), "directory"),
      location("txn-transfer-overrides", resolveV3StorePath(context, "PLANNING_V3_TXN_TRANSFER_OVERRIDES_DIR", path.join(planningV3Root(context), "txn-transfer-overrides")), "directory"),
      location("txn-account-overrides", resolveV3StorePath(context, "PLANNING_V3_TXN_ACCOUNT_OVERRIDES_DIR", path.join(planningV3Root(context), "txn-account-overrides")), "directory"),
      location("legacy/txn-overrides.json", resolveV3StorePath(context, "PLANNING_V3_TXN_OVERRIDES_PATH", path.join(planningV3LegacyRoot(context), "txn-overrides.json")), "file", true),
    ],
  },
  {
    ownerId: "v3.news",
    schemaVersion: 1,
    logicalPath: "planning/v3/news",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("news", context.namespaceEnabled
        ? path.join(context.userDataDir, "planning-v3", "news")
        : path.join(context.runtimeDataRoot, "news"), "directory"),
    ],
  },
  {
    ownerId: "v3.indicators",
    schemaVersion: 1,
    logicalPath: "planning/v3/indicators",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: sharedNamespace,
    resolveLocations: (context) => [location("indicators", path.join(context.runtimeDataRoot, "indicators"), "directory")],
  },
  {
    ownerId: "v3.alerts",
    schemaVersion: 1,
    logicalPath: "planning/v3/alerts",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("alerts", context.namespaceEnabled
        ? path.join(context.userDataDir, "news", "alerts")
        : path.join(context.runtimeDataRoot, "alerts"), "directory"),
    ],
  },
  {
    ownerId: "v3.journal",
    schemaVersion: 1,
    logicalPath: "planning/v3/journal",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("entries", context.namespaceEnabled
        ? path.join(context.userDataDir, "planning-v3", "journal", "entries")
        : path.join(context.runtimeDataRoot, "journal", "entries"), "directory"),
    ],
  },
  {
    ownerId: "v3.exposure",
    schemaVersion: 1,
    logicalPath: "planning/v3/exposure",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("profile.json", context.namespaceEnabled
        ? path.join(context.userDataDir, "planning-v3", "exposure", "profile.json")
        : path.join(context.runtimeDataRoot, "exposure", "profile.json"), "file"),
    ],
  },
  {
    ownerId: "v3.csv-drafts",
    schemaVersion: 1,
    logicalPath: "planning/v3/csv-drafts",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("drafts", context.namespaceEnabled
        ? path.join(context.userDataDir, "planning_v3_drafts")
        : resolveEnvPath(context, "PLANNING_V3_DRAFTS_DIR", path.join(context.runtimeDataRoot, "planning_v3_drafts")), "directory"),
    ],
  },
  {
    ownerId: "v3.routines",
    schemaVersion: 1,
    logicalPath: "planning/v3/routines",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("daily", context.namespaceEnabled
        ? path.join(context.userDataDir, "planning-v3", "routines", "daily")
        : path.join(context.runtimeDataRoot, "routines", "daily"), "directory"),
    ],
  },
  {
    ownerId: "v3.scenario-overrides",
    schemaVersion: 1,
    logicalPath: "planning/v3/scenario-overrides",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: userBoundNamespace,
    resolveLocations: (context) => [
      location("overrides.json", context.namespaceEnabled
        ? path.join(context.userDataDir, "scenarios", "overrides.json")
        : path.join(context.cwd, ".data", "scenarios", "overrides.json"), "file"),
    ],
  },
  {
    ownerId: "v3.legacy-transactions",
    schemaVersion: 1,
    logicalPath: "planning/v3/legacy-transactions",
    requiredInManifest: true,
    emptyAllowed: true,
    resolveNamespace: sharedNamespace,
    resolveLocations: (context) => [
      location("transactions", resolveEnvPath(context, "PLANNING_V3_TRANSACTIONS_DIR", path.join(context.planningDataDir, "v3", "transactions")), "directory", true),
    ],
  },
] as const;

export const PLANNING_DATA_OWNER_REGISTRY: readonly PlanningDataOwnerDescriptor[] = Object.freeze(descriptors);

export function createPlanningArchiveContext(input: PlanningArchiveContextInput = {}): PlanningArchiveContext {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const env = Object.freeze({ ...(input.env ?? process.env) });
  const platform = input.platform ?? process.platform;
  const planningDataDir = resolvePlanningDataDir({ cwd, env, platform });
  const namespaceEnabled = isPlanningNamespaceEnabled(env);
  const explicitUserId = asString(input.userId) || asString(env.PLANNING_USER_ID);
  if (namespaceEnabled && !isPlanningSingleUserModeEnabled(env) && !explicitUserId) {
    throw new PlanningOwnerContractError("OWNER_USER_ID_REQUIRED");
  }
  const userId = namespaceEnabled
    ? resolvePlanningUserId(explicitUserId || undefined, env)
    : undefined;
  const userDataDir = namespaceEnabled && userId
    ? path.join(planningDataDir, "users", userId)
    : planningDataDir;

  return Object.freeze({
    cwd,
    env,
    platform,
    namespaceEnabled,
    ...(userId ? { userId } : {}),
    planningDataDir: path.resolve(planningDataDir),
    runtimeDataRoot: path.resolve(path.dirname(planningDataDir)),
    userDataDir: path.resolve(userDataDir),
  });
}

function validateResolvedOwners(
  owners: readonly ResolvedPlanningDataOwner[],
  platform: NodeJS.Platform,
): void {
  const ownerIds = new Set<string>();
  const ownerLogicalPaths = new Set<string>();
  const locations: Array<{ ownerId: string; location: PlanningOwnerLocation }> = [];

  for (const owner of owners) {
    if (!OWNER_ID_RE.test(owner.ownerId)) {
      throw new PlanningOwnerContractError("OWNER_ID_INVALID", owner.ownerId);
    }
    const ownerIdKey = owner.ownerId.toLowerCase();
    if (ownerIds.has(ownerIdKey)) {
      throw new PlanningOwnerContractError("OWNER_ID_DUPLICATE", owner.ownerId);
    }
    ownerIds.add(ownerIdKey);

    const logicalOwnerPath = normalizePlanningOwnerLogicalPath(owner.logicalPath).toLowerCase();
    if (ownerLogicalPaths.has(logicalOwnerPath)) {
      throw new PlanningOwnerContractError("OWNER_LOGICAL_PATH_DUPLICATE", owner.logicalPath);
    }
    ownerLogicalPaths.add(logicalOwnerPath);

    if (!Number.isSafeInteger(owner.schemaVersion) || owner.schemaVersion < 1) {
      throw new PlanningOwnerContractError("OWNER_SCHEMA_VERSION_INVALID", owner.ownerId);
    }
    if (owner.namespace.mode === "user" && !asString(owner.namespace.userId)) {
      throw new PlanningOwnerContractError("OWNER_USER_ID_REQUIRED", owner.ownerId);
    }

    const localLogicalPaths = new Set<string>();
    for (const ownerLocation of owner.locations) {
      const logicalLocation = normalizePlanningOwnerLogicalPath(ownerLocation.logicalPath).toLowerCase();
      if (localLogicalPaths.has(logicalLocation)) {
        throw new PlanningOwnerContractError("OWNER_LOCATION_LOGICAL_PATH_DUPLICATE", `${owner.ownerId}:${ownerLocation.logicalPath}`);
      }
      localLogicalPaths.add(logicalLocation);
      if (!path.isAbsolute(ownerLocation.targetPath)) {
        throw new PlanningOwnerContractError("OWNER_TARGET_NOT_ABSOLUTE", `${owner.ownerId}:${ownerLocation.targetPath}`);
      }
      if (path.resolve(ownerLocation.targetPath) === path.parse(path.resolve(ownerLocation.targetPath)).root) {
        throw new PlanningOwnerContractError("OWNER_TARGET_ROOT_FORBIDDEN", `${owner.ownerId}:${ownerLocation.targetPath}`);
      }
      locations.push({ ownerId: owner.ownerId, location: ownerLocation });
    }
  }

  for (let leftIndex = 0; leftIndex < locations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < locations.length; rightIndex += 1) {
      const left = locations[leftIndex];
      const right = locations[rightIndex];
      if (!pathsOverlap(left.location.targetPath, right.location.targetPath, platform)) continue;
      throw new PlanningOwnerContractError(
        "OWNER_TARGET_COLLISION",
        `${left.ownerId}:${left.location.logicalPath}<->${right.ownerId}:${right.location.logicalPath}`,
      );
    }
  }
}

export function resolvePlanningDataOwners(
  context: PlanningArchiveContext,
  registry: readonly PlanningDataOwnerDescriptor[] = PLANNING_DATA_OWNER_REGISTRY,
): readonly ResolvedPlanningDataOwner[] {
  const owners = registry.map((descriptor) => Object.freeze({
    ownerId: descriptor.ownerId,
    schemaVersion: descriptor.schemaVersion,
    logicalPath: normalizePlanningOwnerLogicalPath(descriptor.logicalPath),
    requiredInManifest: descriptor.requiredInManifest,
    emptyAllowed: descriptor.emptyAllowed,
    namespace: frozenNamespace(descriptor.resolveNamespace(context)),
    locations: Object.freeze(descriptor.resolveLocations(context).map((entry) => Object.freeze({ ...entry }))),
  }));
  validateResolvedOwners(owners, context.platform);
  return Object.freeze(owners);
}

export function findPlanningDataOwnerForPath(
  owners: readonly ResolvedPlanningDataOwner[],
  candidatePath: string,
  platform: NodeJS.Platform = process.platform,
): { owner: ResolvedPlanningDataOwner; location: PlanningOwnerLocation } | null {
  const resolvedCandidate = path.resolve(candidatePath);
  for (const owner of owners) {
    for (const ownerLocation of owner.locations) {
      if (ownerLocation.kind === "file") {
        if (normalizePhysicalPath(ownerLocation.targetPath, platform) === normalizePhysicalPath(resolvedCandidate, platform)) {
          return { owner, location: ownerLocation };
        }
        continue;
      }
      if (pathIsInside(ownerLocation.targetPath, resolvedCandidate, platform)) {
        return { owner, location: ownerLocation };
      }
    }
  }
  return null;
}
