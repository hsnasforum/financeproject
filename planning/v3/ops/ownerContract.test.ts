import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANNING_DATA_OWNER_IDS,
  PLANNING_DATA_OWNER_REGISTRY,
  PlanningOwnerContractError,
  createPlanningArchiveContext,
  findPlanningDataOwnerForPath,
  resolvePlanningDataOwners,
} from "../../../src/lib/ops/backup/planningOwnerRegistry";
import {
  PLANNING_OWNER_ARCHIVE_SCOPE,
  buildPlanningOwnerManifest,
  parsePlanningOwnerManifest,
  serializePlanningOwnerManifest,
  sha256PlanningOwnerBytes,
  validatePlanningOwnerManifest,
} from "../../../src/lib/ops/backup/planningOwnerManifest";

const ARCHIVE_ID = "11111111-1111-4111-8111-111111111111";
const GENERATED_AT = "2026-07-11T00:00:00.000Z";

function ownerById(
  owners: ReturnType<typeof resolvePlanningDataOwners>,
  ownerId: string,
) {
  const owner = owners.find((entry) => entry.ownerId === ownerId);
  expect(owner).toBeDefined();
  return owner!;
}

function locationByLogicalPath(
  owners: ReturnType<typeof resolvePlanningDataOwners>,
  ownerId: string,
  logicalPath: string,
) {
  const owner = ownerById(owners, ownerId);
  const location = owner.locations.find((entry) => entry.logicalPath === logicalPath);
  expect(location).toBeDefined();
  return location!;
}

function captureContractCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PlanningOwnerContractError);
    return (error as PlanningOwnerContractError).code;
  }
  throw new Error("expected PlanningOwnerContractError");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function locationContracts(
  owners: ReturnType<typeof resolvePlanningDataOwners>,
  cwd: string,
): string[] {
  return owners.flatMap((owner) => owner.locations.map((entry) => [
    owner.ownerId,
    entry.logicalPath,
    entry.kind,
    entry.legacy ? "legacy" : "current",
    path.relative(cwd, entry.targetPath).replaceAll("\\", "/"),
  ].join(":"))).sort();
}

