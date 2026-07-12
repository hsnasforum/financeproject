import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlanningOwnerArchive,
  decryptPlanningOwnerArchiveBytes,
  encryptPlanningOwnerArchiveBytes,
} from "../../../src/lib/ops/backup/planningOwnerArchive";
import {
  PlanningOwnerRestoreSimulatedCrashError,
  commitPlanningOwnerRestoreFixtureTransaction,
  preparePlanningOwnerRestoreFixtureTransaction,
  recoverPendingPlanningOwnerRestoreFixtureTransaction,
} from "../../../src/lib/ops/backup/planningOwnerRestoreTransaction";
import {
  createPlanningArchiveContext,
  resolvePlanningDataOwners,
  type PlanningArchiveContext,
  type ResolvedPlanningDataOwner,
} from "../../../src/lib/ops/backup/planningOwnerRegistry";
import { decodeZip, encodeZip } from "../../../src/lib/ops/backup/zipCodec";

const SECRET = Buffer.from("owner-restore-fixture-secret", "utf-8");
const ARCHIVE_ID = "33333333-3333-4333-8333-333333333333";
const GENERATED_AT = "2026-07-11T12:00:00.000Z";

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function ownerLocation(
  owners: readonly ResolvedPlanningDataOwner[],
  ownerId: string,
  logicalPath: string,
): string {
  const location = owners
    .find((owner) => owner.ownerId === ownerId)
    ?.locations.find((entry) => entry.logicalPath === logicalPath);
  expect(location).toBeDefined();
  return location!.targetPath;
}

function createContext(
  root: string,
  options: { env?: NodeJS.ProcessEnv; userId?: string } = {},
): { context: PlanningArchiveContext; owners: readonly ResolvedPlanningDataOwner[] } {
  const context = createPlanningArchiveContext({
    cwd: root,
    env: options.env ?? { NODE_ENV: "test" },
    platform: "linux",
    userId: options.userId,
  });
  return { context, owners: resolvePlanningDataOwners(context) };
}

async function buildArchive(item: {
  context: PlanningArchiveContext;
  owners: readonly ResolvedPlanningDataOwner[];
}) {
  return buildPlanningOwnerArchive({
    context: item.context,
    owners: item.owners,
    archiveId: ARCHIVE_ID,
    generatedAt: GENERATED_AT,
    appVersion: "1.0.4",
    secret: SECRET,
    confirmQuiesced: true,
  });
}

async function rewrapArchive(
  encryptedBytes: Buffer,
  mutate: (entries: Map<string, Buffer>) => void,
): Promise<Buffer> {
  const zipBytes = await decryptPlanningOwnerArchiveBytes({ encryptedBytes, secret: SECRET });
  const entries = await decodeZip(zipBytes, {
    maxEntries: 20_000,
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalBytes: 70 * 1024 * 1024,
  });
  try {
    mutate(entries);
    return await encryptPlanningOwnerArchiveBytes({
      zipBytes: encodeZip([...entries].map(([entryPath, bytes]) => ({ path: entryPath, bytes }))),
      secret: SECRET,
    });
  } finally {
    zipBytes.fill(0);
    for (const bytes of entries.values()) bytes.fill(0);
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.message : "unknown";
}

async function caughtCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return errorCode(error);
  }
  throw new Error("expected failure");
}

