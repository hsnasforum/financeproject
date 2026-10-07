import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PLANNING_CURRENT_USER_V3_OWNER_IDS,
  PLANNING_DATA_OWNER_IDS,
  normalizePlanningOwnerLogicalPath,
  PlanningOwnerContractError,
  type PlanningOwnerNamespace,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";

export const PLANNING_OWNER_ARCHIVE_KIND = "planning-owner-vault";
export const PLANNING_OWNER_ARCHIVE_FORMAT_VERSION = 1;
export const PLANNING_OWNER_MANIFEST_PATH = "manifest.json";
export const PLANNING_OWNER_ARCHIVE_SCOPE = "active-namespace-and-runtime-shared";
export const PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE = "active-user-v3";

export type PlanningOwnerArchiveScope =
  | typeof PLANNING_OWNER_ARCHIVE_SCOPE
  | typeof PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE;

export type PlanningOwnerManifestFile = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

export type PlanningOwnerManifestEntry = {
  ownerId: string;
  schemaVersion: number;
  logicalPath: string;
  namespace: PlanningOwnerNamespace;
  required: boolean;
  emptyAllowed: boolean;
  fileCount: number;
  totalBytes: number;
  checksum: string;
  files: PlanningOwnerManifestFile[];
};

export type PlanningOwnerManifest = {
  kind: typeof PLANNING_OWNER_ARCHIVE_KIND;
  formatVersion: typeof PLANNING_OWNER_ARCHIVE_FORMAT_VERSION;
  archiveScope: PlanningOwnerArchiveScope;
  archiveId: string;
  generatedAt: string;
  appVersion: string;
  owners: PlanningOwnerManifestEntry[];
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const OWNER_ID_RE = /^[a-z][a-z0-9.-]{2,63}$/u;

const ManifestFileSchema = z.object({
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(SHA256_RE),
}).strict();

const NamespaceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("shared") }).strict(),
  z.object({
    mode: z.literal("user"),
    userId: z.string().trim().min(1).max(64),
  }).strict(),
]);

const ManifestOwnerSchema = z.object({
  ownerId: z.string().regex(OWNER_ID_RE),
  schemaVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  logicalPath: z.string().min(1),
  namespace: NamespaceSchema,
  required: z.boolean(),
  emptyAllowed: z.boolean(),
  fileCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  checksum: z.string().regex(SHA256_RE),
  files: z.array(ManifestFileSchema),
}).strict();

const ManifestSchema = z.object({
  kind: z.literal(PLANNING_OWNER_ARCHIVE_KIND),
  formatVersion: z.literal(PLANNING_OWNER_ARCHIVE_FORMAT_VERSION),
  archiveScope: z.enum([
    PLANNING_OWNER_ARCHIVE_SCOPE,
    PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE,
  ]),
  archiveId: z.string().regex(UUID_RE),
  generatedAt: z.string().refine((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  }),
  appVersion: z.string().trim().min(1).max(64),
  owners: z.array(ManifestOwnerSchema),
}).strict();

function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256PlanningOwnerBytes(input: Uint8Array): string {
  return sha256(input);
}

function normalizeSha256(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SHA256_RE.test(normalized)) {
    throw new PlanningOwnerContractError("MANIFEST_FILE_CHECKSUM_INVALID", normalized || "empty");
  }
  return normalized;
}

function collisionKey(filePath: string): string {
  return filePath.normalize("NFC").toLowerCase();
}

