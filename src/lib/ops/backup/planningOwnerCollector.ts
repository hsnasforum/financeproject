import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isPlanningEncryptedEnvelope } from "../../planning/crypto/encrypt";
import { isVaultEncryptedEnvelope } from "../../planning/crypto/vaultCrypto";
import {
  normalizePlanningOwnerLogicalPath,
  type PlanningArchiveContext,
  type PlanningOwnerLocation,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";
import {
  sha256PlanningOwnerBytes,
  type PlanningOwnerManifestFile,
} from "./planningOwnerManifest";

export type PlanningOwnerCollectionLimits = Readonly<{
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}>;

export type CollectedPlanningOwnerFile = PlanningOwnerManifestFile & Readonly<{
  bytes: Buffer;
}>;

export type PlanningOwnerCollection = Readonly<{
  filesByOwner: Readonly<Record<string, readonly CollectedPlanningOwnerFile[]>>;
  missingLocations: readonly Readonly<{ ownerId: string; logicalPath: string }>[];
  emptyOwnerIds: readonly string[];
  totals: Readonly<{ files: number; bytes: number }>;
}>;

export class PlanningOwnerCollectionError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PlanningOwnerCollectionError";
    this.code = code;
  }
}

type ExistingLocation = Readonly<{
  owner: ResolvedPlanningDataOwner;
  location: PlanningOwnerLocation;
  realPath: string;
}>;

type SourceFile = Readonly<{
  absolutePath: string;
  logicalPath: string;
  realPath: string;
}>;

type CollectionBudget = {
  discoveredFiles: number;
  reservedBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
};

function asSafePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PlanningOwnerCollectionError(code);
  }
  return value;
}

function normalizePhysicalPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/u, "").normalize("NFC") || "/";
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function assertDeclaredKind(
  stats: BigIntStats,
  location: PlanningOwnerLocation,
  ownerId: string,
): void {
  if (stats.isSymbolicLink()) {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_LINK_NOT_ALLOWED", `${ownerId}:${location.logicalPath}`);
  }
  const valid = location.kind === "file" ? stats.isFile() : stats.isDirectory();
  if (!valid) {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_KIND_MISMATCH", `${ownerId}:${location.logicalPath}`);
  }
}

function fingerprint(stats: BigIntStats): string {
  return [
    stats.dev,
    stats.ino,
    stats.mode,
    stats.size,
    stats.mtimeNs,
    stats.ctimeNs,
  ].join(":");
}

async function lstatExisting(filePath: string, code: string, detail: string): Promise<BigIntStats> {
  try {
    return await fs.lstat(filePath, { bigint: true });
  } catch (error) {
    throw new PlanningOwnerCollectionError(isMissing(error) ? "OWNER_SOURCE_CHANGED" : code, detail);
  }
}

async function resolveExistingLocations(
  context: PlanningArchiveContext,
  owners: readonly ResolvedPlanningDataOwner[],
): Promise<{ existing: ExistingLocation[]; missing: PlanningOwnerCollection["missingLocations"] }> {
  const existing: ExistingLocation[] = [];
  const missing: Array<{ ownerId: string; logicalPath: string }> = [];

  for (const owner of owners) {
    for (const location of owner.locations) {
      let stats: BigIntStats;
      try {
        stats = await fs.lstat(location.targetPath, { bigint: true });
      } catch (error) {
        if (isMissing(error)) {
          missing.push({ ownerId: owner.ownerId, logicalPath: location.logicalPath });
          continue;
        }
        throw new PlanningOwnerCollectionError("OWNER_SOURCE_LSTAT_FAILED", `${owner.ownerId}:${location.logicalPath}`);
      }
      assertDeclaredKind(stats, location, owner.ownerId);
      let realPath: string;
      try {
        realPath = await fs.realpath(location.targetPath);
      } catch {
        throw new PlanningOwnerCollectionError("OWNER_SOURCE_REALPATH_FAILED", `${owner.ownerId}:${location.logicalPath}`);
      }
      existing.push({ owner, location, realPath });
    }
  }

  for (let leftIndex = 0; leftIndex < existing.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < existing.length; rightIndex += 1) {
      const left = existing[leftIndex];
      const right = existing[rightIndex];
      if (!pathsOverlap(left.realPath, right.realPath, context.platform)) continue;
      throw new PlanningOwnerCollectionError(
        "OWNER_SOURCE_REALPATH_COLLISION",
        `${left.owner.ownerId}:${left.location.logicalPath}<->${right.owner.ownerId}:${right.location.logicalPath}`,
      );
    }
  }

  return { existing, missing: Object.freeze(missing.map((entry) => Object.freeze(entry))) };
}

function sourceLogicalPath(location: PlanningOwnerLocation, relativePath?: string): string {
  if (location.kind === "file") return location.logicalPath;
  const relative = normalizePlanningOwnerLogicalPath(relativePath);
  return normalizePlanningOwnerLogicalPath(`${location.logicalPath}/${relative}`);
}

