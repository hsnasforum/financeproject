import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../../planning/storage/atomicWrite";
import { collectPlanningOwnerFiles } from "./planningOwnerCollector";
import { validatePlanningOwnerPayloadFile } from "./planningOwnerDoctor";
import {
  PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE,
  buildPlanningOwnerManifest,
  parsePlanningOwnerManifest,
  planningOwnerPayloadPath,
  serializePlanningOwnerManifest,
  sha256PlanningOwnerBytes,
  type PlanningOwnerManifest,
} from "./planningOwnerManifest";
import {
  PLANNING_CURRENT_USER_V3_OWNER_IDS,
  createPlanningArchiveContext,
  resolvePlanningCurrentUserV3Owners,
  type PlanningArchiveContext,
  type PlanningCurrentUserV3OwnerId,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";

export const PLANNING_USER_V3_SNAPSHOT_DIR = "planning-v3";
export const PLANNING_USER_V3_MANIFEST_PATH = `${PLANNING_USER_V3_SNAPSHOT_DIR}/manifest.json`;
const PLANNING_USER_V3_PAYLOAD_PREFIX = `${PLANNING_USER_V3_SNAPSHOT_DIR}/payload/`;

export type PlanningUserV3SnapshotLimits = Readonly<{
  maxEntries: number;
  maxBytes: number;
}>;

export type PlanningUserV3SnapshotFile = Readonly<{
  ownerId: PlanningCurrentUserV3OwnerId;
  logicalPath: string;
  archivePath: string;
  targetPath: string;
  bytes: Buffer;
}>;

export type PlanningUserV3Snapshot = Readonly<{
  context: PlanningArchiveContext;
  owners: readonly ResolvedPlanningDataOwner[];
  manifest: PlanningOwnerManifest;
  files: readonly PlanningUserV3SnapshotFile[];
  totals: Readonly<{
    owners: number;
    files: number;
    bytes: number;
  }>;
}>;

export type PlanningUserV3SnapshotBuildResult = Readonly<{
  entries: ReadonlyMap<string, Buffer>;
  snapshot: PlanningUserV3Snapshot;
}>;

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `MANIFEST_V3_${code}:${detail}` : `MANIFEST_V3_${code}`);
}

function createContext(input: {
  userId: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): PlanningArchiveContext {
  const context = createPlanningArchiveContext({
    cwd: input.cwd,
    env: input.env,
    userId: input.userId,
  });
  if (!context.namespaceEnabled || !context.userId || context.userId !== input.userId) {
    fail("USER_NAMESPACE_REQUIRED");
  }
  return context;
}

function asCurrentUserV3OwnerId(ownerId: string): PlanningCurrentUserV3OwnerId {
  if (!PLANNING_CURRENT_USER_V3_OWNER_IDS.includes(ownerId as PlanningCurrentUserV3OwnerId)) {
    fail("OWNER_UNKNOWN", ownerId);
  }
  return ownerId as PlanningCurrentUserV3OwnerId;
}

function resolveOwnerFileTarget(
  context: PlanningArchiveContext,
  owner: ResolvedPlanningDataOwner,
  logicalPath: string,
): string {
  const matches = owner.locations.filter((location) => (
    location.kind === "file"
      ? logicalPath === location.logicalPath
      : logicalPath.startsWith(`${location.logicalPath}/`)
  ));
  if (matches.length !== 1) {
    fail("FILE_LOCATION_MISMATCH", `${owner.ownerId}:${logicalPath}`);
  }
  const location = matches[0];
  const targetPath = location.kind === "file"
    ? location.targetPath
    : path.join(location.targetPath, logicalPath.slice(location.logicalPath.length + 1));
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(context.userDataDir, resolvedTarget);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("TARGET_OUTSIDE_USER_NAMESPACE", `${owner.ownerId}:${logicalPath}`);
  }
  return resolvedTarget;
}