function canonicalFixtureDigest(root: string): string {
  const rows: string[] = [];
  function visit(directoryPath: string, relativeDirectory: string): void {
    for (const name of fs.readdirSync(directoryPath).sort()) {
      if (name === ".owner-restore" || name.startsWith(".planning-owner-restore-")) continue;
      const entryPath = path.join(directoryPath, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stats = fs.lstatSync(entryPath);
      if (stats.isDirectory()) {
        rows.push(`d:${relativePath}`);
        visit(entryPath, relativePath);
      } else if (stats.isFile()) {
        rows.push(`f:${relativePath}:${stats.size}:${createHash("sha256").update(fs.readFileSync(entryPath)).digest("hex")}`);
      } else {
        rows.push(`x:${relativePath}`);
      }
    }
  }
  visit(root, "");
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

type RawRestoreJournal = {
  transactionId: string;
  archiveId: string;
  fixtureRoot: string;
  transactionRoot: string;
  platform: string;
  registryDigest: string;
  planDigest: string;
  journalChecksum: string;
  units: Array<{
    index: number;
    ownerId: string;
    logicalPath: string;
    kind: string;
    targetPath: string;
    parentPath: string;
    anchorPath: string;
    anchorIdentity: string;
    workspaceName: string;
    workspaceIdentity: string | null;
    missingParents: string[];
    createdParents: string[];
    original: unknown;
    desired: unknown;
  }>;
  [key: string]: unknown;
};

function computeRawJournalPlanDigest(journal: RawRestoreJournal): string {
  return createHash("sha256").update(JSON.stringify({
    transactionId: journal.transactionId,
    archiveId: journal.archiveId,
    fixtureRoot: journal.fixtureRoot,
    transactionRoot: journal.transactionRoot,
    platform: journal.platform,
    registryDigest: journal.registryDigest,
    units: journal.units.map((unit) => ({
      index: unit.index,
      ownerId: unit.ownerId,
      logicalPath: unit.logicalPath,
      kind: unit.kind,
      targetPath: unit.targetPath,
      parentPath: unit.parentPath,
      anchorPath: unit.anchorPath,
      anchorIdentity: unit.anchorIdentity,
      workspaceName: unit.workspaceName,
      missingParents: unit.missingParents,
      original: unit.original,
      desired: unit.desired,
    })),
  })).digest("hex");
}

function resealRawJournal(journal: RawRestoreJournal, updatePlan = false): void {
  if (updatePlan) journal.planDigest = computeRawJournalPlanDigest(journal);
  const payload = { ...journal };
  Reflect.deleteProperty(payload, "journalChecksum");
  journal.journalChecksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function transactionRoot(root: string): string {
  return path.join(root, ".owner-restore");
}

function transactionInput(
  root: string,
  owners: readonly ResolvedPlanningDataOwner[],
  encryptedBytes: Buffer,
  transactionId: string,
) {
  return {
    encryptedBytes,
    secret: SECRET,
    owners,
    fixtureRoot: root,
    transactionRoot: transactionRoot(root),
    platform: "linux" as const,
    transactionId,
  };
}

function seedRepresentativeDesired(owners: readonly ResolvedPlanningDataOwner[]): Record<string, string> {
  const desired = {
    accounts: ownerLocation(owners, "v3.accounts", "accounts.json"),
    batches: path.join(ownerLocation(owners, "v3.batches", "batches"), "batch-a.ndjson"),
    drafts: path.join(ownerLocation(owners, "v3.drafts", "drafts"), "profile", "draft-a.json"),
    profiles: path.join(ownerLocation(owners, "stable.profile-run-vault", "profiles"), "profile-a.json"),
    runs: path.join(ownerLocation(owners, "stable.profile-run-vault", "runs"), "run-a.json"),
    news: path.join(ownerLocation(owners, "v3.news", "news"), "items", "news-a.json"),
    indicators: path.join(ownerLocation(owners, "v3.indicators", "indicators"), "state.json"),
  };
  writeText(desired.accounts, "new-accounts\n");
  writeText(desired.batches, "new-batch\n");
  writeText(desired.drafts, "new-draft\n");
  writeText(desired.profiles, '{"value":"new-profile"}\n');
  writeText(desired.runs, '{"value":"new-run"}\n');
  writeText(desired.news, "new-news\n");
  writeText(desired.indicators, "new-indicator\n");
  return desired;
}

function replaceWithBaseline(
  desired: Record<string, string>,
  owners: readonly ResolvedPlanningDataOwner[],
  root: string,
): { stale: string; unrelated: string } {
  for (const [key, filePath] of Object.entries(desired)) writeText(filePath, `old-${key}\n`);
  const stale = path.join(ownerLocation(owners, "v3.batches", "batches"), "stale.ndjson");
  const unrelated = path.join(root, ".data", "unowned", "keep.txt");
  writeText(stale, "old-stale\n");
  writeText(unrelated, "keep-me\n");
  return { stale, unrelated };
}

describe("planning owner fixture restore transaction", { timeout: 30_000 }, () => {
  const roots: string[] = [];

  function createRoot(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `finance-owner-restore-${label}-`));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips representative owners, removes stale owned data, and preserves unrelated data", async () => {
    const root = createRoot("roundtrip");
    const item = createContext(root);
    const desired = seedRepresentativeDesired(item.owners);
    const archive = await buildArchive(item);
    const { stale, unrelated } = replaceWithBaseline(desired, item.owners, root);

    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "44444444-4444-4444-8444-444444444444",
    ));
    await commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    });

    expect(fs.readFileSync(desired.accounts, "utf-8")).toBe("new-accounts\n");
    expect(fs.readFileSync(desired.batches, "utf-8")).toBe("new-batch\n");
    expect(fs.readFileSync(desired.drafts, "utf-8")).toBe("new-draft\n");
    expect(fs.readFileSync(desired.profiles, "utf-8")).toBe('{"value":"new-profile"}\n');
    expect(fs.readFileSync(desired.runs, "utf-8")).toBe('{"value":"new-run"}\n');
    expect(fs.readFileSync(desired.news, "utf-8")).toBe("new-news\n");
    expect(fs.readFileSync(desired.indicators, "utf-8")).toBe("new-indicator\n");
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.readFileSync(unrelated, "utf-8")).toBe("keep-me\n");
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it.each([
    ["explicit", (root: string): NodeJS.ProcessEnv => ({
      NODE_ENV: "test",
      PLANNING_DATA_DIR: path.join(root, "external", "planning"),
    })],
    ["packaged", (root: string): NodeJS.ProcessEnv => ({
      NODE_ENV: "production",
      XDG_DATA_HOME: path.join(root, "xdg"),
      PLANNING_APP_NAME: "Finance Restore Fixture",
    })],
  ])("commits safely for the %s runtime root", async (label, envFactory) => {
    const root = createRoot(String(label));
    const item = createContext(root, { env: envFactory(root) });
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    const packagedVaultProfile = label === "packaged"
      ? path.join(ownerLocation(item.owners, "stable.profile-run-vault", "vault/profiles"), "profile.json")
      : null;
    writeText(accounts, "new-runtime-root\n");
    if (packagedVaultProfile) writeText(packagedVaultProfile, '{"value":"new-packaged-vault"}\n');
    const archive = await buildArchive(item);
    writeText(accounts, "old-runtime-root\n");
    if (packagedVaultProfile) writeText(packagedVaultProfile, '{"value":"old-packaged-vault"}\n');
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      label === "explicit"
        ? "55555555-5555-4555-8555-555555555555"
        : "66666666-6666-4666-8666-666666666666",
    ));
    await commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    });
    expect(fs.readFileSync(accounts, "utf-8")).toBe("new-runtime-root\n");
    if (packagedVaultProfile) {
      expect(fs.readFileSync(packagedVaultProfile, "utf-8")).toBe('{"value":"new-packaged-vault"}\n');
    }
  });

  it("rejects an Alice archive for Bob before creating transaction or Bob data", async () => {
    const root = createRoot("namespace");
    const env = { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" } satisfies NodeJS.ProcessEnv;
    const alice = createContext(root, { env, userId: "alice" });
    const bob = createContext(root, { env, userId: "bob" });
    writeText(ownerLocation(alice.owners, "v3.accounts", "accounts.json"), "alice\n");
    const archive = await buildArchive(alice);

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      bob.owners,
      archive.encryptedBytes,
      "77777777-7777-4777-8777-777777777777",
    )))).toBe("MANIFEST_NAMESPACE_MISMATCH");
    expect(fs.existsSync(bob.context.userDataDir)).toBe(false);
    expect(fs.existsSync(transactionRoot(root))).toBe(false);
  });

  it("rejects missing owners, schema drift, and payload checksum drift before creating artifacts", async () => {
    const root = createRoot("precommit-validation");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "archive-source\n");
    const archive = await buildArchive(item);
    writeText(accounts, "active-baseline\n");
    const baseline = canonicalFixtureDigest(root);

    const missingOwner = await rewrapArchive(archive.encryptedBytes, (entries) => {
      const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf-8")) as {
        owners: Array<{ ownerId: string }>;
      };
      manifest.owners = manifest.owners.filter((owner) => owner.ownerId !== "v3.accounts");
      entries.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"));
    });
    const schemaDrift = await rewrapArchive(archive.encryptedBytes, (entries) => {
      const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf-8")) as {
        owners: Array<{ ownerId: string; schemaVersion: number }>;
      };
      manifest.owners.find((owner) => owner.ownerId === "v3.accounts")!.schemaVersion += 1;
      entries.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"));
    });
    const checksumDrift = await rewrapArchive(archive.encryptedBytes, (entries) => {
      const payloadPath = "payload/v3.accounts/accounts.json";
      const original = entries.get(payloadPath)!;
      entries.set(payloadPath, Buffer.alloc(original.length, 0x78));
    });

    const cases = [
      [missingOwner, "13131313-1313-4313-8313-131313131313", "MANIFEST_REQUIRED_OWNER_MISSING"],
      [schemaDrift, "14141414-1414-4414-8414-141414141414", "MANIFEST_OWNER_SCHEMA_VERSION_MISMATCH"],
      [checksumDrift, "15151515-1515-4515-8515-151515151515", "OWNER_ARCHIVE_ENTRY_CHECKSUM_MISMATCH"],
    ] as const;
    for (const [encryptedBytes, transactionId, expectedCode] of cases) {
      expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
        root,
        item.owners,
        encryptedBytes,
        transactionId,
      )))).toBe(expectedCode);
      expect(fs.existsSync(transactionRoot(root))).toBe(false);
      expect(canonicalFixtureDigest(root)).toBe(baseline);
    }
  });

  it("rolls every owner back after an injected mid-commit failure", async () => {
    const root = createRoot("rollback");
    const item = createContext(root);
    const desired = seedRepresentativeDesired(item.owners);
    const archive = await buildArchive(item);
    replaceWithBaseline(desired, item.owners, root);
    const baseline = canonicalFixtureDigest(root);
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "88888888-8888-4888-8888-888888888888",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "after"
            && operation.ownerId === "v3.accounts"
          ) throw new Error("injected-commit-failure");
        },
      },
    }))).toBe("injected-commit-failure");
    expect(canonicalFixtureDigest(root)).toBe(baseline);
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it("recovers an after-publish crash and is idempotent", async () => {
    const root = createRoot("recovery");
    const item = createContext(root);
    const desired = seedRepresentativeDesired(item.owners);
    const archive = await buildArchive(item);
    replaceWithBaseline(desired, item.owners, root);
    const baseline = canonicalFixtureDigest(root);
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "99999999-9999-4999-8999-999999999999",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "after"
            && operation.ownerId === "v3.accounts"
          ) throw new PlanningOwnerRestoreSimulatedCrashError("after-publish");
        },
      },
    }))).toBe("OWNER_RESTORE_SIMULATED_CRASH");

    expect((await recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    })).status).toBe("rolled-back");
    expect(canonicalFixtureDigest(root)).toBe(baseline);
    expect((await recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    })).status).toBe("none");
  });

  it("preserves rollback evidence and later recovers when rollback itself fails", async () => {
    const root = createRoot("rollback-incomplete");
    const item = createContext(root);
    const desired = seedRepresentativeDesired(item.owners);
    const archive = await buildArchive(item);
    replaceWithBaseline(desired, item.owners, root);
    const baseline = canonicalFixtureDigest(root);
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "after"
            && operation.ownerId === "v3.accounts"
          ) throw new Error("primary-commit-failure");
          if (
            operation.phase === "rollback"
            && operation.operation === "rename-backup-to-target"
            && operation.timing === "before"
            && operation.ownerId === "v3.accounts"
          ) throw new Error("secondary-rollback-failure");
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
    expect(fs.existsSync(path.join(transactionRoot(root), "active.lock"))).toBe(true);

    expect((await recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    })).status).toBe("rolled-back");
    expect(canonicalFixtureDigest(root)).toBe(baseline);
  });

  it("fails before commit on an injected stage device mismatch", async () => {
    const root = createRoot("device");
    const item = createContext(root);
    writeText(ownerLocation(item.owners, "v3.accounts", "accounts.json"), "new\n");
    const archive = await buildArchive(item);
    writeText(ownerLocation(item.owners, "v3.accounts", "accounts.json"), "old\n");
    const baseline = canonicalFixtureDigest(root);

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction({
      ...transactionInput(
        root,
        item.owners,
        archive.encryptedBytes,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
      hooks: {
        getDeviceId(targetPath) {
          return path.basename(targetPath).startsWith(".planning-owner-restore-") ? BigInt(2) : BigInt(1);
        },
      },
    }))).toBe("OWNER_RESTORE_CROSS_DEVICE_STAGE");
    expect(canonicalFixtureDigest(root)).toBe(baseline);
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it("validates the transaction clock before creating a lock or journal", async () => {
    const root = createRoot("clock");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "new\n");
    const archive = await buildArchive(item);

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction({
      ...transactionInput(
        root,
        item.owners,
        archive.encryptedBytes,
        "21212121-2121-4121-8121-212121212121",
      ),
      hooks: { now: () => new Date(Number.NaN) },
    }))).toBe("OWNER_RESTORE_CLOCK_INVALID");
    expect(fs.existsSync(transactionRoot(root))).toBe(false);
  });

  it("never trusts or deletes a pre-existing workspace with an injected backup", async () => {
    const root = createRoot("workspace-preexist");
    const item = createContext(root);
    const profiles = ownerLocation(item.owners, "stable.profile-run-vault", "profiles");
    const profile = path.join(profiles, "profile.json");
    writeText(profile, '{"value":"original"}\n');
    const archive = await buildArchive(item);
    const transactionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const workspace = path.join(path.dirname(profiles), `.planning-owner-restore-${transactionId}-0`);
    writeText(path.join(workspace, "backup", "profile.json"), '{"value":"malicious"}\n');

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      transactionId,
    )))).toBe("EEXIST");
    expect(fs.readFileSync(profile, "utf-8")).toBe('{"value":"original"}\n');
    expect(fs.readFileSync(path.join(workspace, "backup", "profile.json"), "utf-8"))
      .toBe('{"value":"malicious"}\n');
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it("preserves a concurrently created target when staging fails before commit", async () => {
    const root = createRoot("concurrent-stage");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    const openingBalances = ownerLocation(item.owners, "v3.opening-balances", "opening-balances.json");
    writeText(accounts, "new\n");
    const archive = await buildArchive(item);
    writeText(accounts, "old\n");

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction({
      ...transactionInput(
        root,
        item.owners,
        archive.encryptedBytes,
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
      ),
      hooks: {
        onOperation(operation) {
          if (operation.phase === "stage" && operation.operation === "write-stage" && operation.timing === "after") {
            writeText(openingBalances, "concurrent-writer\n");
            throw new Error("stage-failure-after-concurrent-write");
          }
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.readFileSync(openingBalances, "utf-8")).toBe("concurrent-writer\n");
    expect(fs.readdirSync(transactionRoot(root)).some((name) => name.endsWith(".owner-restore.json")))
      .toBe(true);
  });

  it("does not remove an empty parent created by another writer during staging", async () => {
    const root = createRoot("concurrent-parent-stage");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    const scenarioParent = path.dirname(ownerLocation(item.owners, "v3.scenario-overrides", "overrides.json"));
    writeText(accounts, "new\n");
    const archive = await buildArchive(item);
    writeText(accounts, "old\n");

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction({
      ...transactionInput(
        root,
        item.owners,
        archive.encryptedBytes,
        "16161616-1616-4616-8616-161616161616",
      ),
      hooks: {
        onOperation(operation) {
          if (operation.phase === "stage" && operation.operation === "write-stage" && operation.timing === "after") {
            fs.mkdirSync(scenarioParent, { recursive: true });
            throw new Error("stage-failure-after-parent-write");
          }
        },
      },
    }))).toBe("stage-failure-after-parent-write");
    expect(fs.existsSync(scenarioParent)).toBe(true);
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it("does not delete a desired-equivalent target created before its stage is written", async () => {
    const root = createRoot("concurrent-desired-stage");
    const item = createContext(root);
    const openingBalances = ownerLocation(item.owners, "v3.opening-balances", "opening-balances.json");
    writeText(openingBalances, "archive-desired\n");
    const archive = await buildArchive(item);
    fs.rmSync(openingBalances);

    expect(await caughtCode(() => preparePlanningOwnerRestoreFixtureTransaction({
      ...transactionInput(
        root,
        item.owners,
        archive.encryptedBytes,
        "12121212-1212-4212-8212-121212121212",
      ),
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "stage"
            && operation.operation === "write-stage"
            && operation.timing === "before"
            && operation.ownerId === "v3.opening-balances"
          ) {
            writeText(openingBalances, "archive-desired\n");
            throw new Error("stage-failure-after-equivalent-write");
          }
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.readFileSync(openingBalances, "utf-8")).toBe("archive-desired\n");
  });

  it("rejects a checksum-valid journal that redirects a target path and preserves evidence", async () => {
    const root = createRoot("journal-path");
    const item = createContext(root);
    writeText(ownerLocation(item.owners, "v3.accounts", "accounts.json"), "new\n");
    const archive = await buildArchive(item);
    writeText(ownerLocation(item.owners, "v3.accounts", "accounts.json"), "old\n");
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ));
    const victim = path.join(root, "victim.txt");
    writeText(victim, "do-not-touch\n");
    const journal = JSON.parse(fs.readFileSync(prepared.journalPath, "utf-8")) as RawRestoreJournal;
    journal.units[0].targetPath = victim;
    resealRawJournal(journal);
    fs.writeFileSync(prepared.journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    expect(await caughtCode(() => recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    }))).toBe("OWNER_RESTORE_JOURNAL_PLAN_MISMATCH");
    expect(fs.readFileSync(victim, "utf-8")).toBe("do-not-touch\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
  });

  it("does not delete a valid desired target when its rollback backup was corrupted", async () => {
    const root = createRoot("backup-corruption");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "new-owner-value\n");
    const archive = await buildArchive(item);
    writeText(accounts, "old-owner-value\n");
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "17171717-1717-4717-8717-171717171717",
    ));
    const journal = JSON.parse(fs.readFileSync(prepared.journalPath, "utf-8")) as {
      units: Array<{ ownerId: string; logicalPath: string; anchorPath: string; workspaceName: string }>;
    };
    const accountsUnit = journal.units.find((unit) => unit.ownerId === "v3.accounts" && unit.logicalPath === "accounts.json")!;
    const backupPath = path.join(accountsUnit.anchorPath, accountsUnit.workspaceName, "backup");

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "after"
            && operation.ownerId === "v3.accounts"
          ) {
            fs.writeFileSync(backupPath, "corrupted-backup\n");
            throw new Error("failure-after-backup-corruption");
          }
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.readFileSync(accounts, "utf-8")).toBe("new-owner-value\n");
    expect(fs.readFileSync(backupPath, "utf-8")).toBe("corrupted-backup\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
  });

  it("preserves a concurrent writer value moved into backup before commit", async () => {
    const root = createRoot("backup-concurrent-writer");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "archive-value\n");
    const archive = await buildArchive(item);
    writeText(accounts, "original-value\n");
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "22222222-2222-4222-8222-222222222223",
    ));
    const journal = JSON.parse(fs.readFileSync(prepared.journalPath, "utf-8")) as RawRestoreJournal;
    const accountsUnit = journal.units.find((unit) => unit.ownerId === "v3.accounts" && unit.logicalPath === "accounts.json")!;
    const backupPath = path.join(accountsUnit.anchorPath, accountsUnit.workspaceName, "backup");

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-target-to-backup"
            && operation.timing === "before"
            && operation.ownerId === "v3.accounts"
          ) writeText(accounts, "concurrent-writer-value\n");
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.existsSync(accounts)).toBe(false);
    expect(fs.readFileSync(backupPath, "utf-8")).toBe("concurrent-writer-value\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
  });

  it("uses no-clobber file publication when an originally absent target appears", async () => {
    const root = createRoot("absent-no-clobber");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "archive-value\n");
    const archive = await buildArchive(item);
    fs.rmSync(accounts);
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "23232323-2323-4323-8323-232323232323",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "before"
            && operation.ownerId === "v3.accounts"
          ) writeText(accounts, "concurrent-writer-value\n");
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLBACK_INCOMPLETE");
    expect(fs.readFileSync(accounts, "utf-8")).toBe("concurrent-writer-value\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
  });

  it("cross-checks an anchor-redirected journal plan against the durable lock", async () => {
    const root = createRoot("anchor-plan");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "archive-value\n");
    const archive = await buildArchive(item);
    writeText(accounts, "original-value\n");
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "24242424-2424-4424-8424-242424242424",
    ));
    const journal = JSON.parse(fs.readFileSync(prepared.journalPath, "utf-8")) as RawRestoreJournal;
    const unit = journal.units[0];
    const fakeWorkspace = path.join(root, unit.workspaceName);
    writeText(path.join(fakeWorkspace, "victim.txt"), "preserve-me\n");
    const rootStats = fs.lstatSync(root, { bigint: true });
    const workspaceStats = fs.lstatSync(fakeWorkspace, { bigint: true });
    unit.anchorPath = root;
    unit.anchorIdentity = [rootStats.dev, rootStats.ino, rootStats.mode].join(":");
    unit.workspaceIdentity = [workspaceStats.dev, workspaceStats.ino, workspaceStats.mode].join(":");
    const parentSegments = path.relative(root, unit.parentPath).split(path.sep).filter(Boolean);
    unit.missingParents = parentSegments.map((_, index) => path.join(root, ...parentSegments.slice(0, index + 1)));
    unit.createdParents = [];
    resealRawJournal(journal, true);
    fs.writeFileSync(prepared.journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    expect(await caughtCode(() => recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    }))).toBe("OWNER_RESTORE_LOCK_MISMATCH");
    expect(fs.readFileSync(path.join(fakeWorkspace, "victim.txt"), "utf-8")).toBe("preserve-me\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);
  });

  it("recovers rolled-back cleanup after the lock was removed but the journal remained", async () => {
    const root = createRoot("rolled-back-cleanup");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "new\n");
    const archive = await buildArchive(item);
    writeText(accounts, "old\n");
    const baseline = canonicalFixtureDigest(root);
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "18181818-1818-4818-8818-181818181818",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (
            operation.phase === "commit"
            && operation.operation === "rename-stage-to-target"
            && operation.timing === "after"
            && operation.ownerId === "v3.accounts"
          ) throw new Error("primary-failure");
          if (operation.phase === "cleanup" && operation.operation === "remove-journal" && operation.timing === "before") {
            throw new Error("cleanup-failure");
          }
        },
      },
    }))).toBe("OWNER_RESTORE_ROLLED_BACK_CLEANUP_FAILED");
    expect(canonicalFixtureDigest(root)).toBe(baseline);
    expect(fs.existsSync(path.join(transactionRoot(root), "active.lock"))).toBe(false);
    expect(fs.existsSync(prepared.journalPath)).toBe(true);

    expect((await recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    })).status).toBe("rolled-back");
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });

  it("fails closed on a journal-less lock without touching the lock or owner data", async () => {
    const root = createRoot("orphan-lock");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "keep-owner-data\n");
    const txRoot = transactionRoot(root);
    fs.mkdirSync(txRoot, { mode: 0o700 });
    const transactionId = "19191919-1919-4919-8919-191919191919";
    const lockToken = "20202020-2020-4020-8020-202020202020";
    writeText(path.join(txRoot, "active.lock"), `${JSON.stringify({
      kind: "planning-owner-restore-lock",
      transactionId,
      lockToken,
      planDigest: "0".repeat(64),
    })}\n`);
    fs.chmodSync(path.join(txRoot, "active.lock"), 0o600);
    const journalPath = path.join(txRoot, `${transactionId}.owner-restore.json`);

    expect(await caughtCode(() => recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: txRoot,
      platform: "linux",
    }))).toBe("OWNER_RESTORE_JOURNAL_MISSING_WITH_LOCK");
    expect(fs.readFileSync(accounts, "utf-8")).toBe("keep-owner-data\n");
    expect(fs.readdirSync(txRoot)).toEqual(["active.lock"]);
  });

  it("keeps a durable committed state on cleanup interruption and recovery only removes evidence", async () => {
    const root = createRoot("committed-recovery");
    const item = createContext(root);
    const accounts = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeText(accounts, "new-committed\n");
    const archive = await buildArchive(item);
    writeText(accounts, "old-committed\n");
    const prepared = await preparePlanningOwnerRestoreFixtureTransaction(transactionInput(
      root,
      item.owners,
      archive.encryptedBytes,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ));

    expect(await caughtCode(() => commitPlanningOwnerRestoreFixtureTransaction({
      prepared,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
      hooks: {
        onOperation(operation) {
          if (operation.phase === "cleanup" && operation.operation === "remove-workspace" && operation.timing === "before") {
            throw new PlanningOwnerRestoreSimulatedCrashError("committed-cleanup");
          }
        },
      },
    }))).toBe("OWNER_RESTORE_SIMULATED_CRASH");
    expect(fs.readFileSync(accounts, "utf-8")).toBe("new-committed\n");
    expect(fs.existsSync(prepared.journalPath)).toBe(true);

    expect((await recoverPendingPlanningOwnerRestoreFixtureTransaction({
      journalPath: prepared.journalPath,
      owners: item.owners,
      fixtureRoot: root,
      transactionRoot: transactionRoot(root),
      platform: "linux",
    })).status).toBe("committed-cleaned");
    expect(fs.readFileSync(accounts, "utf-8")).toBe("new-committed\n");
    expect(fs.readdirSync(transactionRoot(root))).toEqual([]);
  });
});
