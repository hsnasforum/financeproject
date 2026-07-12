import crypto from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { encodeZip, decodeZip, type ZipFileEntry } from "./zipCodec";
import {
  buildPlanningOwnerManifest,
  parsePlanningOwnerManifest,
  planningOwnerPayloadPath,
  serializePlanningOwnerManifest,
  sha256PlanningOwnerBytes,
  PLANNING_OWNER_ARCHIVE_FORMAT_VERSION,
  PLANNING_OWNER_ARCHIVE_KIND,
  PLANNING_OWNER_MANIFEST_PATH,
  type PlanningOwnerManifest,
  type PlanningOwnerManifestFile,
} from "./planningOwnerManifest";
import {
  findPlanningDataOwnerForPath,
  PlanningOwnerContractError,
  type PlanningArchiveContext,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";
import {
  collectPlanningOwnerFiles,
  type PlanningOwnerCollection,
} from "./planningOwnerCollector";

export const PLANNING_OWNER_ENCRYPTED_ARCHIVE_KIND = "planning-owner-vault-encrypted";
export const PLANNING_OWNER_ENCRYPTED_ARCHIVE_VERSION = 1;

const MIB = 1024 * 1024;
const KDF = Object.freeze({
  name: "scrypt" as const,
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 32,
});

export const DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 10_000,
  maxEntryBytes: 32 * MIB,
  maxSourceBytes: 64 * MIB,
  maxManifestBytes: 4 * MIB,
  maxZipBytes: 70 * MIB,
  maxEnvelopeBytes: 96 * MIB,
  maxPathBytes: 1024,
});

export type PlanningOwnerArchiveLimits = typeof DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS;

export type PlanningOwnerArchiveBuildResult = Readonly<{
  encryptedBytes: Buffer;
  manifest: PlanningOwnerManifest;
  collectionSummary: Readonly<{
    missingLocations: number;
    emptyOwnerIds: readonly string[];
    files: number;
    bytes: number;
  }>;
  archiveBytes: number;
  encryptedBytesLength: number;
}>;

export type PlanningOwnerArchivePreview = Readonly<{
  archiveFormat: "planning-owner-vault-v1";
  manifest: PlanningOwnerManifest;
  totals: Readonly<{
    owners: number;
    files: number;
    bytes: number;
    emptyOwners: number;
  }>;
  ownerIds: readonly string[];
  emptyOwnerIds: readonly string[];
}>;

export type ValidatedPlanningOwnerArchivePayload = Readonly<{
  manifest: PlanningOwnerManifest;
  payloadEntries: ReadonlyMap<string, Buffer>;
}>;

export class PlanningOwnerArchiveError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PlanningOwnerArchiveError";
    this.code = code;
  }
}

const EnvelopeSchema = z.object({
  kind: z.literal(PLANNING_OWNER_ENCRYPTED_ARCHIVE_KIND),
  version: z.literal(PLANNING_OWNER_ENCRYPTED_ARCHIVE_VERSION),
  content: z.object({
    kind: z.literal(PLANNING_OWNER_ARCHIVE_KIND),
    formatVersion: z.literal(PLANNING_OWNER_ARCHIVE_FORMAT_VERSION),
    encoding: z.literal("zip"),
  }).strict(),
  kdf: z.object({
    name: z.literal(KDF.name),
    N: z.literal(KDF.N),
    r: z.literal(KDF.r),
    p: z.literal(KDF.p),
    keyLength: z.literal(KDF.keyLength),
  }).strict(),
  salt: z.string().min(1),
  aead: z.object({
    version: z.literal(1),
    alg: z.literal("aes-256-gcm"),
    iv: z.string().min(1),
    tag: z.string().min(1),
    ciphertext: z.string().min(1),
  }).strict(),
}).strict();

type PlanningOwnerEncryptedEnvelope = z.infer<typeof EnvelopeSchema>;

function validateLimits(limits: PlanningOwnerArchiveLimits): PlanningOwnerArchiveLimits {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_LIMIT_INVALID", key);
    }
  }
  if (
    limits.maxEntryBytes > limits.maxSourceBytes
    || limits.maxManifestBytes > limits.maxZipBytes
    || limits.maxSourceBytes > limits.maxZipBytes
    || limits.maxZipBytes > limits.maxEnvelopeBytes
  ) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_LIMIT_ORDER_INVALID");
  }
  return limits;
}

