import crypto from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  assertPlanningOwnerAuxiliaryPathOutsideOwners,
  withValidatedPlanningOwnerArchivePayload,
} from "./planningOwnerArchive";
import {
  planningOwnerPayloadPath,
  sha256PlanningOwnerBytes,
  type PlanningOwnerManifestEntry,
  type PlanningOwnerManifestFile,
} from "./planningOwnerManifest";
import {
  normalizePlanningOwnerLogicalPath,
  type PlanningOwnerLocation,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";

const JOURNAL_KIND = "planning-owner-restore-transaction";
const JOURNAL_VERSION = 1;
const LOCK_KIND = "planning-owner-restore-lock";
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_ENTRIES = 20_000;
const MAX_ACTIVE_BYTES = 256 * 1024 * 1024;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const activeOperationGuards = new Set<string>();

export type PlanningOwnerRestoreFaultOperation = Readonly<{
  phase: "stage" | "commit" | "rollback" | "recovery" | "cleanup";
  operation:
    | "create-workspace"
    | "write-stage"
    | "verify-stage"
    | "create-target-parent"
    | "rename-target-to-backup"
    | "rename-stage-to-target"
    | "verify-target"
    | "remove-target"
    | "rename-backup-to-target"
    | "remove-workspace"
    | "remove-journal";
  timing: "before" | "after";
  transactionId: string;
  unitIndex?: number;
  ownerId?: string;
  logicalPath?: string;
}>;

export type PlanningOwnerRestoreTransactionHooks = Readonly<{
  onOperation?: (operation: PlanningOwnerRestoreFaultOperation) => void | Promise<void>;
  getDeviceId?: (targetPath: string) => bigint | Promise<bigint>;
  now?: () => Date;
}>;

export class PlanningOwnerRestoreTransactionError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, detail?: string, cause?: unknown) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PlanningOwnerRestoreTransactionError";
    this.code = code;
    this.cause = cause;
  }
}

export class PlanningOwnerRestoreSimulatedCrashError extends PlanningOwnerRestoreTransactionError {
  constructor(detail?: string) {
    super("OWNER_RESTORE_SIMULATED_CRASH", detail);
    this.name = "PlanningOwnerRestoreSimulatedCrashError";
  }
}

type EntityEntry = Readonly<{
  path: string;
  kind: "directory" | "file";
  sizeBytes: number;
  sha256?: string;
}>;

type EntitySnapshot = Readonly<{
  exists: boolean;
  kind: "directory" | "file";
  checksum: string;
  entries: number;
  files: number;
  bytes: number;
}>;

type JournalUnitState =
  | "planned"
  | "staged"
  | "backup-intent"
  | "backed-up"
  | "activate-intent"
  | "activated"
  | "rollback-intent"
  | "rolled-back";

type JournalPhase =
  | "preparing"
  | "prepared"
  | "committing"
  | "verifying"
  | "committed"
  | "rolling-back"
  | "rolled-back"
  | "rollback-incomplete";

type JournalUnit = {
  index: number;
  ownerId: string;
  logicalPath: string;
  kind: "directory" | "file";
  targetPath: string;
  parentPath: string;
  anchorPath: string;
  anchorIdentity: string;
  parentIdentity: string | null;
  workspaceName: string;
  workspaceIdentity: string | null;
  missingParents: string[];
  createdParents: string[];
  original: EntitySnapshot;
  desired: EntitySnapshot;
  state: JournalUnitState;
};

type RestoreJournalPayload = {
  kind: typeof JOURNAL_KIND;
  version: typeof JOURNAL_VERSION;
  transactionId: string;
  archiveId: string;
  createdAt: string;
  updatedAt: string;
  fixtureRoot: string;
  transactionRoot: string;
  platform: string;
  registryDigest: string;
  planDigest: string;
  lockToken: string;
  phase: JournalPhase;
  primaryErrorCode: string | null;
  units: JournalUnit[];
};

type RestoreJournal = RestoreJournalPayload & { journalChecksum: string };

type StagedPayloadFile = Readonly<{
  relativePath: string;
  archivePath: string;
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
}>;

type MaterializedUnit = Readonly<{
  journal: JournalUnit;
  files: readonly StagedPayloadFile[];
}>;

export type PreparedPlanningOwnerRestoreTransaction = Readonly<{
  transactionId: string;
  archiveId: string;
  journalPath: string;
  units: number;
}>;

export type PlanningOwnerRestoreRecoveryResult = Readonly<{
  status: "none" | "committed-cleaned" | "rolled-back";
  transactionId?: string;
}>;

const SnapshotSchema = z.object({
  exists: z.boolean(),
  kind: z.enum(["directory", "file"]),
  checksum: z.string().regex(SHA256_RE),
  entries: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  files: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

const JournalUnitSchema = z.object({
  index: z.number().int().nonnegative().max(10_000),
  ownerId: z.string().min(1).max(128),
  logicalPath: z.string().min(1).max(2048),
  kind: z.enum(["directory", "file"]),
  targetPath: z.string().min(1).max(8192),
  parentPath: z.string().min(1).max(8192),
  anchorPath: z.string().min(1).max(8192),
  anchorIdentity: z.string().min(1).max(256),
  parentIdentity: z.string().min(1).max(256).nullable(),
  workspaceName: z.string().min(1).max(256),
  workspaceIdentity: z.string().min(1).max(256).nullable(),
  missingParents: z.array(z.string().min(1).max(8192)).max(256),
  createdParents: z.array(z.string().min(1).max(8192)).max(256),
  original: SnapshotSchema,
  desired: SnapshotSchema,
  state: z.enum([
    "planned",
    "staged",
    "backup-intent",
    "backed-up",
    "activate-intent",
    "activated",
    "rollback-intent",
    "rolled-back",
  ]),
}).strict();

const JournalPayloadSchema = z.object({
  kind: z.literal(JOURNAL_KIND),
  version: z.literal(JOURNAL_VERSION),
  transactionId: z.string().regex(UUID_RE),
  archiveId: z.string().regex(UUID_RE),
  createdAt: z.string().datetime({ offset: false }),
  updatedAt: z.string().datetime({ offset: false }),
  fixtureRoot: z.string().min(1).max(8192),
  transactionRoot: z.string().min(1).max(8192),
  platform: z.string().min(1).max(32),
  registryDigest: z.string().regex(SHA256_RE),
  planDigest: z.string().regex(SHA256_RE),
  lockToken: z.string().regex(UUID_RE),
  phase: z.enum([
    "preparing",
    "prepared",
    "committing",
    "verifying",
    "committed",
    "rolling-back",
    "rolled-back",
    "rollback-incomplete",
  ]),
  primaryErrorCode: z.string().min(1).max(256).nullable(),
  units: z.array(JournalUnitSchema).min(1).max(10_000),
}).strict();

const JournalSchema = JournalPayloadSchema.extend({
  journalChecksum: z.string().regex(SHA256_RE),
}).strict();

const LockSchema = z.object({
  kind: z.literal(LOCK_KIND),
  transactionId: z.string().regex(UUID_RE),
  lockToken: z.string().regex(UUID_RE),
  planDigest: z.string().regex(SHA256_RE),
}).strict();

function sha256(input: string | Uint8Array): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function entityChecksum(input: {
  exists: boolean;
  kind: "directory" | "file";
  entries: readonly EntityEntry[];
}): string {
  return sha256(JSON.stringify([
    input.exists,
    input.kind,
    input.entries.map((entry) => [entry.path, entry.kind, entry.sizeBytes, entry.sha256 ?? null]),
  ]));
}

function absentSnapshot(kind: "directory" | "file"): EntitySnapshot {
  return Object.freeze({
    exists: false,
    kind,
    checksum: entityChecksum({ exists: false, kind, entries: [] }),
    entries: 0,
    files: 0,
    bytes: 0,
  });
}

function buildSnapshot(
  kind: "directory" | "file",
  exists: boolean,
  entries: readonly EntityEntry[],
): EntitySnapshot {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const files = ordered.filter((entry) => entry.kind === "file");
  return Object.freeze({
    exists,
    kind,
    checksum: entityChecksum({ exists, kind, entries: ordered }),
    entries: ordered.length,
    files: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  });
}

function fingerprint(stats: BigIntStats): string {
  return [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs].join(":");
}

function directoryIdentity(stats: BigIntStats): string {
  return [stats.dev, stats.ino, stats.mode].join(":");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function pathIsInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function nowIso(hooks: PlanningOwnerRestoreTransactionHooks): string {
  let value: string;
  try {
    value = (hooks.now?.() ?? new Date()).toISOString();
  } catch {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_CLOCK_INVALID");
  }
  if (new Date(value).toISOString() !== value) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_CLOCK_INVALID");
  }
  return value;
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && code.trim()) return code.trim();
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}

async function callFault(
  hooks: PlanningOwnerRestoreTransactionHooks,
  operation: PlanningOwnerRestoreFaultOperation,
): Promise<void> {
  await hooks.onOperation?.(operation);
}

function acquireOperationGuard(journalPath: string): () => void {
  const key = path.resolve(journalPath);
  if (activeOperationGuards.has(key)) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_OPERATION_IN_PROGRESS");
  }
  activeOperationGuards.add(key);
  return () => {
    activeOperationGuards.delete(key);
  };
}