function normalizeManifestFiles(files: readonly PlanningOwnerManifestFile[]): PlanningOwnerManifestFile[] {
  const normalized = files.map((file) => {
    const filePath = normalizePlanningOwnerLogicalPath(file.path);
    if (file.path !== filePath) {
      throw new PlanningOwnerContractError("MANIFEST_FILE_PATH_NON_CANONICAL", filePath);
    }
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
      throw new PlanningOwnerContractError("MANIFEST_FILE_SIZE_INVALID", filePath);
    }
    return {
      path: filePath,
      sizeBytes: file.sizeBytes,
      sha256: normalizeSha256(file.sha256),
    };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

  const seen = new Set<string>();
  for (const file of normalized) {
    const key = collisionKey(file.path);
    if (seen.has(key)) {
      throw new PlanningOwnerContractError("MANIFEST_FILE_PATH_DUPLICATE", file.path);
    }
    for (const existing of seen) {
      if (key.startsWith(`${existing}/`) || existing.startsWith(`${key}/`)) {
        throw new PlanningOwnerContractError("MANIFEST_FILE_DIRECTORY_COLLISION", file.path);
      }
    }
    seen.add(key);
  }
  return normalized;
}

export function computePlanningOwnerChecksum(files: readonly PlanningOwnerManifestFile[]): string {
  const normalized = normalizeManifestFiles(files);
  const canonical = JSON.stringify(normalized.map((file) => [file.path, file.sizeBytes, file.sha256]));
  return sha256(canonical);
}

export function planningOwnerPayloadPath(ownerId: string, filePath: string): string {
  if (!OWNER_ID_RE.test(ownerId)) {
    throw new PlanningOwnerContractError("MANIFEST_OWNER_ID_INVALID", ownerId);
  }
  return `payload/${ownerId}/${normalizePlanningOwnerLogicalPath(filePath)}`;
}

function namespacesEqual(left: PlanningOwnerNamespace, right: PlanningOwnerNamespace): boolean {
  if (left.mode !== right.mode) return false;
  return left.mode === "shared" || (right.mode === "user" && left.userId === right.userId);
}

function validateManifestOwners(
  manifest: PlanningOwnerManifest,
  resolvedOwners: readonly ResolvedPlanningDataOwner[],
): void {
  const expectedOwnerIds = manifest.archiveScope === PLANNING_OWNER_USER_V3_ARCHIVE_SCOPE
    ? PLANNING_CURRENT_USER_V3_OWNER_IDS
    : PLANNING_DATA_OWNER_IDS;
  const canonicalOwnerIds = new Set<string>(expectedOwnerIds);
  const resolvedOwnerIds = new Set(resolvedOwners.map((owner) => owner.ownerId));
  if (
    resolvedOwnerIds.size !== expectedOwnerIds.length
    || expectedOwnerIds.some((ownerId) => !resolvedOwnerIds.has(ownerId))
  ) {
    throw new PlanningOwnerContractError("MANIFEST_OWNER_REGISTRY_INCOMPLETE");
  }
  const expectedById = new Map(resolvedOwners.map((owner) => [owner.ownerId, owner]));
  const actualById = new Map<string, PlanningOwnerManifestEntry>();
  const logicalPaths = new Set<string>();

  for (const entry of manifest.owners) {
    if (actualById.has(entry.ownerId)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_DUPLICATE", entry.ownerId);
    }
    actualById.set(entry.ownerId, entry);

    const expected = expectedById.get(entry.ownerId);
    if (!expected || !canonicalOwnerIds.has(entry.ownerId)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_UNKNOWN", entry.ownerId);
    }
    const logicalPath = normalizePlanningOwnerLogicalPath(entry.logicalPath);
    const logicalKey = logicalPath.toLowerCase();
    if (logicalPaths.has(logicalKey)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_LOGICAL_PATH_DUPLICATE", logicalPath);
    }
    logicalPaths.add(logicalKey);

    if (logicalPath !== expected.logicalPath) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_LOGICAL_PATH_MISMATCH", entry.ownerId);
    }
    if (entry.schemaVersion !== expected.schemaVersion) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_SCHEMA_VERSION_MISMATCH", entry.ownerId);
    }
    if (entry.required !== expected.requiredInManifest || entry.emptyAllowed !== expected.emptyAllowed) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_POLICY_MISMATCH", entry.ownerId);
    }
    if (!namespacesEqual(entry.namespace, expected.namespace)) {
      throw new PlanningOwnerContractError("MANIFEST_NAMESPACE_MISMATCH", entry.ownerId);
    }

    const files = normalizeManifestFiles(entry.files);
    for (const file of files) {
      const belongsToOwner = expected.locations.some((ownerLocation) => {
        if (ownerLocation.kind === "file") return file.path === ownerLocation.logicalPath;
        return file.path.startsWith(`${ownerLocation.logicalPath}/`);
      });
      if (!belongsToOwner) {
        throw new PlanningOwnerContractError("MANIFEST_FILE_OUTSIDE_OWNER", `${entry.ownerId}:${file.path}`);
      }
    }
    const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
    if (!Number.isSafeInteger(totalBytes)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_TOTAL_BYTES_INVALID", entry.ownerId);
    }
    if (entry.fileCount !== files.length) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_FILE_COUNT_MISMATCH", entry.ownerId);
    }
    if (entry.totalBytes !== totalBytes) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_TOTAL_BYTES_MISMATCH", entry.ownerId);
    }
    if (entry.checksum !== computePlanningOwnerChecksum(files)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_CHECKSUM_MISMATCH", entry.ownerId);
    }
    if (files.length === 0 && !entry.emptyAllowed) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_EMPTY_NOT_ALLOWED", entry.ownerId);
    }
  }

  for (const expected of resolvedOwners) {
    if (expected.requiredInManifest && !actualById.has(expected.ownerId)) {
      throw new PlanningOwnerContractError("MANIFEST_REQUIRED_OWNER_MISSING", expected.ownerId);
    }
  }
}