function assertSecretLength(secret: Uint8Array): void {
  if (secret.byteLength < 16 || secret.byteLength > 4096) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_SECRET_INVALID");
  }
}

function copySecret(secret: Uint8Array): Buffer {
  assertSecretLength(secret);
  const copy = Buffer.from(secret);
  return copy;
}

function deriveKey(secret: Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, KDF.keyLength, {
      N: KDF.N,
      r: KDF.r,
      p: KDF.p,
      maxmem: 256 * MIB,
    }, (error, derivedKey) => {
      if (error) {
        reject(new PlanningOwnerArchiveError("OWNER_ARCHIVE_KDF_FAILED"));
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

function canonicalBase64(value: string, expectedBytes?: number, maxBytes?: number): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_BASE64_INVALID");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_BASE64_INVALID");
  }
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_BASE64_LENGTH_INVALID");
  }
  if (maxBytes !== undefined && decoded.length > maxBytes) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENCRYPTED_PAYLOAD_LIMIT_EXCEEDED");
  }
  return decoded;
}

function envelopeHeader(input: { salt: string; iv: string }) {
  return {
    kind: PLANNING_OWNER_ENCRYPTED_ARCHIVE_KIND,
    version: PLANNING_OWNER_ENCRYPTED_ARCHIVE_VERSION,
    content: {
      kind: PLANNING_OWNER_ARCHIVE_KIND,
      formatVersion: PLANNING_OWNER_ARCHIVE_FORMAT_VERSION,
      encoding: "zip" as const,
    },
    kdf: { ...KDF },
    salt: input.salt,
    aead: {
      version: 1 as const,
      alg: "aes-256-gcm" as const,
      iv: input.iv,
    },
  } as const;
}

function aadBytes(input: { salt: string; iv: string }): Buffer {
  return Buffer.from(JSON.stringify(envelopeHeader(input)), "utf-8");
}

export async function encryptPlanningOwnerArchiveBytes(input: {
  zipBytes: Uint8Array;
  secret: Uint8Array;
  limits?: PlanningOwnerArchiveLimits;
}): Promise<Buffer> {
  const limits = validateLimits(input.limits ?? DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS);
  const zipBytes = Buffer.from(input.zipBytes);
  if (zipBytes.length < 1 || zipBytes.length > limits.maxZipBytes) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ZIP_SIZE_LIMIT_EXCEEDED");
  }
  const secret = copySecret(input.secret);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  let key: Buffer | undefined;
  try {
    key = await deriveKey(secret, salt);
    const saltBase64 = salt.toString("base64");
    const ivBase64 = iv.toString("base64");
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aadBytes({ salt: saltBase64, iv: ivBase64 }));
    const ciphertext = Buffer.concat([cipher.update(zipBytes), cipher.final()]);
    const envelope: PlanningOwnerEncryptedEnvelope = {
      ...envelopeHeader({ salt: saltBase64, iv: ivBase64 }),
      aead: {
        ...envelopeHeader({ salt: saltBase64, iv: ivBase64 }).aead,
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      },
    };
    const serialized = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf-8");
    if (serialized.length > limits.maxEnvelopeBytes) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENVELOPE_LIMIT_EXCEEDED");
    }
    return serialized;
  } finally {
    secret.fill(0);
    key?.fill(0);
    zipBytes.fill(0);
  }
}