async function walkDirectory(input: {
  context: PlanningArchiveContext;
  ownerId: string;
  location: PlanningOwnerLocation;
  currentPath: string;
  relativePrefix: string;
  realRoot: string;
  seenRealPaths: Map<string, string>;
  budget: CollectionBudget;
}): Promise<SourceFile[]> {
  const detail = `${input.ownerId}:${input.location.logicalPath}`;
  const before = await lstatExisting(input.currentPath, "OWNER_SOURCE_LSTAT_FAILED", detail);
  if (before.isSymbolicLink()) {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_LINK_NOT_ALLOWED", detail);
  }
  if (!before.isDirectory()) {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_KIND_MISMATCH", detail);
  }

  let entries;
  try {
    entries = await fs.readdir(input.currentPath, { withFileTypes: true });
  } catch {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_READDIR_FAILED", detail);
  }
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

  const files: SourceFile[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(input.currentPath, entry.name);
    const relativePath = input.relativePrefix
      ? `${input.relativePrefix}/${entry.name}`
      : entry.name;
    const logicalPath = sourceLogicalPath(input.location, relativePath.replaceAll("\\", "/"));
    const stats = await lstatExisting(absolutePath, "OWNER_SOURCE_LSTAT_FAILED", `${input.ownerId}:${logicalPath}`);
    if (stats.isSymbolicLink()) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_LINK_NOT_ALLOWED", `${input.ownerId}:${logicalPath}`);
    }
    if (!stats.isFile() && !stats.isDirectory()) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_SPECIAL_FILE_NOT_ALLOWED", `${input.ownerId}:${logicalPath}`);
    }

    let realPath: string;
    try {
      realPath = await fs.realpath(absolutePath);
    } catch {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_REALPATH_FAILED", `${input.ownerId}:${logicalPath}`);
    }
    if (!pathIsInside(input.realRoot, realPath, input.context.platform)) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_REALPATH_ESCAPE", `${input.ownerId}:${logicalPath}`);
    }
    const realKey = normalizePhysicalPath(realPath, input.context.platform);
    const existingLogicalPath = input.seenRealPaths.get(realKey);
    if (existingLogicalPath && existingLogicalPath !== logicalPath) {
      throw new PlanningOwnerCollectionError(
        "OWNER_SOURCE_REALPATH_ALIAS",
        `${input.ownerId}:${existingLogicalPath}<->${logicalPath}`,
      );
    }
    input.seenRealPaths.set(realKey, logicalPath);

    if (stats.isDirectory()) {
      files.push(...await walkDirectory({
        ...input,
        currentPath: absolutePath,
        relativePrefix: relativePath,
      }));
    } else {
      input.budget.discoveredFiles += 1;
      if (input.budget.discoveredFiles > input.budget.maxEntries) {
        throw new PlanningOwnerCollectionError("OWNER_ENTRY_LIMIT_EXCEEDED");
      }
      files.push({ absolutePath, logicalPath, realPath });
    }
  }

  const after = await lstatExisting(input.currentPath, "OWNER_SOURCE_LSTAT_FAILED", detail);
  if (fingerprint(before) !== fingerprint(after)) {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_CHANGED", detail);
  }
  return files;
}

async function readStableFile(
  source: SourceFile,
  context: PlanningArchiveContext,
  ownerId: string,
  budget: CollectionBudget,
): Promise<Buffer> {
  const detail = `${ownerId}:${source.logicalPath}`;
  const flags = context.platform === "win32"
    ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_NOFOLLOW;
  let handle;
  let bytes: Buffer | undefined;
  let succeeded = false;
  try {
    handle = await fs.open(source.absolutePath, flags);
  } catch {
    throw new PlanningOwnerCollectionError("OWNER_SOURCE_OPEN_FAILED", detail);
  }

  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_KIND_MISMATCH", detail);
    }
    if (before.size > BigInt(budget.maxEntryBytes)) {
      throw new PlanningOwnerCollectionError("OWNER_ENTRY_SIZE_LIMIT_EXCEEDED", detail);
    }
    const reservedSize = Number(before.size);
    if (
      !Number.isSafeInteger(reservedSize)
      || budget.reservedBytes + reservedSize > budget.maxTotalBytes
    ) {
      throw new PlanningOwnerCollectionError("OWNER_TOTAL_SIZE_LIMIT_EXCEEDED");
    }
    budget.reservedBytes += reservedSize;
    bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fingerprint(before) !== fingerprint(after) || BigInt(bytes.length) !== after.size) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_CHANGED", detail);
    }
    const pathStats = await lstatExisting(source.absolutePath, "OWNER_SOURCE_LSTAT_FAILED", detail);
    let realPathAfter: string;
    try {
      realPathAfter = await fs.realpath(source.absolutePath);
    } catch {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_REALPATH_FAILED", detail);
    }
    if (fingerprint(after) !== fingerprint(pathStats) || realPathAfter !== source.realPath) {
      throw new PlanningOwnerCollectionError("OWNER_SOURCE_CHANGED", detail);
    }
    succeeded = true;
    return bytes;
  } finally {
    if (!succeeded) bytes?.fill(0);
    await handle.close();
  }
}