function operationFor(
  phase: PlanningOwnerRestoreFaultOperation["phase"],
  operation: PlanningOwnerRestoreFaultOperation["operation"],
  timing: PlanningOwnerRestoreFaultOperation["timing"],
  transactionId: string,
  unit?: JournalUnit,
): PlanningOwnerRestoreFaultOperation {
  return Object.freeze({
    phase,
    operation,
    timing,
    transactionId,
    ...(unit ? {
      unitIndex: unit.index,
      ownerId: unit.ownerId,
      logicalPath: unit.logicalPath,
    } : {}),
  });
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await fs.open(directoryPath, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncRenameParents(fromPath: string, toPath: string): Promise<void> {
  const fromParent = path.dirname(fromPath);
  const toParent = path.dirname(toPath);
  await syncDirectory(fromParent);
  if (toParent !== fromParent) await syncDirectory(toParent);
}

async function readFileNoFollow(filePath: string): Promise<{ bytes: Buffer; stats: BigIntStats }> {
  const before = await fs.lstat(filePath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_UNSAFE", filePath);
  }
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer | undefined;
  let succeeded = false;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || fingerprint(opened) !== fingerprint(before)) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_CHANGED", filePath);
    }
    bytes = await handle.readFile();
    const afterHandle = await handle.stat({ bigint: true });
    const afterPath = await fs.lstat(filePath, { bigint: true });
    if (
      fingerprint(opened) !== fingerprint(afterHandle)
      || fingerprint(afterHandle) !== fingerprint(afterPath)
      || BigInt(bytes.length) !== afterHandle.size
    ) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_CHANGED", filePath);
    }
    succeeded = true;
    return { bytes, stats: afterHandle };
  } finally {
    if (!succeeded) bytes?.fill(0);
    await handle.close().catch(() => undefined);
  }
}

async function snapshotEntity(
  targetPath: string,
  kind: "directory" | "file",
): Promise<EntitySnapshot> {
  let rootStats: BigIntStats;
  try {
    rootStats = await fs.lstat(targetPath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return absentSnapshot(kind);
    throw error;
  }
  if (rootStats.isSymbolicLink() || (kind === "file" ? !rootStats.isFile() : !rootStats.isDirectory())) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_KIND_MISMATCH", targetPath);
  }

  if (kind === "file") {
    const { bytes } = await readFileNoFollow(targetPath);
    try {
      if (bytes.length > MAX_ACTIVE_BYTES) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ACTIVE_LIMIT_EXCEEDED", targetPath);
      }
      return buildSnapshot("file", true, [{
        path: "",
        kind: "file",
        sizeBytes: bytes.length,
        sha256: sha256PlanningOwnerBytes(bytes),
      }]);
    } finally {
      bytes.fill(0);
    }
  }

  const rootIdentity = fingerprint(rootStats);
  const entries: EntityEntry[] = [];
  let totalBytes = 0;
  async function visit(directoryPath: string, relativeDirectory: string): Promise<void> {
    const names = (await fs.readdir(directoryPath)).sort();
    for (const name of names) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      if (normalizePlanningOwnerLogicalPath(relativePath) !== relativePath) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_PATH_INVALID", relativePath);
      }
      const entryPath = path.join(directoryPath, name);
      const stats = await fs.lstat(entryPath, { bigint: true });
      if (stats.isSymbolicLink()) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_UNSAFE", entryPath);
      }
      if (stats.isDirectory()) {
        entries.push({ path: relativePath, kind: "directory", sizeBytes: 0 });
        if (entries.length > MAX_ACTIVE_ENTRIES) {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ACTIVE_LIMIT_EXCEEDED", targetPath);
        }
        await visit(entryPath, relativePath);
        continue;
      }
      if (!stats.isFile()) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_UNSAFE", entryPath);
      }
      const { bytes } = await readFileNoFollow(entryPath);
      try {
        totalBytes += bytes.length;
        entries.push({
          path: relativePath,
          kind: "file",
          sizeBytes: bytes.length,
          sha256: sha256PlanningOwnerBytes(bytes),
        });
      } finally {
        bytes.fill(0);
      }
      if (entries.length > MAX_ACTIVE_ENTRIES || totalBytes > MAX_ACTIVE_BYTES) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ACTIVE_LIMIT_EXCEEDED", targetPath);
      }
    }
  }
  await visit(targetPath, "");
  const after = await fs.lstat(targetPath, { bigint: true });
  if (after.isSymbolicLink() || !after.isDirectory() || fingerprint(after) !== rootIdentity) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_CHANGED", targetPath);
  }
  return buildSnapshot("directory", true, entries);
}

function snapshotsEqual(left: EntitySnapshot, right: EntitySnapshot): boolean {
  return left.exists === right.exists
    && left.kind === right.kind
    && left.checksum === right.checksum
    && left.entries === right.entries
    && left.files === right.files
    && left.bytes === right.bytes;
}

function desiredSnapshot(
  kind: "directory" | "file",
  files: readonly { relativePath: string; sizeBytes: number; sha256: string }[],
): EntitySnapshot {
  if (kind === "file") {
    if (files.length === 0) return absentSnapshot("file");
    if (files.length !== 1 || files[0].relativePath !== "") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_FILE_LOCATION_INVALID");
    }
    return buildSnapshot("file", true, [{
      path: "",
      kind: "file",
      sizeBytes: files[0].sizeBytes,
      sha256: files[0].sha256,
    }]);
  }

  const directories = new Set<string>();
  for (const file of files) {
    const segments = file.relativePath.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  const entries: EntityEntry[] = [
    ...[...directories].map((directoryPath) => ({
      path: directoryPath,
      kind: "directory" as const,
      sizeBytes: 0,
    })),
    ...files.map((file) => ({
      path: file.relativePath,
      kind: "file" as const,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    })),
  ];
  return buildSnapshot("directory", true, entries);
}

function manifestFileMatchesLocation(file: PlanningOwnerManifestFile, location: PlanningOwnerLocation): boolean {
  if (location.kind === "file") return file.path === location.logicalPath;
  return file.path.startsWith(`${location.logicalPath}/`);
}

function relativeManifestPath(file: PlanningOwnerManifestFile, location: PlanningOwnerLocation): string {
  if (location.kind === "file") return "";
  return file.path.slice(location.logicalPath.length + 1);
}

function workspaceName(transactionId: string, unitIndex: number): string {
  return `.planning-owner-restore-${transactionId}-${unitIndex}`;
}