export async function decryptPlanningOwnerArchiveBytes(input: {
  encryptedBytes: Uint8Array;
  secret: Uint8Array;
  limits?: PlanningOwnerArchiveLimits;
}): Promise<Buffer> {
  const limits = validateLimits(input.limits ?? DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS);
  const encryptedBytes = Buffer.from(input.encryptedBytes);
  if (encryptedBytes.length < 1 || encryptedBytes.length > limits.maxEnvelopeBytes) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENVELOPE_LIMIT_EXCEEDED");
  }
  let envelope: PlanningOwnerEncryptedEnvelope;
  try {
    envelope = EnvelopeSchema.parse(JSON.parse(encryptedBytes.toString("utf-8")) as unknown);
  } catch {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENVELOPE_INVALID");
  }

  const salt = canonicalBase64(envelope.salt, 16);
  const iv = canonicalBase64(envelope.aead.iv, 12);
  const tag = canonicalBase64(envelope.aead.tag, 16);
  const ciphertext = canonicalBase64(envelope.aead.ciphertext, undefined, limits.maxZipBytes);
  const secret = copySecret(input.secret);
  let key: Buffer | undefined;
  try {
    key = await deriveKey(secret, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aadBytes({ salt: envelope.salt, iv: envelope.aead.iv }));
    decipher.setAuthTag(tag);
    const zipBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (zipBytes.length < 1 || zipBytes.length > limits.maxZipBytes) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ZIP_SIZE_LIMIT_EXCEEDED");
    }
    return zipBytes;
  } catch (error) {
    if (error instanceof PlanningOwnerArchiveError || error instanceof PlanningOwnerContractError) throw error;
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_AUTH_FAILED");
  } finally {
    secret.fill(0);
    key?.fill(0);
  }
}

function manifestFilesFromCollection(
  collection: PlanningOwnerCollection,
): Readonly<Record<string, readonly PlanningOwnerManifestFile[]>> {
  return Object.fromEntries(Object.entries(collection.filesByOwner).map(([ownerId, files]) => [
    ownerId,
    files.map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    })),
  ]));
}

function assertZipWriterLimits(entries: readonly ZipFileEntry[], limits: PlanningOwnerArchiveLimits): void {
  if (entries.length > limits.maxEntries + 1) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_LIMIT_EXCEEDED");
  }
  let totalBytes = 0;
  for (const entry of entries) {
    const pathBytes = Buffer.byteLength(entry.path, "utf-8");
    if (pathBytes < 1 || pathBytes > limits.maxPathBytes || pathBytes > 0xffff) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_PATH_SIZE_LIMIT_EXCEEDED", entry.path);
    }
    if (entry.bytes.length > Math.max(limits.maxEntryBytes, limits.maxManifestBytes)) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_SIZE_LIMIT_EXCEEDED", entry.path);
    }
    totalBytes += entry.bytes.length;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxZipBytes) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ZIP_SIZE_LIMIT_EXCEEDED");
    }
  }
}

export async function buildPlanningOwnerArchive(input: {
  context: PlanningArchiveContext;
  owners: readonly ResolvedPlanningDataOwner[];
  archiveId: string;
  generatedAt: string;
  appVersion: string;
  secret: Uint8Array;
  confirmQuiesced: boolean;
  limits?: PlanningOwnerArchiveLimits;
}): Promise<PlanningOwnerArchiveBuildResult> {
  if (!input.confirmQuiesced) {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_QUIESCED_CONFIRMATION_REQUIRED");
  }
  assertSecretLength(input.secret);
  const limits = validateLimits(input.limits ?? DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS);
  const collection = await collectPlanningOwnerFiles({
    context: input.context,
    owners: input.owners,
    limits: {
      maxEntries: limits.maxEntries,
      maxEntryBytes: limits.maxEntryBytes,
      maxTotalBytes: limits.maxSourceBytes,
    },
  });
  let manifestBytes: Buffer | undefined;
  let zipBytes: Buffer | undefined;
  try {
    const manifest = buildPlanningOwnerManifest({
      archiveId: input.archiveId,
      generatedAt: input.generatedAt,
      appVersion: input.appVersion,
      resolvedOwners: input.owners,
      filesByOwner: manifestFilesFromCollection(collection),
    });
    manifestBytes = serializePlanningOwnerManifest(manifest);
    if (manifestBytes.length > limits.maxManifestBytes) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_MANIFEST_LIMIT_EXCEEDED");
    }
    const entries: ZipFileEntry[] = [{
      path: PLANNING_OWNER_MANIFEST_PATH,
      bytes: manifestBytes,
    }];
    for (const owner of input.owners) {
      for (const file of collection.filesByOwner[owner.ownerId]) {
        entries.push({
          path: planningOwnerPayloadPath(owner.ownerId, file.path),
          bytes: file.bytes,
        });
      }
    }
    assertZipWriterLimits(entries, limits);
    zipBytes = encodeZip(entries);
    if (zipBytes.length > limits.maxZipBytes) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ZIP_SIZE_LIMIT_EXCEEDED");
    }
    const archiveBytes = zipBytes.length;
    const encryptedBytes = await encryptPlanningOwnerArchiveBytes({
      zipBytes,
      secret: input.secret,
      limits,
    });
    return Object.freeze({
      encryptedBytes,
      manifest,
      collectionSummary: Object.freeze({
        missingLocations: collection.missingLocations.length,
        emptyOwnerIds: Object.freeze([...collection.emptyOwnerIds]),
        files: collection.totals.files,
        bytes: collection.totals.bytes,
      }),
      archiveBytes,
      encryptedBytesLength: encryptedBytes.length,
    });
  } finally {
    for (const files of Object.values(collection.filesByOwner)) {
      for (const file of files) file.bytes.fill(0);
    }
    manifestBytes?.fill(0);
    zipBytes?.fill(0);
  }
}