function assertPortableStablePayload(ownerId: string, logicalPath: string, bytes: Buffer): void {
  if (ownerId !== "stable.profile-run-vault" || !logicalPath.toLowerCase().endsWith(".json")) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf-8")) as unknown;
  } catch {
    throw new PlanningOwnerCollectionError("OWNER_STABLE_PAYLOAD_INVALID", `${ownerId}:${logicalPath}`);
  }
  if (isVaultEncryptedEnvelope(parsed) || isPlanningEncryptedEnvelope(parsed)) {
    throw new PlanningOwnerCollectionError("OWNER_PORTABLE_EXPORT_UNAVAILABLE", `${ownerId}:${logicalPath}`);
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const row = parsed as Record<string, unknown>;
    const encryptionMarkers = ["ciphertext", "iv", "tag", "salt", "enc", "kdf"]
      .filter((key) => Object.hasOwn(row, key)).length;
    if (encryptionMarkers >= 3 || Object.hasOwn(row, "ciphertext")) {
      throw new PlanningOwnerCollectionError("OWNER_STABLE_ENCRYPTED_PAYLOAD_INVALID", `${ownerId}:${logicalPath}`);
    }
  }
}

export async function collectPlanningOwnerFiles(input: {
  context: PlanningArchiveContext;
  owners: readonly ResolvedPlanningDataOwner[];
  limits: PlanningOwnerCollectionLimits;
}): Promise<PlanningOwnerCollection> {
  const maxEntries = asSafePositiveInteger(input.limits.maxEntries, "OWNER_ENTRY_LIMIT_INVALID");
  const maxEntryBytes = asSafePositiveInteger(input.limits.maxEntryBytes, "OWNER_ENTRY_SIZE_LIMIT_INVALID");
  const maxTotalBytes = asSafePositiveInteger(input.limits.maxTotalBytes, "OWNER_TOTAL_SIZE_LIMIT_INVALID");
  const resolved = await resolveExistingLocations(input.context, input.owners);
  const byOwner = new Map<string, CollectedPlanningOwnerFile[]>();
  const seenLogicalPathsByOwner = new Map<string, Set<string>>();
  const budget: CollectionBudget = {
    discoveredFiles: 0,
    reservedBytes: 0,
    maxEntries,
    maxEntryBytes,
    maxTotalBytes,
  };

  try {
    for (const existing of resolved.existing) {
      const seenRealPaths = new Map<string, string>();
      let sources: SourceFile[];
      if (existing.location.kind === "file") {
        budget.discoveredFiles += 1;
        if (budget.discoveredFiles > budget.maxEntries) {
          throw new PlanningOwnerCollectionError("OWNER_ENTRY_LIMIT_EXCEEDED");
        }
        sources = [{
          absolutePath: existing.location.targetPath,
          logicalPath: existing.location.logicalPath,
          realPath: existing.realPath,
        }];
      } else {
        sources = await walkDirectory({
          context: input.context,
          ownerId: existing.owner.ownerId,
          location: existing.location,
          currentPath: existing.location.targetPath,
          relativePrefix: "",
          realRoot: existing.realPath,
          seenRealPaths,
          budget,
        });
      }

      for (const source of sources) {
        const bytes = await readStableFile(source, input.context, existing.owner.ownerId, budget);
        try {
          assertPortableStablePayload(existing.owner.ownerId, source.logicalPath, bytes);

          const logicalKey = source.logicalPath.normalize("NFC").toLowerCase();
          const seenLogicalPaths = seenLogicalPathsByOwner.get(existing.owner.ownerId) ?? new Set<string>();
          if (seenLogicalPaths.has(logicalKey)) {
            throw new PlanningOwnerCollectionError(
              "OWNER_FILE_LOGICAL_PATH_DUPLICATE",
              `${existing.owner.ownerId}:${source.logicalPath}`,
            );
          }
          seenLogicalPaths.add(logicalKey);
          seenLogicalPathsByOwner.set(existing.owner.ownerId, seenLogicalPaths);

          const files = byOwner.get(existing.owner.ownerId) ?? [];
          files.push(Object.freeze({
            path: source.logicalPath,
            sizeBytes: bytes.length,
            sha256: sha256PlanningOwnerBytes(bytes),
            bytes,
          }));
          byOwner.set(existing.owner.ownerId, files);
        } catch (error) {
          bytes.fill(0);
          throw error;
        }
      }
    }

    const filesByOwner: Record<string, readonly CollectedPlanningOwnerFile[]> = {};
    for (const owner of input.owners) {
      filesByOwner[owner.ownerId] = Object.freeze((byOwner.get(owner.ownerId) ?? [])
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    }
    const emptyOwnerIds = input.owners
      .filter((owner) => filesByOwner[owner.ownerId].length === 0)
      .map((owner) => owner.ownerId)
      .sort();

    return Object.freeze({
      filesByOwner: Object.freeze(filesByOwner),
      missingLocations: resolved.missing,
      emptyOwnerIds: Object.freeze(emptyOwnerIds),
      totals: Object.freeze({ files: budget.discoveredFiles, bytes: budget.reservedBytes }),
    });
  } catch (error) {
    for (const files of byOwner.values()) {
      for (const file of files) file.bytes.fill(0);
    }
    throw error;
  }
}