function createSnapshot(
  context: PlanningArchiveContext,
  owners: readonly ResolvedPlanningDataOwner[],
  manifest: PlanningOwnerManifest,
  entries: ReadonlyMap<string, Buffer>,
): PlanningUserV3Snapshot {
  if (manifest.archiveScope !== PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE) {
    fail("SCOPE_INVALID");
  }
  const ownerById = new Map(owners.map((owner) => [owner.ownerId, owner]));
  const files: PlanningUserV3SnapshotFile[] = [];
  const expectedArchivePaths = new Set<string>();

  for (const manifestOwner of manifest.owners) {
    const owner = ownerById.get(manifestOwner.ownerId);
    if (!owner) fail("OWNER_UNKNOWN", manifestOwner.ownerId);
    const ownerId = asCurrentUserV3OwnerId(manifestOwner.ownerId);
    for (const file of manifestOwner.files) {
      const archivePath = `${PLANNING_USER_V3_SNAPSHOT_DIR}/${planningOwnerPayloadPath(ownerId, file.path)}`;
      expectedArchivePaths.add(archivePath);
      const bytes = entries.get(archivePath);
      if (!bytes) fail("ENTRY_MISSING", archivePath);
      if (bytes.length !== file.sizeBytes) fail("ENTRY_SIZE_MISMATCH", archivePath);
      if (sha256PlanningOwnerBytes(bytes) !== file.sha256) fail("ENTRY_CHECKSUM_MISMATCH", archivePath);
      try {
        validatePlanningOwnerPayloadFile({ ownerId, logicalPath: file.path, bytes });
      } catch {
        fail("ENTRY_SCHEMA_INVALID", archivePath);
      }
      files.push(Object.freeze({
        ownerId,
        logicalPath: file.path,
        archivePath,
        targetPath: resolveOwnerFileTarget(context, owner, file.path),
        bytes,
      }));
    }
  }

  const actualArchivePaths = [...entries.keys()].filter((entryPath) => (
    entryPath.startsWith(PLANNING_USER_V3_PAYLOAD_PREFIX)
  ));
  for (const archivePath of actualArchivePaths) {
    if (!expectedArchivePaths.has(archivePath)) fail("ENTRY_UNEXPECTED", archivePath);
  }
  if (actualArchivePaths.length !== expectedArchivePaths.size) fail("ENTRY_SET_MISMATCH");

  const totalBytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
  return Object.freeze({
    context,
    owners,
    manifest,
    files: Object.freeze(files.sort((left, right) => left.archivePath.localeCompare(right.archivePath))),
    totals: Object.freeze({
      owners: owners.length,
      files: files.length,
      bytes: totalBytes,
    }),
  });
}

export async function buildPlanningUserV3Snapshot(input: {
  userId: string;
  generatedAt: string;
  appVersion: string;
  limits: PlanningUserV3SnapshotLimits;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<PlanningUserV3SnapshotBuildResult> {
  const context = createContext(input);
  const owners = resolvePlanningCurrentUserV3Owners(context);
  const collection = await collectPlanningOwnerFiles({
    context,
    owners,
    limits: {
      maxEntries: input.limits.maxEntries,
      maxEntryBytes: input.limits.maxBytes,
      maxTotalBytes: input.limits.maxBytes,
    },
  });
  const filesByOwner = Object.fromEntries(owners.map((owner) => [
    owner.ownerId,
    collection.filesByOwner[owner.ownerId].map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    })),
  ]));
  const manifest = buildPlanningOwnerManifest({
    archiveId: crypto.randomUUID(),
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    archiveScope: PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE,
    resolvedOwners: owners,
    filesByOwner,
  });
  const entries = new Map<string, Buffer>([
    [PLANNING_USER_V3_MANIFEST_PATH, serializePlanningOwnerManifest(manifest)],
  ]);
  for (const owner of owners) {
    const ownerId = asCurrentUserV3OwnerId(owner.ownerId);
    for (const file of collection.filesByOwner[owner.ownerId]) {
      try {
        validatePlanningOwnerPayloadFile({ ownerId, logicalPath: file.path, bytes: file.bytes });
      } catch {
        fail("SOURCE_SCHEMA_INVALID", `${ownerId}:${file.path}`);
      }
      entries.set(
        `${PLANNING_USER_V3_SNAPSHOT_DIR}/${planningOwnerPayloadPath(ownerId, file.path)}`,
        file.bytes,
      );
    }
  }
  return Object.freeze({
    entries,
    snapshot: createSnapshot(context, owners, manifest, entries),
  });
}