function expectedArchiveEntries(manifest: PlanningOwnerManifest): Map<string, PlanningOwnerManifestFile> {
  const expected = new Map<string, PlanningOwnerManifestFile>();
  for (const owner of manifest.owners) {
    for (const file of owner.files) {
      expected.set(planningOwnerPayloadPath(owner.ownerId, file.path), file);
    }
  }
  return expected;
}

export async function previewPlanningOwnerArchive(input: {
  encryptedBytes: Uint8Array;
  secret: Uint8Array;
  owners: readonly ResolvedPlanningDataOwner[];
  limits?: PlanningOwnerArchiveLimits;
}): Promise<PlanningOwnerArchivePreview> {
  return withValidatedPlanningOwnerArchivePayload(input, ({ manifest }) => {
    const emptyOwnerIds = manifest.owners
      .filter((owner) => owner.fileCount === 0)
      .map((owner) => owner.ownerId)
      .sort();
    const totalFiles = manifest.owners.reduce((sum, owner) => sum + owner.fileCount, 0);
    const totalBytes = manifest.owners.reduce((sum, owner) => sum + owner.totalBytes, 0);
    return Object.freeze({
      archiveFormat: "planning-owner-vault-v1",
      manifest,
      totals: Object.freeze({
        owners: manifest.owners.length,
        files: totalFiles,
        bytes: totalBytes,
        emptyOwners: emptyOwnerIds.length,
      }),
      ownerIds: Object.freeze(manifest.owners.map((owner) => owner.ownerId).sort()),
      emptyOwnerIds: Object.freeze(emptyOwnerIds),
    });
  });
}