describe("planning owner registry contract", () => {
  it("resolves every confirmed owner from the default development roots", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-default");
    const context = createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test" },
      platform: "linux",
    });
    const owners = resolvePlanningDataOwners(context);

    expect(owners.map((owner) => owner.ownerId)).toEqual(PLANNING_DATA_OWNER_IDS);
    expect(owners.every((owner) => owner.requiredInManifest && owner.emptyAllowed)).toBe(true);
    expect(context.planningDataDir).toBe(path.join(cwd, ".data", "planning"));
    expect(locationByLogicalPath(owners, "v3.accounts", "accounts.json").targetPath)
      .toBe(path.join(cwd, ".data", "planning", "planning-v3", "accounts.json"));
    expect(locationByLogicalPath(owners, "v3.batches", "batches").targetPath)
      .toBe(path.join(cwd, ".data", "planning", "planning-v3", "batches"));
    expect(locationByLogicalPath(owners, "v3.news", "news").targetPath)
      .toBe(path.join(cwd, ".data", "news"));
    expect(locationByLogicalPath(owners, "v3.indicators", "indicators").targetPath)
      .toBe(path.join(cwd, ".data", "indicators"));
    expect(findPlanningDataOwnerForPath(owners, path.join(cwd, ".data", "unowned", "keep.txt"))).toBeNull();
    expect(findPlanningDataOwnerForPath(owners, path.join(cwd, ".data", "exports", "backup.zip"))).toBeNull();
  });

  it("pins every default owner location and legacy boundary", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-default-matrix");
    const owners = resolvePlanningDataOwners(createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test" },
      platform: "linux",
    }));

    expect(locationContracts(owners, cwd)).toEqual([
      "stable.profile-run-vault:profiles:directory:legacy:.data/planning/profiles",
      "stable.profile-run-vault:runs:directory:current:.data/planning/runs",
      "stable.profile-run-vault:vault/profiles:directory:current:.data/planning/vault/profiles",
      "stable.profile-run-vault:vault/profiles.meta.json:file:current:.data/planning/vault/profiles.meta.json",
      "stable.reports:reports:directory:current:.data/planning/reports",
      "v3.accounts:accounts.json:file:current:.data/planning/planning-v3/accounts.json",
      "v3.accounts:legacy/accounts.json:file:legacy:.data/planning/v3/accounts/accounts.json",
      "v3.opening-balances:opening-balances.json:file:current:.data/planning/planning-v3/opening-balances.json",
      "v3.batches:batches:directory:current:.data/planning/planning-v3/batches",
      "v3.drafts:drafts:directory:current:.data/planning/planning-v3/drafts",
      "v3.drafts:legacy:directory:legacy:.data/planning/v3/drafts",
      "v3.category-rules:category-rules.json:file:current:.data/planning/planning-v3/category-rules.json",
      "v3.transaction-overrides:txn-overrides:directory:current:.data/planning/planning-v3/txn-overrides",
      "v3.transaction-overrides:txn-transfer-overrides:directory:current:.data/planning/planning-v3/txn-transfer-overrides",
      "v3.transaction-overrides:txn-account-overrides:directory:current:.data/planning/planning-v3/txn-account-overrides",
      "v3.transaction-overrides:legacy/txn-overrides.json:file:legacy:.data/planning/v3/txn-overrides.json",
      "v3.news:news:directory:current:.data/news",
      "v3.indicators:indicators:directory:current:.data/indicators",
      "v3.alerts:alerts:directory:current:.data/alerts",
      "v3.journal:entries:directory:current:.data/journal/entries",
      "v3.exposure:profile.json:file:current:.data/exposure/profile.json",
      "v3.csv-drafts:drafts:directory:current:.data/planning_v3_drafts",
      "v3.routines:daily:directory:current:.data/routines/daily",
      "v3.scenario-overrides:overrides.json:file:current:.data/scenarios/overrides.json",
      "v3.legacy-transactions:transactions:directory:legacy:.data/planning/v3/transactions",
    ].sort());
  });

  it("pins every namespaced owner location and shared boundary", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-user-matrix");
    const owners = resolvePlanningDataOwners(createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" },
      platform: "linux",
      userId: "alice",
    }));

    expect(locationContracts(owners, cwd)).toEqual([
      "stable.profile-run-vault:profiles:directory:legacy:.data/planning/users/alice/profiles",
      "stable.profile-run-vault:runs:directory:current:.data/planning/users/alice/runs",
      "stable.profile-run-vault:vault/profiles:directory:current:.data/planning/users/alice/vault/profiles",
      "stable.profile-run-vault:vault/profiles.meta.json:file:current:.data/planning/users/alice/vault/profiles.meta.json",
      "stable.reports:reports:directory:current:.data/planning/users/alice/reports",
      "v3.accounts:accounts.json:file:current:.data/planning/users/alice/planning-v3/accounts.json",
      "v3.accounts:legacy/accounts.json:file:legacy:.data/planning/users/alice/v3/accounts/accounts.json",
      "v3.opening-balances:opening-balances.json:file:current:.data/planning/users/alice/planning-v3/opening-balances.json",
      "v3.batches:batches:directory:current:.data/planning/users/alice/planning-v3/batches",
      "v3.drafts:drafts:directory:current:.data/planning/users/alice/planning-v3/drafts",
      "v3.drafts:legacy:directory:legacy:.data/planning/users/alice/v3/drafts",
      "v3.category-rules:category-rules.json:file:current:.data/planning/users/alice/planning-v3/category-rules.json",
      "v3.transaction-overrides:txn-overrides:directory:current:.data/planning/users/alice/planning-v3/txn-overrides",
      "v3.transaction-overrides:txn-transfer-overrides:directory:current:.data/planning/users/alice/planning-v3/txn-transfer-overrides",
      "v3.transaction-overrides:txn-account-overrides:directory:current:.data/planning/users/alice/planning-v3/txn-account-overrides",
      "v3.transaction-overrides:legacy/txn-overrides.json:file:legacy:.data/planning/users/alice/v3/txn-overrides.json",
      "v3.news:news:directory:current:.data/planning/users/alice/planning-v3/news",
      "v3.indicators:indicators:directory:current:.data/indicators",
      "v3.alerts:alerts:directory:current:.data/planning/users/alice/news/alerts",
      "v3.journal:entries:directory:current:.data/planning/users/alice/planning-v3/journal/entries",
      "v3.exposure:profile.json:file:current:.data/planning/users/alice/planning-v3/exposure/profile.json",
      "v3.csv-drafts:drafts:directory:current:.data/planning/users/alice/planning_v3_drafts",
      "v3.routines:daily:directory:current:.data/planning/users/alice/planning-v3/routines/daily",
      "v3.scenario-overrides:overrides.json:file:current:.data/planning/users/alice/scenarios/overrides.json",
      "v3.legacy-transactions:transactions:directory:legacy:.data/planning/v3/transactions",
    ].sort());
  });

  it("snapshots relative and absolute PLANNING_DATA_DIR values", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-explicit");
    const relativeContext = createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test", PLANNING_DATA_DIR: "runtime/planning" },
    });
    const absoluteRoot = path.join(cwd, "absolute-planning");
    const absoluteContext = createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test", PLANNING_DATA_DIR: absoluteRoot },
    });

    expect(relativeContext.planningDataDir).toBe(path.join(cwd, "runtime", "planning"));
    expect(absoluteContext.planningDataDir).toBe(absoluteRoot);
    expect(Object.isFrozen(relativeContext.env)).toBe(true);
    expect(Object.isFrozen(relativeContext)).toBe(true);
  });

  it("preserves the current packaged Windows and Linux vault layout", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-packaged");
    const winBase = path.join(cwd, "win-local-app-data");
    const linuxBase = path.join(cwd, "xdg-data");

    const windowsContext = createPlanningArchiveContext({
      cwd,
      platform: "win32",
      env: {
        NODE_ENV: "production",
        LOCALAPPDATA: winBase,
        PLANNING_APP_NAME: "Finance Test",
      },
    });
    const linuxContext = createPlanningArchiveContext({
      cwd,
      platform: "linux",
      env: {
        NODE_ENV: "production",
        XDG_DATA_HOME: linuxBase,
        PLANNING_APP_NAME: "Finance Test",
      },
    });

    expect(windowsContext.planningDataDir).toBe(path.join(winBase, "Finance Test", "vault"));
    expect(linuxContext.planningDataDir).toBe(path.join(linuxBase, "Finance Test", "vault"));
    const windowsOwners = resolvePlanningDataOwners(windowsContext);
    expect(locationByLogicalPath(windowsOwners, "stable.profile-run-vault", "vault/profiles").targetPath)
      .toBe(path.join(winBase, "Finance Test", "vault", "vault", "profiles"));
  });

  it("isolates Alice and Bob while leaving runtime-shared indicators unchanged", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-users");
    const env = { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" } satisfies NodeJS.ProcessEnv;
    const alice = resolvePlanningDataOwners(createPlanningArchiveContext({ cwd, env, userId: "alice" }));
    const bob = resolvePlanningDataOwners(createPlanningArchiveContext({ cwd, env, userId: "bob" }));

    expect(ownerById(alice, "v3.accounts").namespace).toEqual({ mode: "user", userId: "alice" });
    expect(ownerById(bob, "v3.accounts").namespace).toEqual({ mode: "user", userId: "bob" });
    expect(locationByLogicalPath(alice, "v3.accounts", "accounts.json").targetPath)
      .not.toBe(locationByLogicalPath(bob, "v3.accounts", "accounts.json").targetPath);
    expect(ownerById(alice, "v3.indicators").namespace).toEqual({ mode: "shared" });
    expect(locationByLogicalPath(alice, "v3.indicators", "indicators").targetPath)
      .toBe(locationByLogicalPath(bob, "v3.indicators", "indicators").targetPath);
  });

  it("requires an explicit user identity when namespace mode is enabled", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-missing-user");

    expect(captureContractCode(() => createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" },
    }))).toBe("OWNER_USER_ID_REQUIRED");

    const fromSnapshotEnv = createPlanningArchiveContext({
      cwd,
      env: {
        NODE_ENV: "test",
        PLANNING_NAMESPACE_ENABLED: "true",
        PLANNING_USER_ID: "alice",
      },
    });
    expect(fromSnapshotEnv.userId).toBe("alice");
  });

  it("pins single-user mode to users/default", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-single-user");
    const context = createPlanningArchiveContext({
      cwd,
      userId: "ignored-user",
      env: { NODE_ENV: "production", PLANNING_SINGLE_USER_MODE: "true", PLANNING_DATA_DIR: "runtime" },
    });
    const owners = resolvePlanningDataOwners(context);

    expect(context.userId).toBe("default");
    expect(locationByLogicalPath(owners, "v3.accounts", "accounts.json").targetPath)
      .toBe(path.join(cwd, "runtime", "users", "default", "planning-v3", "accounts.json"));
  });

  it("honors documented per-owner overrides without widening ownership", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-overrides");
    const context = createPlanningArchiveContext({
      cwd,
      env: {
        NODE_ENV: "test",
        PLANNING_V3_ACCOUNTS_PATH: "outside/accounts.json",
        PLANNING_REPORTS_DIR: "outside/reports",
      },
    });
    const owners = resolvePlanningDataOwners(context);

    expect(locationByLogicalPath(owners, "v3.accounts", "accounts.json").targetPath)
      .toBe(path.join(cwd, "outside", "accounts.json"));
    expect(locationByLogicalPath(owners, "stable.reports", "reports").targetPath)
      .toBe(path.join(cwd, "outside", "reports"));
    expect(findPlanningDataOwnerForPath(owners, path.join(cwd, "outside", "other.txt"))).toBeNull();
  });

  it("keeps POSIX containment case-sensitive", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-posix-case");
    const upperProfiles = path.join(cwd, "Data", "profiles");
    const lowerRegistry = path.join(cwd, "data", "profiles", "index.json");
    const owners = resolvePlanningDataOwners(createPlanningArchiveContext({
      cwd,
      platform: "linux",
      env: {
        NODE_ENV: "test",
        PLANNING_PROFILES_DIR: upperProfiles,
        PLANNING_PROFILE_REGISTRY_PATH: lowerRegistry,
      },
    }));

    expect(locationByLogicalPath(owners, "stable.profile-run-vault", "vault/index.json").targetPath)
      .toBe(lowerRegistry);
    expect(findPlanningDataOwnerForPath(owners, path.join(upperProfiles, "profile.json"), "linux"))
      .not.toBeNull();
    expect(findPlanningDataOwnerForPath(owners, path.join(cwd, "data", "profiles", "other.json"), "linux"))
      .toBeNull();
  });

  it("fails closed when the shared drafts override aliases two active schemas", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-draft-collision");
    const context = createPlanningArchiveContext({
      cwd,
      env: { NODE_ENV: "test", PLANNING_V3_DRAFTS_DIR: "runtime/drafts" },
    });

    expect(captureContractCode(() => resolvePlanningDataOwners(context))).toBe("OWNER_TARGET_COLLISION");
  });

  it("rejects a directory owner that resolves to the filesystem root", () => {
    const cwd = path.resolve("/tmp/finance-owner-registry-root-target");
    const context = createPlanningArchiveContext({
      cwd,
      env: {
        NODE_ENV: "test",
        PLANNING_V3_BATCHES_DIR: path.parse(cwd).root,
      },
    });

    expect(captureContractCode(() => resolvePlanningDataOwners(context)))
      .toBe("OWNER_TARGET_ROOT_FORBIDDEN");
  });

  it("rejects duplicate registry owner ids", () => {
    const context = createPlanningArchiveContext({
      cwd: "/tmp/finance-owner-registry-duplicate",
      env: { NODE_ENV: "test" },
    });
    const duplicateRegistry = [PLANNING_DATA_OWNER_REGISTRY[0], PLANNING_DATA_OWNER_REGISTRY[0]];

    expect(captureContractCode(() => resolvePlanningDataOwners(context, duplicateRegistry)))
      .toBe("OWNER_ID_DUPLICATE");
  });
});