export function parsePlanningUserV3Snapshot(input: {
  entries: ReadonlyMap<string, Buffer>;
  userId: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): PlanningUserV3Snapshot {
  const context = createContext(input);
  const owners = resolvePlanningCurrentUserV3Owners(context);
  const manifestBytes = input.entries.get(PLANNING_USER_V3_MANIFEST_PATH);
  if (!manifestBytes) fail("MANIFEST_MISSING");
  let raw: unknown;
  try {
    raw = JSON.parse(manifestBytes.toString("utf-8")) as unknown;
  } catch {
    fail("MANIFEST_JSON_INVALID");
  }
  let manifest: PlanningOwnerManifest;
  try {
    manifest = parsePlanningOwnerManifest(raw, owners);
  } catch {
    fail("MANIFEST_INVALID");
  }
  return createSnapshot(context, owners, manifest, input.entries);
}

function uniqueResolvedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map((targetPath) => path.resolve(targetPath)))];
}

export function planningUserV3RestoreTargets(snapshot: PlanningUserV3Snapshot): string[] {
  return uniqueResolvedPaths(snapshot.owners.flatMap((owner) => owner.locations.map((location) => {
    const targetPath = path.resolve(location.targetPath);
    const relative = path.relative(snapshot.context.userDataDir, targetPath);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail("TARGET_OUTSIDE_USER_NAMESPACE", `${owner.ownerId}:${location.logicalPath}`);
    }
    return targetPath;
  })));
}

export function resolvePlanningUserV3RestoreTargets(input: {
  userId: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): string[] {
  const context = createContext(input);
  const owners = resolvePlanningCurrentUserV3Owners(context);
  return uniqueResolvedPaths(owners.flatMap((owner) => owner.locations.map((location) => location.targetPath)));
}

async function assertNoSymlinkFromUserRoot(
  context: PlanningArchiveContext,
  targetPath: string,
): Promise<void> {
  const root = path.resolve(context.userDataDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("TARGET_OUTSIDE_USER_NAMESPACE", target);
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink()) fail("TARGET_SYMLINK_FORBIDDEN", current);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function clearPlanningUserV3SnapshotTargets(
  snapshot: PlanningUserV3Snapshot,
): Promise<void> {
  const targets = planningUserV3RestoreTargets(snapshot);
  for (const targetPath of targets) {
    await assertNoSymlinkFromUserRoot(snapshot.context, targetPath);
  }
  for (const targetPath of targets) {
    await fs.rm(targetPath, { recursive: true, force: true });
  }
}

export async function restorePlanningUserV3SnapshotFiles(
  snapshot: PlanningUserV3Snapshot,
  hooks: {
    beforeWrite?: (file: PlanningUserV3SnapshotFile) => void | Promise<void>;
  } = {},
): Promise<number> {
  for (const file of snapshot.files) {
    await assertNoSymlinkFromUserRoot(snapshot.context, file.targetPath);
    await hooks.beforeWrite?.(file);
    await atomicWriteFile(file.targetPath, file.bytes);
  }
  return snapshot.files.length;
}

export function isPlanningUserV3SnapshotPath(entryPath: string): boolean {
  return entryPath === PLANNING_USER_V3_MANIFEST_PATH
    || entryPath.startsWith(PLANNING_USER_V3_PAYLOAD_PREFIX);
}