export async function withValidatedPlanningOwnerArchivePayload<T>(
  input: {
    encryptedBytes: Uint8Array;
    secret: Uint8Array;
    owners: readonly ResolvedPlanningDataOwner[];
    limits?: PlanningOwnerArchiveLimits;
  },
  callback: (payload: ValidatedPlanningOwnerArchivePayload) => T | Promise<T>,
): Promise<T> {
  const limits = validateLimits(input.limits ?? DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS);
  const zipBytes = await decryptPlanningOwnerArchiveBytes({
    encryptedBytes: input.encryptedBytes,
    secret: input.secret,
    limits,
  });
  let entries: Map<string, Buffer> | undefined;
  try {
    let validated: ValidatedPlanningOwnerArchivePayload;
    try {
      entries = await decodeZip(zipBytes, {
        maxEntries: limits.maxEntries + 1,
        maxEntryBytes: Math.max(limits.maxEntryBytes, limits.maxManifestBytes),
        maxTotalBytes: limits.maxZipBytes,
        strict: {
          maxArchiveBytes: limits.maxZipBytes,
          maxCompressedEntryBytes: Math.max(limits.maxEntryBytes, limits.maxManifestBytes),
          maxTotalCompressedBytes: limits.maxZipBytes,
          rejectDirectoryEntries: true,
          rejectEncryptedEntries: true,
          rejectNonRegularEntries: true,
        },
      });
      const manifestBytes = entries.get(PLANNING_OWNER_MANIFEST_PATH);
      if (!manifestBytes) {
        throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_MANIFEST_MISSING");
      }
      if (manifestBytes.length > limits.maxManifestBytes) {
        throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_MANIFEST_LIMIT_EXCEEDED");
      }
      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestBytes.toString("utf-8")) as unknown;
      } catch {
        throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_MANIFEST_JSON_INVALID");
      }
      const manifest = parsePlanningOwnerManifest(manifestRaw, input.owners);
      const expected = expectedArchiveEntries(manifest);
      const actualPayloadPaths = [...entries.keys()].filter((entryPath) => entryPath !== PLANNING_OWNER_MANIFEST_PATH);

      for (const actualPath of actualPayloadPaths) {
        if (!expected.has(actualPath)) {
          throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_UNEXPECTED", actualPath);
        }
      }
      for (const [expectedPath, file] of expected) {
        const bytes = entries.get(expectedPath);
        if (!bytes) {
          throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_MISSING", expectedPath);
        }
        if (bytes.length !== file.sizeBytes) {
          throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_SIZE_MISMATCH", expectedPath);
        }
        if (sha256PlanningOwnerBytes(bytes) !== file.sha256) {
          throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_CHECKSUM_MISMATCH", expectedPath);
        }
      }
      if (actualPayloadPaths.length !== expected.size) {
        throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ENTRY_SET_MISMATCH");
      }

      validated = Object.freeze({
        manifest,
        payloadEntries: new Map([...expected.keys()].map((entryPath) => [entryPath, entries!.get(entryPath)!])),
      });
    } catch (error) {
      if (error instanceof PlanningOwnerArchiveError || error instanceof PlanningOwnerContractError) throw error;
      const detail = error instanceof Error ? error.message.split(":", 1)[0] : "invalid";
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_ZIP_INVALID", detail);
    }
    return await callback(validated);
  } finally {
    zipBytes.fill(0);
    for (const bytes of entries?.values() ?? []) bytes.fill(0);
  }
}

function normalizedPhysicalPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/u, "").normalize("NFC") || "/";
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function physicalPathsOverlap(left: string, right: string, platform: NodeJS.Platform): boolean {
  const a = normalizedPhysicalPath(left, platform);
  const b = normalizedPhysicalPath(right, platform);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

async function resolveProspectiveRealPath(input: {
  candidatePath: string;
  rejectExistingLinks: boolean;
}): Promise<string> {
  const resolved = path.resolve(input.candidatePath);
  const root = path.parse(resolved).root;
  const relative = path.relative(root, resolved);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    const next = path.join(current, segments[index]);
    let stats;
    try {
      stats = await fs.lstat(next);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw new PlanningOwnerArchiveError("OWNER_AUXILIARY_PATH_INVALID");
      }
      let realParent: string;
      try {
        realParent = await fs.realpath(current);
      } catch {
        throw new PlanningOwnerArchiveError("OWNER_AUXILIARY_PATH_INVALID");
      }
      return path.resolve(realParent, ...segments.slice(index));
    }
    if (input.rejectExistingLinks && stats.isSymbolicLink()) {
      throw new PlanningOwnerArchiveError("OWNER_AUXILIARY_PATH_LINK_NOT_ALLOWED");
    }
    if (index < segments.length - 1 && !stats.isDirectory() && !stats.isSymbolicLink()) {
      throw new PlanningOwnerArchiveError("OWNER_AUXILIARY_PATH_INVALID");
    }
    current = next;
  }

  try {
    return await fs.realpath(current);
  } catch {
    throw new PlanningOwnerArchiveError("OWNER_AUXILIARY_PATH_INVALID");
  }
}

export async function assertPlanningOwnerAuxiliaryPathOutsideOwners(input: {
  owners: readonly ResolvedPlanningDataOwner[];
  candidatePath: string;
  platform: NodeJS.Platform;
  purpose: "archive" | "secret";
}): Promise<void> {
  if (findPlanningDataOwnerForPath(input.owners, path.resolve(input.candidatePath), input.platform)) {
    throw new PlanningOwnerArchiveError(`OWNER_${input.purpose.toUpperCase()}_PATH_OWNED`);
  }
  const candidateRealPath = await resolveProspectiveRealPath({
    candidatePath: input.candidatePath,
    rejectExistingLinks: true,
  });
  for (const owner of input.owners) {
    for (const location of owner.locations) {
      const ownerRealPath = await resolveProspectiveRealPath({
        candidatePath: location.targetPath,
        rejectExistingLinks: false,
      });
      if (!physicalPathsOverlap(candidateRealPath, ownerRealPath, input.platform)) continue;
      throw new PlanningOwnerArchiveError(`OWNER_${input.purpose.toUpperCase()}_PATH_OWNED`);
    }
  }
}