function registryDigest(owners: readonly ResolvedPlanningDataOwner[], platform: NodeJS.Platform): string {
  const canonical = [...owners]
    .sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0)
    .map((owner) => ({
      ownerId: owner.ownerId,
      schemaVersion: owner.schemaVersion,
      logicalPath: owner.logicalPath,
      namespace: owner.namespace,
      requiredInManifest: owner.requiredInManifest,
      emptyAllowed: owner.emptyAllowed,
      locations: [...owner.locations]
        .sort((left, right) => left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0)
        .map((location) => ({
          logicalPath: location.logicalPath,
          targetPath: path.resolve(location.targetPath),
          kind: location.kind,
          legacy: location.legacy === true,
        })),
    }));
  return sha256(JSON.stringify({ platform, owners: canonical }));
}

function restorePlanDigest(input: {
  transactionId: string;
  archiveId: string;
  fixtureRoot: string;
  transactionRoot: string;
  platform: string;
  registryDigest: string;
  units: readonly JournalUnit[];
}): string {
  return sha256(JSON.stringify({
    transactionId: input.transactionId,
    archiveId: input.archiveId,
    fixtureRoot: input.fixtureRoot,
    transactionRoot: input.transactionRoot,
    platform: input.platform,
    registryDigest: input.registryDigest,
    units: input.units.map((unit) => ({
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
  }));
}

function mapManifestToMaterializedUnits(input: {
  owners: readonly ResolvedPlanningDataOwner[];
  manifestOwners: readonly PlanningOwnerManifestEntry[];
  payloadEntries: ReadonlyMap<string, Buffer>;
}): Array<Readonly<{
  owner: ResolvedPlanningDataOwner;
  location: PlanningOwnerLocation;
  files: readonly StagedPayloadFile[];
  desired: EntitySnapshot;
}>> {
  const manifestById = new Map(input.manifestOwners.map((owner) => [owner.ownerId, owner]));
  const result: Array<Readonly<{
    owner: ResolvedPlanningDataOwner;
    location: PlanningOwnerLocation;
    files: readonly StagedPayloadFile[];
    desired: EntitySnapshot;
  }>> = [];

  for (const owner of [...input.owners].sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0)) {
    const manifestOwner = manifestById.get(owner.ownerId);
    if (!manifestOwner) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_MANIFEST_OWNER_MISSING", owner.ownerId);
    }
    const matches = new Map<string, number>();
    for (const location of [...owner.locations].sort((left, right) => left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0)) {
      const files = manifestOwner.files.filter((file) => manifestFileMatchesLocation(file, location)).map((file) => {
        matches.set(file.path, (matches.get(file.path) ?? 0) + 1);
        const archivePath = planningOwnerPayloadPath(owner.ownerId, file.path);
        const bytes = input.payloadEntries.get(archivePath);
        if (!bytes) {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PAYLOAD_MISSING", archivePath);
        }
        return Object.freeze({
          relativePath: relativeManifestPath(file, location),
          archivePath,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          bytes,
        });
      });
      result.push(Object.freeze({
        owner,
        location,
        files: Object.freeze(files),
        desired: desiredSnapshot(location.kind, files),
      }));
    }
    for (const file of manifestOwner.files) {
      if (matches.get(file.path) !== 1) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOGICAL_LOCATION_AMBIGUOUS", `${owner.ownerId}:${file.path}`);
      }
    }
  }
  return result;
}

async function assertTrustedPosixDirectoryChain(directoryPath: string): Promise<void> {
  if (typeof process.getuid !== "function") {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_DIRECTORY_UNTRUSTED", directoryPath);
  }
  const currentUid = process.getuid();
  let current = path.resolve(directoryPath);
  while (true) {
    const stats = await fs.lstat(current, { bigint: true });
    const mode = Number(stats.mode & BigInt(0o7777));
    const ownerUid = Number(stats.uid);
    if (
      stats.isSymbolicLink()
      || !stats.isDirectory()
      || (ownerUid !== currentUid && ownerUid !== 0)
      || ((mode & 0o022) !== 0 && (mode & 0o1000) === 0)
    ) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_DIRECTORY_UNTRUSTED", current);
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function resolveFixtureRoot(fixtureRoot: string): Promise<string> {
  const resolved = path.resolve(fixtureRoot);
  const stats = await fs.lstat(resolved, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_FIXTURE_BOUNDARY_INVALID");
  }
  const real = await fs.realpath(resolved);
  const tempReal = await fs.realpath(os.tmpdir());
  if (real !== resolved || !pathIsInside(tempReal, real) || real === tempReal) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_FIXTURE_BOUNDARY_REQUIRED");
  }
  await assertTrustedPosixDirectoryChain(real);
  return real;
}

async function inspectTargetParent(input: {
  fixtureRoot: string;
  targetPath: string;
}): Promise<{
  parentPath: string;
  anchorPath: string;
  anchorIdentity: string;
  parentIdentity: string | null;
  missingParents: string[];
}> {
  const targetPath = path.resolve(input.targetPath);
  if (!pathIsInside(input.fixtureRoot, targetPath) || targetPath === input.fixtureRoot) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_OUTSIDE_FIXTURE", targetPath);
  }
  const parentPath = path.dirname(targetPath);
  const relative = path.relative(input.fixtureRoot, parentPath);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = input.fixtureRoot;
  let anchorPath = input.fixtureRoot;
  let anchorStats = await fs.lstat(anchorPath, { bigint: true });
  const missingParents: string[] = [];
  let missing = false;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (missing) {
      missingParents.push(current);
      continue;
    }
    try {
      const stats = await fs.lstat(current, { bigint: true });
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_PARENT_UNSAFE", current);
      }
      const real = await fs.realpath(current);
      if (real !== current) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_PARENT_UNSAFE", current);
      }
      anchorPath = current;
      anchorStats = stats;
    } catch (error) {
      if (!isMissing(error)) throw error;
      missing = true;
      missingParents.push(current);
    }
  }
  await assertTrustedPosixDirectoryChain(anchorPath);
  return {
    parentPath,
    anchorPath,
    anchorIdentity: directoryIdentity(anchorStats),
    parentIdentity: missingParents.length === 0 ? directoryIdentity(anchorStats) : null,
    missingParents,
  };
}

function assertFixturePlatform(platform: NodeJS.Platform): void {
  if (platform === "win32" || process.platform === "win32") {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_WINDOWS_UNVERIFIED");
  }
}

async function currentDeviceId(targetPath: string, hooks: PlanningOwnerRestoreTransactionHooks): Promise<bigint> {
  if (hooks.getDeviceId) return hooks.getDeviceId(targetPath);
  return (await fs.lstat(targetPath, { bigint: true })).dev;
}

async function assertSameDevice(paths: readonly string[], hooks: PlanningOwnerRestoreTransactionHooks): Promise<void> {
  const devices = await Promise.all(paths.map((targetPath) => currentDeviceId(targetPath, hooks)));
  if (new Set(devices.map(String)).size !== 1) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_CROSS_DEVICE_STAGE");
  }
}

function journalPathFor(transactionRoot: string, transactionId: string): string {
  return path.join(transactionRoot, `${transactionId}.owner-restore.json`);
}

function lockPathFor(transactionRoot: string): string {
  return path.join(transactionRoot, "active.lock");
}

function journalPayload(journal: RestoreJournal): RestoreJournalPayload {
  const payload = { ...journal } as Partial<RestoreJournal>;
  Reflect.deleteProperty(payload, "journalChecksum");
  return JournalPayloadSchema.parse(payload) as RestoreJournalPayload;
}

function sealJournal(payload: RestoreJournalPayload): RestoreJournal {
  const parsed = JournalPayloadSchema.parse(payload) as RestoreJournalPayload;
  return JournalSchema.parse({
    ...parsed,
    journalChecksum: sha256(JSON.stringify(parsed)),
  }) as RestoreJournal;
}