export function validatePlanningOwnerManifest(
  raw: unknown,
  resolvedOwners: readonly ResolvedPlanningDataOwner[],
): PlanningOwnerManifest {
  let manifest: PlanningOwnerManifest;
  try {
    manifest = ManifestSchema.parse(raw) as PlanningOwnerManifest;
  } catch {
    throw new PlanningOwnerContractError("MANIFEST_SCHEMA_INVALID");
  }
  validateManifestOwners(manifest, resolvedOwners);
  return manifest;
}

export function buildPlanningOwnerManifest(input: {
  archiveId: string;
  generatedAt: string;
  appVersion: string;
  archiveScope?: PlanningOwnerArchiveScope;
  resolvedOwners: readonly ResolvedPlanningDataOwner[];
  filesByOwner?: Readonly<Record<string, readonly PlanningOwnerManifestFile[]>>;
}): PlanningOwnerManifest {
  const expectedIds = new Set(input.resolvedOwners.map((owner) => owner.ownerId));
  for (const ownerId of Object.keys(input.filesByOwner ?? {})) {
    if (!expectedIds.has(ownerId)) {
      throw new PlanningOwnerContractError("MANIFEST_OWNER_UNKNOWN", ownerId);
    }
  }

  const owners = [...input.resolvedOwners]
    .sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0)
    .map((owner): PlanningOwnerManifestEntry => {
      const files = normalizeManifestFiles(input.filesByOwner?.[owner.ownerId] ?? []);
      const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
      return {
        ownerId: owner.ownerId,
        schemaVersion: owner.schemaVersion,
        logicalPath: owner.logicalPath,
        namespace: owner.namespace.mode === "user"
          ? { mode: "user", userId: owner.namespace.userId }
          : { mode: "shared" },
        required: owner.requiredInManifest,
        emptyAllowed: owner.emptyAllowed,
        fileCount: files.length,
        totalBytes,
        checksum: computePlanningOwnerChecksum(files),
        files,
      };
    });

  let manifest: PlanningOwnerManifest;
  try {
    manifest = ManifestSchema.parse({
      kind: PLANNING_OWNER_ARCHIVE_KIND,
      formatVersion: PLANNING_OWNER_ARCHIVE_FORMAT_VERSION,
      archiveScope: input.archiveScope ?? PLANNING_OWNER_ARCHIVE_SCOPE,
      archiveId: input.archiveId,
      generatedAt: input.generatedAt,
      appVersion: input.appVersion,
      owners,
    }) as PlanningOwnerManifest;
  } catch {
    throw new PlanningOwnerContractError("MANIFEST_SCHEMA_INVALID");
  }
  return validatePlanningOwnerManifest(manifest, input.resolvedOwners);
}

export function parsePlanningOwnerManifest(
  raw: unknown,
  resolvedOwners: readonly ResolvedPlanningDataOwner[],
): PlanningOwnerManifest {
  return validatePlanningOwnerManifest(raw, resolvedOwners);
}

export function serializePlanningOwnerManifest(manifest: PlanningOwnerManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