describe("planning owner manifest contract", () => {
  const cwd = path.resolve("/tmp/finance-owner-manifest");
  const owners = resolvePlanningDataOwners(createPlanningArchiveContext({
    cwd,
    env: { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" },
    userId: "alice",
  }));

  function buildManifest() {
    const accountsBytes = Buffer.from('{"version":2,"items":[]}\n', "utf-8");
    return buildPlanningOwnerManifest({
      archiveId: ARCHIVE_ID,
      generatedAt: GENERATED_AT,
      appVersion: "1.0.4",
      resolvedOwners: owners,
      filesByOwner: {
        "v3.accounts": [{
          path: "accounts.json",
          sizeBytes: accountsBytes.length,
          sha256: sha256PlanningOwnerBytes(accountsBytes),
        }],
      },
    });
  }

  it("declares every required owner, including empty owners, deterministically", () => {
    const first = buildManifest();
    const second = buildManifest();

    expect(first).toEqual(second);
    expect(first.archiveScope).toBe(PLANNING_OWNER_ARCHIVE_SCOPE);
    expect(first.owners.map((owner) => owner.ownerId))
      .toEqual([...PLANNING_DATA_OWNER_IDS].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
    expect(first.owners.every((owner) => owner.fileCount > 0 || owner.emptyAllowed)).toBe(true);
    expect(first.owners.find((owner) => owner.ownerId === "v3.accounts")).toMatchObject({
      namespace: { mode: "user", userId: "alice" },
      fileCount: 1,
    });
    expect(first.owners.find((owner) => owner.ownerId === "v3.indicators")).toMatchObject({
      namespace: { mode: "shared" },
      fileCount: 0,
    });
  });

  it("round-trips a strict serialized manifest", () => {
    const manifest = buildManifest();
    const serialized = serializePlanningOwnerManifest(manifest);
    const parsedRaw = JSON.parse(serialized.toString("utf-8")) as unknown;

    expect(parsePlanningOwnerManifest(parsedRaw, owners)).toEqual(manifest);
  });

  it("rejects missing required owners and unknown schema versions", () => {
    const missing = clone(buildManifest());
    missing.owners = missing.owners.filter((owner) => owner.ownerId !== "v3.batches");
    const schemaMismatch = clone(buildManifest());
    schemaMismatch.owners.find((owner) => owner.ownerId === "v3.accounts")!.schemaVersion = 2;

    expect(captureContractCode(() => parsePlanningOwnerManifest(missing, owners)))
      .toBe("MANIFEST_REQUIRED_OWNER_MISSING");
    expect(captureContractCode(() => parsePlanningOwnerManifest(schemaMismatch, owners)))
      .toBe("MANIFEST_OWNER_SCHEMA_VERSION_MISMATCH");
  });

  it("rejects namespace and owner checksum mismatches", () => {
    const namespaceMismatch = clone(buildManifest());
    namespaceMismatch.owners.find((owner) => owner.ownerId === "v3.accounts")!.namespace = {
      mode: "user",
      userId: "bob",
    };
    const checksumMismatch = clone(buildManifest());
    checksumMismatch.owners.find((owner) => owner.ownerId === "v3.accounts")!.checksum = "0".repeat(64);

    expect(captureContractCode(() => parsePlanningOwnerManifest(namespaceMismatch, owners)))
      .toBe("MANIFEST_NAMESPACE_MISMATCH");
    expect(captureContractCode(() => parsePlanningOwnerManifest(checksumMismatch, owners)))
      .toBe("MANIFEST_OWNER_CHECKSUM_MISMATCH");
  });

  it("rejects files outside their owner and incomplete canonical registries", () => {
    const outsideOwner = clone(buildManifest());
    const accounts = outsideOwner.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    accounts.files = [{
      path: "reports/private.md",
      sizeBytes: 0,
      sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)),
    }];
    accounts.fileCount = 1;
    accounts.totalBytes = 0;

    expect(captureContractCode(() => parsePlanningOwnerManifest(outsideOwner, owners)))
      .toBe("MANIFEST_FILE_OUTSIDE_OWNER");
    expect(captureContractCode(() => buildPlanningOwnerManifest({
      archiveId: ARCHIVE_ID,
      generatedAt: GENERATED_AT,
      appVersion: "1.0.4",
      resolvedOwners: owners.slice(0, -1),
    }))).toBe("MANIFEST_OWNER_REGISTRY_INCOMPLETE");
  });

  it("applies strict schema validation to the public validator", () => {
    const extraField = clone(buildManifest()) as ReturnType<typeof buildManifest> & { unexpected?: boolean };
    extraField.unexpected = true;
    const nonCanonicalPath = clone(buildManifest());
    const accounts = nonCanonicalPath.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    accounts.files[0].path = " accounts.json ";

    expect(captureContractCode(() => validatePlanningOwnerManifest(extraField, owners)))
      .toBe("MANIFEST_SCHEMA_INVALID");
    expect(captureContractCode(() => parsePlanningOwnerManifest(nonCanonicalPath, owners)))
      .toBe("MANIFEST_FILE_PATH_NON_CANONICAL");
  });

  it("rejects portable path, Unicode/case, and file-directory collisions", () => {
    const invalidPath = clone(buildManifest());
    const invalidOwner = invalidPath.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    invalidOwner.files = [{ path: "CON", sizeBytes: 0, sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)) }];
    invalidOwner.fileCount = 1;
    invalidOwner.totalBytes = 0;

    const caseCollision = clone(buildManifest());
    const caseOwner = caseCollision.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    caseOwner.files = [
      { path: "A.json", sizeBytes: 0, sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)) },
      { path: "a.json", sizeBytes: 0, sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)) },
    ];
    caseOwner.fileCount = 2;
    caseOwner.totalBytes = 0;

    const directoryCollision = clone(buildManifest());
    const directoryOwner = directoryCollision.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    directoryOwner.files = [
      { path: "accounts", sizeBytes: 0, sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)) },
      { path: "accounts/item.json", sizeBytes: 0, sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)) },
    ];
    directoryOwner.fileCount = 2;
    directoryOwner.totalBytes = 0;

    expect(captureContractCode(() => parsePlanningOwnerManifest(invalidPath, owners)))
      .toBe("OWNER_LOGICAL_PATH_INVALID");
    expect(captureContractCode(() => parsePlanningOwnerManifest(caseCollision, owners)))
      .toBe("MANIFEST_FILE_PATH_DUPLICATE");
    expect(captureContractCode(() => parsePlanningOwnerManifest(directoryCollision, owners)))
      .toBe("MANIFEST_FILE_DIRECTORY_COLLISION");
  });

  it("rejects control characters and Windows-forbidden path characters", () => {
    const controlCharacter = clone(buildManifest());
    const controlOwner = controlCharacter.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    controlOwner.files = [{
      path: "accounts\n.json",
      sizeBytes: 0,
      sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)),
    }];
    controlOwner.fileCount = 1;
    controlOwner.totalBytes = 0;

    const forbiddenCharacter = clone(buildManifest());
    const forbiddenOwner = forbiddenCharacter.owners.find((owner) => owner.ownerId === "v3.accounts")!;
    forbiddenOwner.files = [{
      path: "accounts?.json",
      sizeBytes: 0,
      sha256: sha256PlanningOwnerBytes(Buffer.alloc(0)),
    }];
    forbiddenOwner.fileCount = 1;
    forbiddenOwner.totalBytes = 0;

    expect(captureContractCode(() => parsePlanningOwnerManifest(controlCharacter, owners)))
      .toBe("OWNER_LOGICAL_PATH_INVALID");
    expect(captureContractCode(() => parsePlanningOwnerManifest(forbiddenCharacter, owners)))
      .toBe("OWNER_LOGICAL_PATH_INVALID");
  });
});