async function persistJournal(
  journalPath: string,
  journal: RestoreJournal,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<RestoreJournal> {
  const next = sealJournal({
    ...journalPayload(journal),
    updatedAt: nowIso(hooks),
  });
  const parentPath = path.dirname(journalPath);
  const tempPath = path.join(parentPath, `.journal-${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf-8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tempPath, journalPath);
    await syncDirectory(parentPath);
    return next;
  } catch (error) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_WRITE_FAILED", undefined, error);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function readSecureJsonFile(filePath: string, maxBytes: number): Promise<unknown> {
  let before: BigIntStats;
  try {
    before = await fs.lstat(filePath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (
    before.isSymbolicLink()
    || !before.isFile()
    || before.size < BigInt(1)
    || before.size > BigInt(maxBytes)
    || (before.mode & BigInt(0o077)) !== BigInt(0)
  ) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_INVALID");
  }
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (fingerprint(opened) !== fingerprint(before)) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fingerprint(opened) !== fingerprint(after) || BigInt(bytes.length) !== after.size) {
      bytes.fill(0);
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_INVALID");
    }
    try {
      return JSON.parse(bytes.toString("utf-8")) as unknown;
    } catch {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_INVALID");
    } finally {
      bytes.fill(0);
    }
  } finally {
    await handle.close();
  }
}

async function readJournal(journalPath: string): Promise<RestoreJournal | null> {
  const raw = await readSecureJsonFile(journalPath, MAX_JOURNAL_BYTES);
  if (raw === null) return null;
  let parsed: RestoreJournal;
  try {
    parsed = JournalSchema.parse(raw) as RestoreJournal;
  } catch {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_INVALID");
  }
  if (sha256(JSON.stringify(journalPayload(parsed))) !== parsed.journalChecksum) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_CHECKSUM_INVALID");
  }
  return parsed;
}

async function pendingJournalFiles(transactionRoot: string): Promise<string[]> {
  try {
    return (await fs.readdir(transactionRoot))
      .filter((name) => name.endsWith(".owner-restore.json"))
      .sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function acquireLock(input: {
  transactionRoot: string;
  transactionId: string;
  lockToken: string;
  planDigest: string;
}): Promise<void> {
  if ((await pendingJournalFiles(input.transactionRoot)).length > 0) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PENDING_TRANSACTION");
  }
  const lockPath = lockPathFor(input.transactionRoot);
  let handle;
  let created = false;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
    created = true;
    await handle.writeFile(`${JSON.stringify({
      kind: LOCK_KIND,
      transactionId: input.transactionId,
      lockToken: input.lockToken,
      planDigest: input.planDigest,
    })}\n`, "utf-8");
    await handle.sync();
    await syncDirectory(input.transactionRoot);
  } catch (error) {
    if (created && handle) {
      const handleStats = await handle.stat({ bigint: true }).catch(() => null);
      await handle.close().catch(() => undefined);
      handle = undefined;
      if (handleStats) {
        const pathStats = await fs.lstat(lockPath, { bigint: true }).catch(() => null);
        if (pathStats && fingerprint(pathStats) === fingerprint(handleStats)) {
          await fs.rm(lockPath, { force: false }).catch(() => undefined);
          await syncDirectory(input.transactionRoot).catch(() => undefined);
        }
      }
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCKED");
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
  let pending: string[];
  try {
    pending = await pendingJournalFiles(input.transactionRoot);
  } catch (error) {
    await releaseLockIfOwned(input).catch(() => undefined);
    throw error;
  }
  if (pending.length > 0) {
    await releaseLockIfOwned(input).catch(() => undefined);
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PENDING_TRANSACTION");
  }
}

async function assertLock(journal: RestoreJournal, allowMissing: boolean): Promise<"missing" | "present"> {
  const raw = await readSecureJsonFile(lockPathFor(journal.transactionRoot), 4096);
  if (raw === null && allowMissing) return "missing";
  if (raw === null) throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_MISSING");
  let lock: z.infer<typeof LockSchema>;
  try {
    lock = LockSchema.parse(raw);
  } catch {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_INVALID");
  }
  if (
    lock.transactionId !== journal.transactionId
    || lock.lockToken !== journal.lockToken
    || lock.planDigest !== journal.planDigest
  ) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_MISMATCH");
  }
  return "present";
}

async function releaseLockIfOwned(input: {
  transactionRoot: string;
  transactionId: string;
  lockToken: string;
  allowMissing?: boolean;
}): Promise<void> {
  const lockPath = lockPathFor(input.transactionRoot);
  const raw = await readSecureJsonFile(lockPath, 4096);
  if (raw === null && input.allowMissing) return;
  if (raw === null) throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_MISSING");
  let lock: z.infer<typeof LockSchema>;
  try {
    lock = LockSchema.parse(raw);
  } catch {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_INVALID");
  }
  if (lock.transactionId !== input.transactionId || lock.lockToken !== input.lockToken) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_MISMATCH");
  }
  await fs.rm(lockPath, { force: false });
  await syncDirectory(input.transactionRoot);
}

async function assertNoLockWithMissingJournal(transactionRoot: string): Promise<void> {
  const raw = await readSecureJsonFile(lockPathFor(transactionRoot), 4096);
  if (raw === null) return;
  try {
    LockSchema.parse(raw);
  } catch {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_LOCK_INVALID");
  }
  throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_MISSING_WITH_LOCK");
}

function assertJournalMatchesInput(input: {
  journal: RestoreJournal;
  journalPath: string;
  fixtureRoot: string;
  transactionRoot: string;
  owners: readonly ResolvedPlanningDataOwner[];
  platform: NodeJS.Platform;
}): void {
  const { journal } = input;
  if (
    journal.fixtureRoot !== input.fixtureRoot
    || journal.transactionRoot !== input.transactionRoot
    || journal.platform !== input.platform
    || journal.registryDigest !== registryDigest(input.owners, input.platform)
    || input.journalPath !== journalPathFor(input.transactionRoot, journal.transactionId)
  ) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_CONTEXT_MISMATCH");
  }
  if (journal.planDigest !== restorePlanDigest(journal)) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_PLAN_MISMATCH");
  }
  const expected = [...input.owners]
    .sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0)
    .flatMap((owner) => [...owner.locations]
      .sort((left, right) => left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0)
      .map((location) => ({ ownerId: owner.ownerId, location })));
  if (expected.length !== journal.units.length) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_UNIT_MISMATCH");
  }
  for (const [index, unit] of journal.units.entries()) {
    const expectedUnit = expected[index];
    const expectedWorkspaceName = workspaceName(journal.transactionId, index);
    const expectedMissingParents = path.relative(unit.anchorPath, unit.parentPath)
      .split(path.sep)
      .filter(Boolean)
      .map((_, segmentIndex, segments) => path.join(unit.anchorPath, ...segments.slice(0, segmentIndex + 1)));
    if (
      unit.index !== index
      || unit.ownerId !== expectedUnit.ownerId
      || unit.logicalPath !== expectedUnit.location.logicalPath
      || unit.kind !== expectedUnit.location.kind
      || unit.targetPath !== path.resolve(expectedUnit.location.targetPath)
      || unit.parentPath !== path.dirname(unit.targetPath)
      || unit.workspaceName !== expectedWorkspaceName
      || !pathIsInside(input.fixtureRoot, unit.targetPath)
      || !pathIsInside(input.fixtureRoot, unit.anchorPath)
      || !pathIsInside(unit.anchorPath, unit.parentPath)
      || JSON.stringify(unit.missingParents) !== JSON.stringify(expectedMissingParents)
      || unit.createdParents.some((createdParent) => !unit.missingParents.includes(createdParent))
    ) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_UNIT_MISMATCH", String(index));
    }
  }
}

async function createWorkspace(
  unit: JournalUnit,
  transactionId: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<string> {
  const workspacePath = path.join(unit.anchorPath, unit.workspaceName);
  await callFault(hooks, operationFor("stage", "create-workspace", "before", transactionId, unit));
  await fs.mkdir(workspacePath, { mode: 0o700 });
  await syncDirectory(unit.anchorPath);
  await callFault(hooks, operationFor("stage", "create-workspace", "after", transactionId, unit));
  const stats = await fs.lstat(workspacePath, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_WORKSPACE_UNSAFE", workspacePath);
  }
  unit.workspaceIdentity = directoryIdentity(stats);
  await assertSameDevice([unit.anchorPath, workspacePath], hooks);
  if (unit.original.exists) await assertSameDevice([unit.targetPath, workspacePath], hooks);
  return workspacePath;
}

async function writeStageFile(filePath: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = await fs.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectoryTree(rootPath: string): Promise<void> {
  const directories: string[] = [];
  async function visit(directoryPath: string): Promise<void> {
    directories.push(directoryPath);
    for (const name of await fs.readdir(directoryPath)) {
      const entryPath = path.join(directoryPath, name);
      const stats = await fs.lstat(entryPath);
      if (stats.isSymbolicLink()) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_STAGE_UNSAFE", entryPath);
      }
      if (stats.isDirectory()) await visit(entryPath);
      else if (!stats.isFile()) throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_STAGE_UNSAFE", entryPath);
    }
  }
  await visit(rootPath);
  for (const directoryPath of directories.reverse()) await syncDirectory(directoryPath);
}

async function materializeStage(
  unit: MaterializedUnit,
  transactionId: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<void> {
  const workspacePath = path.join(unit.journal.anchorPath, unit.journal.workspaceName);
  const stagePath = path.join(workspacePath, "stage");
  await callFault(hooks, operationFor("stage", "write-stage", "before", transactionId, unit.journal));
  if (unit.journal.desired.exists) {
    if (unit.journal.kind === "directory") {
      await fs.mkdir(stagePath, { mode: 0o700 });
      for (const file of unit.files) {
        await writeStageFile(path.join(stagePath, ...file.relativePath.split("/")), file.bytes);
      }
      await syncDirectoryTree(stagePath);
    } else {
      await writeStageFile(stagePath, unit.files[0].bytes);
    }
  }
  await syncDirectory(workspacePath);
  await callFault(hooks, operationFor("stage", "write-stage", "after", transactionId, unit.journal));
  await callFault(hooks, operationFor("stage", "verify-stage", "before", transactionId, unit.journal));
  const staged = await snapshotEntity(stagePath, unit.journal.kind);
  if (!snapshotsEqual(staged, unit.journal.desired)) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_STAGE_CHECKSUM_MISMATCH", unit.journal.logicalPath);
  }
  await callFault(hooks, operationFor("stage", "verify-stage", "after", transactionId, unit.journal));
  unit.journal.state = "staged";
}

async function assertDirectoryIdentity(directoryPath: string, expectedIdentity: string): Promise<void> {
  const stats = await fs.lstat(directoryPath, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory() || directoryIdentity(stats) !== expectedIdentity) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PARENT_CHANGED", directoryPath);
  }
  const real = await fs.realpath(directoryPath);
  if (real !== directoryPath) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PARENT_CHANGED", directoryPath);
  }
}

async function createMissingParents(
  journal: RestoreJournal,
  journalPath: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<RestoreJournal> {
  let current = journal;
  const createdParents = new Set(current.units.flatMap((unit) => unit.createdParents));
  for (let index = 0; index < current.units.length; index += 1) {
    let unit = current.units[index];
    if (!unit.original.exists && !unit.desired.exists) continue;
    await assertDirectoryIdentity(unit.anchorPath, unit.anchorIdentity);
    for (const missingParent of unit.missingParents) {
      if (createdParents.has(missingParent)) continue;
      await callFault(hooks, operationFor("commit", "create-target-parent", "before", current.transactionId, unit));
      try {
        await fs.mkdir(missingParent, { mode: 0o700 });
        await syncDirectory(path.dirname(missingParent));
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_CHANGED", missingParent);
        }
        throw error;
      }
      createdParents.add(missingParent);
      unit.createdParents.push(missingParent);
      current = await persistJournal(journalPath, current, hooks);
      unit = current.units[index];
      const stats = await fs.lstat(missingParent, { bigint: true });
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_PARENT_UNSAFE", missingParent);
      }
      await callFault(hooks, operationFor("commit", "create-target-parent", "after", current.transactionId, unit));
    }
    const parentStats = await fs.lstat(unit.parentPath, { bigint: true });
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_PARENT_UNSAFE", unit.parentPath);
    }
    unit.parentIdentity = directoryIdentity(parentStats);
    await assertTrustedPosixDirectoryChain(unit.parentPath);
    await assertSameDevice([unit.parentPath, path.join(unit.anchorPath, unit.workspaceName)], hooks);
    current = await persistJournal(journalPath, current, hooks);
  }
  return current;
}

async function renameSameDevice(fromPath: string, toPath: string): Promise<void> {
  try {
    await fs.rename(fromPath, toPath);
    await syncRenameParents(fromPath, toPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EXDEV") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_CROSS_DEVICE_STAGE");
    }
    throw error;
  }
}

async function regularFilesShareIdentity(leftPath: string, rightPath: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([
      fs.lstat(leftPath, { bigint: true }),
      fs.lstat(rightPath, { bigint: true }),
    ]);
    return !left.isSymbolicLink()
      && !right.isSymbolicLink()
      && left.isFile()
      && right.isFile()
      && left.dev === right.dev
      && left.ino === right.ino;
  } catch {
    return false;
  }
}

async function publishStageNoClobber(unit: JournalUnit, stagePath: string): Promise<void> {
  if (unit.kind === "directory") {
    await renameSameDevice(stagePath, unit.targetPath);
    return;
  }
  try {
    await fs.link(stagePath, unit.targetPath);
    await syncDirectory(unit.parentPath);
    if (!await regularFilesShareIdentity(stagePath, unit.targetPath)) {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PUBLISHED_FILE_CHANGED", unit.logicalPath);
    }
    await fs.unlink(stagePath);
    await syncDirectory(path.dirname(stagePath));
    await syncDirectory(unit.parentPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_CHANGED", unit.logicalPath);
    }
    if (code === "EXDEV") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_CROSS_DEVICE_STAGE");
    }
    throw error;
  }
}

async function verifyCurrent(unit: JournalUnit, expected: EntitySnapshot, code: string): Promise<void> {
  const current = await snapshotEntity(unit.targetPath, unit.kind);
  if (!snapshotsEqual(current, expected)) {
    throw new PlanningOwnerRestoreTransactionError(code, `${unit.ownerId}:${unit.logicalPath}`);
  }
}

async function removeTargetEntity(targetPath: string): Promise<void> {
  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ENTITY_UNSAFE", targetPath);
  }
  await fs.rm(targetPath, { recursive: stats.isDirectory(), force: false });
  await syncDirectory(path.dirname(targetPath));
}

async function removeWorkspace(
  unit: JournalUnit,
  phase: "cleanup" | "rollback" | "recovery",
  transactionId: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<void> {
  const workspacePath = path.join(unit.anchorPath, unit.workspaceName);
  if (unit.workspaceIdentity === null) return;
  let stats: BigIntStats;
  try {
    stats = await fs.lstat(workspacePath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || directoryIdentity(stats) !== unit.workspaceIdentity
  ) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_WORKSPACE_CHANGED", workspacePath);
  }
  await callFault(hooks, operationFor(phase, "remove-workspace", "before", transactionId, unit));
  await fs.rm(workspacePath, { recursive: true, force: false });
  await syncDirectory(unit.anchorPath);
  await callFault(hooks, operationFor(phase, "remove-workspace", "after", transactionId, unit));
}

async function removeCreatedParents(units: readonly JournalUnit[]): Promise<void> {
  const paths = [...new Set(units.flatMap((unit) => unit.createdParents))]
    .sort((left, right) => right.length - left.length);
  for (const parentPath of paths) {
    try {
      await fs.rmdir(parentPath);
      await syncDirectory(path.dirname(parentPath));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
    }
  }
}

async function removeControlFiles(
  journal: RestoreJournal,
  journalPath: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<void> {
  await releaseLockIfOwned({
    transactionRoot: journal.transactionRoot,
    transactionId: journal.transactionId,
    lockToken: journal.lockToken,
    allowMissing: journal.phase === "committed" || journal.phase === "rolled-back",
  });
  await callFault(hooks, operationFor("cleanup", "remove-journal", "before", journal.transactionId));
  await fs.rm(journalPath, { force: true });
  await syncDirectory(journal.transactionRoot);
}

async function cleanupFinalized(
  journal: RestoreJournal,
  journalPath: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
  phase: "cleanup" | "rollback" | "recovery",
): Promise<void> {
  for (const unit of journal.units) {
    await removeWorkspace(unit, phase, journal.transactionId, hooks);
  }
  if (journal.phase !== "committed") await removeCreatedParents(journal.units);
  await removeControlFiles(journal, journalPath, hooks);
}

async function cleanupTerminalJournalWithoutLock(
  journal: RestoreJournal,
  journalPath: string,
  hooks: PlanningOwnerRestoreTransactionHooks,
): Promise<void> {
  for (const unit of journal.units) {
    if (await pathExists(path.join(unit.anchorPath, unit.workspaceName))) {
      throw new PlanningOwnerRestoreTransactionError(
        "OWNER_RESTORE_TERMINAL_EVIDENCE_WITHOUT_LOCK",
        `${unit.ownerId}:${unit.logicalPath}`,
      );
    }
  }
  await callFault(hooks, operationFor("cleanup", "remove-journal", "before", journal.transactionId));
  await fs.rm(journalPath, { force: true });
  await syncDirectory(journal.transactionRoot);
}

async function rollbackInternal(input: {
  journal: RestoreJournal;
  journalPath: string;
  hooks: PlanningOwnerRestoreTransactionHooks;
  phase: "rollback" | "recovery";
  primaryError?: unknown;
}): Promise<void> {
  let journal = input.journal;
  journal.phase = "rolling-back";
  journal.primaryErrorCode = input.primaryError ? errorCode(input.primaryError) : journal.primaryErrorCode;
  try {
    journal = await persistJournal(input.journalPath, journal, input.hooks);
    for (let index = journal.units.length - 1; index >= 0; index -= 1) {
      const unit = journal.units[index];
      if (unit.state === "planned" || unit.state === "staged" || unit.state === "rolled-back") {
        await verifyCurrent(unit, unit.original, "OWNER_RESTORE_TARGET_CHANGED");
        unit.state = "rolled-back";
        journal = await persistJournal(input.journalPath, journal, input.hooks);
        continue;
      }
      if (unit.state === "rollback-intent") {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ROLLBACK_STATE_AMBIGUOUS", unit.logicalPath);
      }
      if (unit.parentIdentity !== null && await pathExists(unit.parentPath)) {
        await assertDirectoryIdentity(unit.parentPath, unit.parentIdentity);
      }
      const workspacePath = path.join(unit.anchorPath, unit.workspaceName);
      const backupPath = path.join(workspacePath, "backup");
      const stagePath = path.join(workspacePath, "stage");

      if (unit.workspaceIdentity === null) {
        await verifyCurrent(unit, unit.original, "OWNER_RESTORE_TARGET_CHANGED");
        unit.state = "rolled-back";
        journal = await persistJournal(input.journalPath, journal, input.hooks);
        continue;
      }

      let workspaceStats: BigIntStats;
      try {
        workspaceStats = await fs.lstat(workspacePath, { bigint: true });
      } catch (error) {
        if (!isMissing(error)) throw error;
        await verifyCurrent(unit, unit.original, "OWNER_RESTORE_ROLLBACK_EVIDENCE_MISSING");
        unit.state = "rolled-back";
        journal = await persistJournal(input.journalPath, journal, input.hooks);
        continue;
      }
      if (
        workspaceStats.isSymbolicLink()
        || !workspaceStats.isDirectory()
        || directoryIdentity(workspaceStats) !== unit.workspaceIdentity
      ) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_WORKSPACE_CHANGED", workspacePath);
      }

      const backupExists = await pathExists(backupPath);
      if (backupExists) {
        const backup = await snapshotEntity(backupPath, unit.kind);
        if (!snapshotsEqual(backup, unit.original)) {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_BACKUP_CHECKSUM_MISMATCH", unit.logicalPath);
        }
        if (await pathExists(unit.targetPath)) {
          const current = await snapshotEntity(unit.targetPath, unit.kind);
          if (!snapshotsEqual(current, unit.desired)) {
            throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_CHANGED", unit.logicalPath);
          }
          await callFault(input.hooks, operationFor(input.phase, "remove-target", "before", journal.transactionId, unit));
          await removeTargetEntity(unit.targetPath);
          await callFault(input.hooks, operationFor(input.phase, "remove-target", "after", journal.transactionId, unit));
        }
        await callFault(input.hooks, operationFor(input.phase, "rename-backup-to-target", "before", journal.transactionId, unit));
        await renameSameDevice(backupPath, unit.targetPath);
        await callFault(input.hooks, operationFor(input.phase, "rename-backup-to-target", "after", journal.transactionId, unit));
      } else {
        const current = await snapshotEntity(unit.targetPath, unit.kind);
        if (!snapshotsEqual(current, unit.original)) {
          const stageStillExists = await pathExists(stagePath);
          const linkedStageIsPublishedTarget = unit.kind === "file"
            && stageStillExists
            && await regularFilesShareIdentity(stagePath, unit.targetPath);
          if (
            unit.original.exists
            || !unit.desired.exists
            || (stageStillExists && !linkedStageIsPublishedTarget)
            || !snapshotsEqual(current, unit.desired)
          ) {
            throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_ROLLBACK_EVIDENCE_MISSING", unit.logicalPath);
          }
          await callFault(input.hooks, operationFor(input.phase, "remove-target", "before", journal.transactionId, unit));
          await removeTargetEntity(unit.targetPath);
          await callFault(input.hooks, operationFor(input.phase, "remove-target", "after", journal.transactionId, unit));
        }
      }
      await verifyCurrent(unit, unit.original, "OWNER_RESTORE_ROLLBACK_CHECKSUM_MISMATCH");
      unit.state = "rolled-back";
      journal = await persistJournal(input.journalPath, journal, input.hooks);
    }
    journal.phase = "rolled-back";
    journal = await persistJournal(input.journalPath, journal, input.hooks);
    await cleanupFinalized(journal, input.journalPath, input.hooks, input.phase);
  } catch (rollbackError) {
    if (journal.phase === "rolled-back") {
      throw new PlanningOwnerRestoreTransactionError(
        "OWNER_RESTORE_ROLLED_BACK_CLEANUP_FAILED",
        errorCode(rollbackError),
        rollbackError,
      );
    }
    journal.phase = "rollback-incomplete";
    journal.primaryErrorCode = input.primaryError ? errorCode(input.primaryError) : errorCode(rollbackError);
    await persistJournal(input.journalPath, journal, input.hooks).catch(() => undefined);
    throw new PlanningOwnerRestoreTransactionError(
      "OWNER_RESTORE_ROLLBACK_INCOMPLETE",
      errorCode(rollbackError),
      input.primaryError ?? rollbackError,
    );
  }
}

async function prepareFixtureEnvironment(input: {
  fixtureRoot: string;
  transactionRoot: string;
  owners: readonly ResolvedPlanningDataOwner[];
  platform: NodeJS.Platform;
}): Promise<{ fixtureRoot: string; transactionRoot: string }> {
  assertFixturePlatform(input.platform);
  const fixtureRoot = await resolveFixtureRoot(input.fixtureRoot);
  for (const owner of input.owners) {
    for (const location of owner.locations) {
      if (!pathIsInside(fixtureRoot, location.targetPath) || path.resolve(location.targetPath) === fixtureRoot) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TARGET_OUTSIDE_FIXTURE", location.targetPath);
      }
    }
  }
  const transactionRoot = path.resolve(input.transactionRoot);
  if (path.dirname(transactionRoot) !== fixtureRoot) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TRANSACTION_ROOT_INVALID");
  }
  await assertPlanningOwnerAuxiliaryPathOutsideOwners({
    owners: input.owners,
    candidatePath: transactionRoot,
    platform: input.platform,
    purpose: "archive",
  });
  return { fixtureRoot, transactionRoot };
}

export async function preparePlanningOwnerRestoreFixtureTransaction(input: {
  encryptedBytes: Uint8Array;
  secret: Uint8Array;
  owners: readonly ResolvedPlanningDataOwner[];
  fixtureRoot: string;
  transactionRoot: string;
  platform: NodeJS.Platform;
  transactionId?: string;
  hooks?: PlanningOwnerRestoreTransactionHooks;
}): Promise<PreparedPlanningOwnerRestoreTransaction> {
  const hooks = input.hooks ?? {};
  const transactionId = input.transactionId ?? crypto.randomUUID();
  if (!UUID_RE.test(transactionId)) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TRANSACTION_ID_INVALID");
  }

  return withValidatedPlanningOwnerArchivePayload({
    encryptedBytes: input.encryptedBytes,
    secret: input.secret,
    owners: input.owners,
  }, async ({ manifest, payloadEntries }) => {
    const environment = await prepareFixtureEnvironment(input);
    const mapped = mapManifestToMaterializedUnits({
      owners: input.owners,
      manifestOwners: manifest.owners,
      payloadEntries,
    });
    const units: MaterializedUnit[] = [];
    for (const [index, item] of mapped.entries()) {
      const inspected = await inspectTargetParent({
        fixtureRoot: environment.fixtureRoot,
        targetPath: item.location.targetPath,
      });
      const original = await snapshotEntity(item.location.targetPath, item.location.kind);
      units.push(Object.freeze({
        journal: {
          index,
          ownerId: item.owner.ownerId,
          logicalPath: item.location.logicalPath,
          kind: item.location.kind,
          targetPath: path.resolve(item.location.targetPath),
          parentPath: inspected.parentPath,
          anchorPath: inspected.anchorPath,
          anchorIdentity: inspected.anchorIdentity,
          parentIdentity: inspected.parentIdentity,
          workspaceName: workspaceName(transactionId, index),
          workspaceIdentity: null,
          missingParents: inspected.missingParents,
          createdParents: [],
          original,
          desired: item.desired,
          state: "planned",
        },
        files: item.files,
      }));
    }

    const lockToken = crypto.randomUUID();
    const journalPath = journalPathFor(environment.transactionRoot, transactionId);
    const timestamp = nowIso(hooks);
    const resolvedRegistryDigest = registryDigest(input.owners, input.platform);
    const journalUnits = units.map((unit) => unit.journal);
    const planDigest = restorePlanDigest({
      transactionId,
      archiveId: manifest.archiveId,
      fixtureRoot: environment.fixtureRoot,
      transactionRoot: environment.transactionRoot,
      platform: input.platform,
      registryDigest: resolvedRegistryDigest,
      units: journalUnits,
    });
    let journal = sealJournal({
      kind: JOURNAL_KIND,
      version: JOURNAL_VERSION,
      transactionId,
      archiveId: manifest.archiveId,
      createdAt: timestamp,
      updatedAt: timestamp,
      fixtureRoot: environment.fixtureRoot,
      transactionRoot: environment.transactionRoot,
      platform: input.platform,
      registryDigest: resolvedRegistryDigest,
      planDigest,
      lockToken,
      phase: "preparing",
      primaryErrorCode: null,
      units: journalUnits,
    });
    await fs.mkdir(environment.transactionRoot, { recursive: true, mode: 0o700 });
    await assertTrustedPosixDirectoryChain(environment.transactionRoot);
    await acquireLock({
      transactionRoot: environment.transactionRoot,
      transactionId,
      lockToken,
      planDigest,
    });
    try {
      journal = await persistJournal(journalPath, journal, hooks);
    } catch (error) {
      if (!await pathExists(journalPath)) {
        await releaseLockIfOwned({
          transactionRoot: environment.transactionRoot,
          transactionId,
          lockToken,
        }).catch(() => undefined);
      }
      throw error;
    }

    try {
      for (let index = 0; index < units.length; index += 1) {
        let journalUnit = journal.units[index];
        const workspacePath = await createWorkspace(journalUnit, transactionId, hooks);
        await assertPlanningOwnerAuxiliaryPathOutsideOwners({
          owners: input.owners,
          candidatePath: workspacePath,
          platform: input.platform,
          purpose: "archive",
        });
        journal = await persistJournal(journalPath, journal, hooks);
        journalUnit = journal.units[index];
        await materializeStage({ journal: journalUnit, files: units[index].files }, transactionId, hooks);
        journal = await persistJournal(journalPath, journal, hooks);
      }
      journal.phase = "prepared";
      journal = await persistJournal(journalPath, journal, hooks);
      return Object.freeze({
        transactionId,
        archiveId: manifest.archiveId,
        journalPath,
        units: journal.units.length,
      });
    } catch (error) {
      if (error instanceof PlanningOwnerRestoreSimulatedCrashError) throw error;
      await rollbackInternal({ journal, journalPath, hooks, phase: "rollback", primaryError: error });
      throw error;
    }
  });
}

async function loadValidatedJournal(input: {
  journalPath: string;
  fixtureRoot: string;
  transactionRoot: string;
  owners: readonly ResolvedPlanningDataOwner[];
  platform: NodeJS.Platform;
}): Promise<{ journal: RestoreJournal | null; fixtureRoot: string; transactionRoot: string }> {
  const environment = await prepareFixtureEnvironment(input);
  const journalPath = path.resolve(input.journalPath);
  if (path.dirname(journalPath) !== environment.transactionRoot) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_JOURNAL_CONTEXT_MISMATCH");
  }
  const journal = await readJournal(journalPath);
  if (!journal) return { journal: null, ...environment };
  assertJournalMatchesInput({
    journal,
    journalPath,
    fixtureRoot: environment.fixtureRoot,
    transactionRoot: environment.transactionRoot,
    owners: input.owners,
    platform: input.platform,
  });
  return { journal, ...environment };
}

export async function commitPlanningOwnerRestoreFixtureTransaction(input: {
  prepared: PreparedPlanningOwnerRestoreTransaction;
  owners: readonly ResolvedPlanningDataOwner[];
  fixtureRoot: string;
  transactionRoot: string;
  platform: NodeJS.Platform;
  hooks?: PlanningOwnerRestoreTransactionHooks;
}): Promise<void> {
  const hooks = input.hooks ?? {};
  const releaseOperationGuard = acquireOperationGuard(input.prepared.journalPath);
  try {
  const loaded = await loadValidatedJournal({
    journalPath: input.prepared.journalPath,
    fixtureRoot: input.fixtureRoot,
    transactionRoot: input.transactionRoot,
    owners: input.owners,
    platform: input.platform,
  });
  let journal = loaded.journal;
  if (!journal || journal.transactionId !== input.prepared.transactionId || journal.archiveId !== input.prepared.archiveId) {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PREPARED_TRANSACTION_MISSING");
  }
  if (journal.phase !== "prepared") {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_TRANSACTION_NOT_PREPARED", journal.phase);
  }
  await assertLock(journal, false);

  try {
    for (const unit of journal.units) {
      await verifyCurrent(unit, unit.original, "OWNER_RESTORE_TARGET_CHANGED");
      const staged = await snapshotEntity(path.join(unit.anchorPath, unit.workspaceName, "stage"), unit.kind);
      if (!snapshotsEqual(staged, unit.desired)) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_STAGE_CHECKSUM_MISMATCH", unit.logicalPath);
      }
    }
    journal = await createMissingParents(journal, input.prepared.journalPath, hooks);
    journal.phase = "committing";
    journal = await persistJournal(input.prepared.journalPath, journal, hooks);

    for (let index = 0; index < journal.units.length; index += 1) {
      let unit = journal.units[index];
      if (!unit.original.exists && !unit.desired.exists) {
        unit.state = "activated";
        journal = await persistJournal(input.prepared.journalPath, journal, hooks);
        unit = journal.units[index];
        await verifyCurrent(unit, unit.desired, "OWNER_RESTORE_COMMIT_CHECKSUM_MISMATCH");
        continue;
      }
      if (unit.parentIdentity === null) {
        throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_PARENT_CHANGED", unit.parentPath);
      }
      await assertDirectoryIdentity(unit.parentPath, unit.parentIdentity);
      await verifyCurrent(unit, unit.original, "OWNER_RESTORE_TARGET_CHANGED");
      const workspacePath = path.join(unit.anchorPath, unit.workspaceName);
      const backupPath = path.join(workspacePath, "backup");
      const stagePath = path.join(workspacePath, "stage");

      if (unit.original.exists) {
        unit.state = "backup-intent";
        journal = await persistJournal(input.prepared.journalPath, journal, hooks);
        unit = journal.units[index];
        await callFault(hooks, operationFor("commit", "rename-target-to-backup", "before", journal.transactionId, unit));
        await renameSameDevice(unit.targetPath, backupPath);
        await callFault(hooks, operationFor("commit", "rename-target-to-backup", "after", journal.transactionId, unit));
        const backup = await snapshotEntity(backupPath, unit.kind);
        if (!snapshotsEqual(backup, unit.original)) {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_BACKUP_CHECKSUM_MISMATCH", unit.logicalPath);
        }
        unit.state = "backed-up";
        journal = await persistJournal(input.prepared.journalPath, journal, hooks);
        unit = journal.units[index];
      }

      unit.state = "activate-intent";
      journal = await persistJournal(input.prepared.journalPath, journal, hooks);
      unit = journal.units[index];
      if (unit.desired.exists) {
        await callFault(hooks, operationFor("commit", "rename-stage-to-target", "before", journal.transactionId, unit));
        await publishStageNoClobber(unit, stagePath);
        await callFault(hooks, operationFor("commit", "rename-stage-to-target", "after", journal.transactionId, unit));
      }
      unit.state = "activated";
      journal = await persistJournal(input.prepared.journalPath, journal, hooks);
      unit = journal.units[index];
      await callFault(hooks, operationFor("commit", "verify-target", "before", journal.transactionId, unit));
      await verifyCurrent(unit, unit.desired, "OWNER_RESTORE_COMMIT_CHECKSUM_MISMATCH");
      await callFault(hooks, operationFor("commit", "verify-target", "after", journal.transactionId, unit));
    }

    journal.phase = "verifying";
    journal = await persistJournal(input.prepared.journalPath, journal, hooks);
    for (const unit of journal.units) {
      await verifyCurrent(unit, unit.desired, "OWNER_RESTORE_COMMIT_CHECKSUM_MISMATCH");
      if (unit.original.exists) {
        const backup = await snapshotEntity(path.join(unit.anchorPath, unit.workspaceName, "backup"), unit.kind);
        if (!snapshotsEqual(backup, unit.original)) {
          throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_BACKUP_CHECKSUM_MISMATCH", unit.logicalPath);
        }
      }
    }
    journal.phase = "committed";
    journal = await persistJournal(input.prepared.journalPath, journal, hooks);
    await cleanupFinalized(journal, input.prepared.journalPath, hooks, "cleanup");
  } catch (error) {
    if (error instanceof PlanningOwnerRestoreSimulatedCrashError) throw error;
    if (journal.phase === "committed") {
      throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_COMMITTED_CLEANUP_FAILED", errorCode(error), error);
    }
    await rollbackInternal({
      journal,
      journalPath: input.prepared.journalPath,
      hooks,
      phase: "rollback",
      primaryError: error,
    });
    throw error;
  }
  } finally {
    releaseOperationGuard();
  }
}

export async function rollbackPlanningOwnerRestoreFixtureTransaction(input: {
  journalPath: string;
  owners: readonly ResolvedPlanningDataOwner[];
  fixtureRoot: string;
  transactionRoot: string;
  platform: NodeJS.Platform;
  hooks?: PlanningOwnerRestoreTransactionHooks;
}): Promise<void> {
  const hooks = input.hooks ?? {};
  const releaseOperationGuard = acquireOperationGuard(input.journalPath);
  try {
  const loaded = await loadValidatedJournal(input);
  if (!loaded.journal) return;
  if (loaded.journal.phase === "committed") {
    throw new PlanningOwnerRestoreTransactionError("OWNER_RESTORE_COMMITTED_ROLLBACK_FORBIDDEN");
  }
  await assertLock(loaded.journal, false);
  await rollbackInternal({
    journal: loaded.journal,
    journalPath: path.resolve(input.journalPath),
    hooks,
    phase: "rollback",
  });
  } finally {
    releaseOperationGuard();
  }
}

export async function recoverPendingPlanningOwnerRestoreFixtureTransaction(input: {
  journalPath: string;
  owners: readonly ResolvedPlanningDataOwner[];
  fixtureRoot: string;
  transactionRoot: string;
  platform: NodeJS.Platform;
  hooks?: PlanningOwnerRestoreTransactionHooks;
}): Promise<PlanningOwnerRestoreRecoveryResult> {
  const hooks = input.hooks ?? {};
  const releaseOperationGuard = acquireOperationGuard(input.journalPath);
  try {
  const loaded = await loadValidatedJournal(input);
  const journal = loaded.journal;
  if (!journal) {
    await assertNoLockWithMissingJournal(loaded.transactionRoot);
    return Object.freeze({ status: "none" });
  }
  const lockState = await assertLock(journal, journal.phase === "committed" || journal.phase === "rolled-back");
  if (journal.phase === "committed") {
    for (const unit of journal.units) {
      await verifyCurrent(unit, unit.desired, "OWNER_RESTORE_COMMITTED_STATE_MISMATCH");
    }
    if (lockState === "missing") {
      await cleanupTerminalJournalWithoutLock(journal, path.resolve(input.journalPath), hooks);
    } else {
      await cleanupFinalized(journal, path.resolve(input.journalPath), hooks, "recovery");
    }
    return Object.freeze({ status: "committed-cleaned", transactionId: journal.transactionId });
  }
  if (journal.phase === "rolled-back") {
    for (const unit of journal.units) {
      await verifyCurrent(unit, unit.original, "OWNER_RESTORE_ROLLBACK_CHECKSUM_MISMATCH");
    }
    if (lockState === "missing") {
      await cleanupTerminalJournalWithoutLock(journal, path.resolve(input.journalPath), hooks);
    } else {
      await cleanupFinalized(journal, path.resolve(input.journalPath), hooks, "recovery");
    }
    return Object.freeze({ status: "rolled-back", transactionId: journal.transactionId });
  }
  await rollbackInternal({
    journal,
    journalPath: path.resolve(input.journalPath),
    hooks,
    phase: "recovery",
  });
  return Object.freeze({ status: "rolled-back", transactionId: journal.transactionId });
  } finally {
    releaseOperationGuard();
  }
}