async function assertTrustedPosixArchiveDirectory(
  directoryPath: string,
  allowMissingDescendants = false,
): Promise<void> {
  if (typeof process.getuid !== "function") {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED");
  }
  const currentUid = process.getuid();
  let current = path.resolve(directoryPath);
  while (true) {
    let stats: BigIntStats;
    try {
      stats = await fs.lstat(current, { bigint: true });
    } catch (error) {
      if (allowMissingDescendants && (error as NodeJS.ErrnoException)?.code === "ENOENT") {
        const parent = path.dirname(current);
        if (parent === current) {
          throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED");
        }
        current = parent;
        continue;
      }
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED");
    }
    const mode = Number(stats.mode & BigInt(0o7777));
    const ownerUid = Number(stats.uid);
    if (
      stats.isSymbolicLink()
      || !stats.isDirectory()
      || (ownerUid !== currentUid && ownerUid !== 0)
      || ((mode & 0o022) !== 0 && (mode & 0o1000) === 0)
    ) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED");
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export async function writePlanningOwnerArchiveFile(input: {
  archivePath: string;
  encryptedBytes: Uint8Array;
  owners: readonly ResolvedPlanningDataOwner[];
  platform: NodeJS.Platform;
}): Promise<void> {
  if (input.platform === "win32" || process.platform === "win32") {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED");
  }
  const archivePath = path.resolve(input.archivePath);
  await assertPlanningOwnerAuxiliaryPathOutsideOwners({
    owners: input.owners,
    candidatePath: archivePath,
    platform: input.platform,
    purpose: "archive",
  });
  await assertTrustedPosixArchiveDirectory(path.dirname(archivePath), true);
  await fs.mkdir(path.dirname(archivePath), { recursive: true, mode: 0o700 });
  await assertPlanningOwnerAuxiliaryPathOutsideOwners({
    owners: input.owners,
    candidatePath: archivePath,
    platform: input.platform,
    purpose: "archive",
  });
  const parentPath = path.dirname(archivePath);
  await assertTrustedPosixArchiveDirectory(parentPath);
  const tempPath = path.join(parentPath, `.planning-owner-${crypto.randomUUID()}.tmp`);
  let handle;
  let published = false;
  let publishedIdentity: string | undefined;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(input.encryptedBytes);
    await handle.sync();
    await assertPlanningOwnerAuxiliaryPathOutsideOwners({
      owners: input.owners,
      candidatePath: tempPath,
      platform: input.platform,
      purpose: "archive",
    });
    await assertTrustedPosixArchiveDirectory(parentPath);
    await assertPlanningOwnerAuxiliaryPathOutsideOwners({
      owners: input.owners,
      candidatePath: archivePath,
      platform: input.platform,
      purpose: "archive",
    });
    await assertTrustedPosixArchiveDirectory(parentPath);
    const tempStats = await fs.lstat(tempPath, { bigint: true });
    const handleStats = await handle.stat({ bigint: true });
    if (secureFileFingerprint(tempStats) !== secureFileFingerprint(handleStats)) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_CHANGED");
    }
    await fs.link(tempPath, archivePath);
    published = true;
    const publishedStats = await fs.lstat(archivePath, { bigint: true });
    const publishedHandleStats = await handle.stat({ bigint: true });
    if (secureFileFingerprint(publishedStats) !== secureFileFingerprint(publishedHandleStats)) {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_CHANGED");
    }
    publishedIdentity = `${publishedStats.dev}:${publishedStats.ino}`;
    await assertPlanningOwnerAuxiliaryPathOutsideOwners({
      owners: input.owners,
      candidatePath: archivePath,
      platform: input.platform,
      purpose: "archive",
    });
    const directoryHandle = await fs.open(parentPath, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
      await fs.unlink(tempPath);
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (published && publishedIdentity) {
      try {
        const current = await fs.lstat(archivePath, { bigint: true });
        if (`${current.dev}:${current.ino}` === publishedIdentity) {
          await fs.unlink(archivePath);
        }
      } catch {
        // Preserve the primary failure. A complete published archive may remain as evidence.
      }
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_OUTPUT_EXISTS");
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function secureFileFingerprint(stats: BigIntStats): string {
  return [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs].join(":");
}

async function readRegularFileNoFollow(input: {
  filePath: string;
  platform: NodeJS.Platform;
  maxBytes: number;
  minBytes?: number;
  errorCode: string;
  requireOwnerOnlyMode?: boolean;
}): Promise<Buffer> {
  let before: BigIntStats;
  try {
    before = await fs.lstat(input.filePath, { bigint: true });
  } catch {
    throw new PlanningOwnerArchiveError(input.errorCode);
  }
  if (
    before.isSymbolicLink()
    || !before.isFile()
    || before.size < BigInt(input.minBytes ?? 1)
    || before.size > BigInt(input.maxBytes)
    || (
      input.requireOwnerOnlyMode
      && input.platform !== "win32"
      && (before.mode & BigInt(0o077)) !== BigInt(0)
    )
  ) {
    throw new PlanningOwnerArchiveError(
      input.requireOwnerOnlyMode
        && input.platform !== "win32"
        && (before.mode & BigInt(0o077)) !== BigInt(0)
        ? "OWNER_ARCHIVE_SECRET_FILE_MODE_INVALID"
        : input.errorCode,
    );
  }

  const flags = input.platform === "win32"
    ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_NOFOLLOW;
  let handle;
  let bytes: Buffer | undefined;
  let succeeded = false;
  try {
    handle = await fs.open(input.filePath, flags);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || secureFileFingerprint(opened) !== secureFileFingerprint(before)) {
      throw new PlanningOwnerArchiveError(input.errorCode);
    }
    bytes = await handle.readFile();
    const afterHandle = await handle.stat({ bigint: true });
    const afterPath = await fs.lstat(input.filePath, { bigint: true });
    if (
      bytes.length < (input.minBytes ?? 1)
      || bytes.length > input.maxBytes
      || afterPath.isSymbolicLink()
      || secureFileFingerprint(opened) !== secureFileFingerprint(afterHandle)
      || secureFileFingerprint(afterHandle) !== secureFileFingerprint(afterPath)
      || BigInt(bytes.length) !== afterHandle.size
    ) {
      bytes.fill(0);
      throw new PlanningOwnerArchiveError(input.errorCode);
    }
    succeeded = true;
    return bytes;
  } catch (error) {
    if (error instanceof PlanningOwnerArchiveError) throw error;
    throw new PlanningOwnerArchiveError(input.errorCode);
  } finally {
    if (!succeeded) bytes?.fill(0);
    await handle?.close().catch(() => undefined);
  }
}

export async function readPlanningOwnerSecretFile(input: {
  secretPath: string;
  platform: NodeJS.Platform;
}): Promise<Buffer> {
  if (input.platform === "win32" || process.platform === "win32") {
    throw new PlanningOwnerArchiveError("OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED");
  }
  const secretPath = path.resolve(input.secretPath);
  return readRegularFileNoFollow({
    filePath: secretPath,
    platform: input.platform,
    maxBytes: 4096,
    minBytes: 16,
    errorCode: "OWNER_ARCHIVE_SECRET_FILE_INVALID",
    requireOwnerOnlyMode: true,
  });
}

export async function readPlanningOwnerArchiveFile(input: {
  archivePath: string;
  platform?: NodeJS.Platform;
  limits?: PlanningOwnerArchiveLimits;
}): Promise<Buffer> {
  const limits = validateLimits(input.limits ?? DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS);
  return readRegularFileNoFollow({
    filePath: path.resolve(input.archivePath),
    platform: input.platform ?? process.platform,
    maxBytes: limits.maxEnvelopeBytes,
    errorCode: "OWNER_ARCHIVE_FILE_INVALID",
  });
}
