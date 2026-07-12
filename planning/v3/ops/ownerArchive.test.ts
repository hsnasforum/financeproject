import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS,
  buildPlanningOwnerArchive,
  decryptPlanningOwnerArchiveBytes,
  encryptPlanningOwnerArchiveBytes,
  previewPlanningOwnerArchive,
  readPlanningOwnerSecretFile,
  withValidatedPlanningOwnerArchivePayload,
  writePlanningOwnerArchiveFile,
} from "../../../src/lib/ops/backup/planningOwnerArchive";
import {
  createPlanningArchiveContext,
  resolvePlanningDataOwners,
  type PlanningArchiveContext,
  type ResolvedPlanningDataOwner,
} from "../../../src/lib/ops/backup/planningOwnerRegistry";
import { decodeZip, encodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { runV3OwnerExport } from "./export";

const SECRET = Buffer.from("owner-archive-test-secret", "utf-8");
const ARCHIVE_ID = "22222222-2222-4222-8222-222222222222";
const GENERATED_AT = "2026-07-11T10:00:00.000Z";

function writeBytes(filePath: string, bytes: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
}

function checksum(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function ownerLocation(
  owners: readonly ResolvedPlanningDataOwner[],
  ownerId: string,
  logicalPath: string,
): string {
  const owner = owners.find((entry) => entry.ownerId === ownerId);
  const location = owner?.locations.find((entry) => entry.logicalPath === logicalPath);
  expect(location).toBeDefined();
  return location!.targetPath;
}

async function errorCode(run: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "string") return code;
    return error instanceof Error ? error.message.split(":", 1)[0] : "unknown";
  }
  throw new Error("expected failure");
}

function createContext(
  root: string,
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    userId?: string;
  } = {},
): { context: PlanningArchiveContext; owners: readonly ResolvedPlanningDataOwner[] } {
  const context = createPlanningArchiveContext({
    cwd: root,
    env: options.env ?? { NODE_ENV: "test" },
    platform: options.platform ?? "linux",
    userId: options.userId,
  });
  return { context, owners: resolvePlanningDataOwners(context) };
}

async function buildArchive(input: {
  context: PlanningArchiveContext;
  owners: readonly ResolvedPlanningDataOwner[];
  secret?: Buffer;
  limits?: typeof DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS;
}) {
  return buildPlanningOwnerArchive({
    context: input.context,
    owners: input.owners,
    archiveId: ARCHIVE_ID,
    generatedAt: GENERATED_AT,
    appVersion: "1.0.4",
    secret: input.secret ?? SECRET,
    confirmQuiesced: true,
    limits: input.limits,
  });
}

async function rewrapArchive(input: {
  encryptedBytes: Buffer;
  mutate: (entries: Map<string, Buffer>) => void;
}): Promise<Buffer> {
  const zipBytes = await decryptPlanningOwnerArchiveBytes({
    encryptedBytes: input.encryptedBytes,
    secret: SECRET,
  });
  const entries = await decodeZip(zipBytes, {
    maxEntries: 20_000,
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalBytes: 70 * 1024 * 1024,
  });
  input.mutate(entries);
  return encryptPlanningOwnerArchiveBytes({
    zipBytes: encodeZip([...entries].map(([entryPath, bytes]) => ({ path: entryPath, bytes }))),
    secret: SECRET,
  });
}

function replaceZipNames(bytes: Buffer, from: string, to: string): Buffer {
  expect(Buffer.byteLength(from)).toBe(Buffer.byteLength(to));
  const result = Buffer.from(bytes);
  const needle = Buffer.from(from, "utf-8");
  const replacement = Buffer.from(to, "utf-8");
  let replaced = 0;
  let offset = 0;
  while (offset < result.length) {
    const index = result.indexOf(needle, offset);
    if (index < 0) break;
    replacement.copy(result, index);
    replaced += 1;
    offset = index + replacement.length;
  }
  expect(replaced).toBe(2);
  return result;
}

function withoutUtf8Flags(bytes: Buffer): Buffer {
  const result = Buffer.from(bytes);
  const localOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(localOffset).toBeGreaterThanOrEqual(0);
  expect(centralOffset).toBeGreaterThanOrEqual(0);
  result.writeUInt16LE(result.readUInt16LE(localOffset + 6) & ~0x0800, localOffset + 6);
  result.writeUInt16LE(result.readUInt16LE(centralOffset + 8) & ~0x0800, centralOffset + 8);
  return result;
}

function withMalformedUtf8Name(bytes: Buffer, fileName: string): Buffer {
  const result = Buffer.from(bytes);
  const needle = Buffer.from(fileName, "utf-8");
  let replaced = 0;
  let offset = 0;
  while (offset < result.length) {
    const index = result.indexOf(needle, offset);
    if (index < 0) break;
    result[index] = 0xff;
    replaced += 1;
    offset = index + needle.length;
  }
  expect(replaced).toBe(2);
  return result;
}

function withUnicodePathExtraField(bytes: Buffer): Buffer {
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const centralOffset = bytes.indexOf(centralSignature);
  const eocdOffset = bytes.indexOf(eocdSignature);
  expect(centralOffset).toBeGreaterThanOrEqual(0);
  expect(eocdOffset).toBeGreaterThan(centralOffset);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const insertAt = centralOffset + 46 + nameLength;
  const extra = Buffer.from([0x75, 0x70, 0x00, 0x00]);
  const result = Buffer.concat([
    bytes.subarray(0, insertAt),
    extra,
    bytes.subarray(insertAt),
  ]);
  result.writeUInt16LE(extra.length, centralOffset + 30);
  const shiftedEocdOffset = eocdOffset + extra.length;
  result.writeUInt32LE(bytes.readUInt32LE(eocdOffset + 12) + extra.length, shiftedEocdOffset + 12);
  return result;
}

describe("planning owner encrypted archive", () => {
  const roots: string[] = [];

  function createRoot(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `finance-owner-archive-${label}-`));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips all registered owners while preserving every source and unrelated checksum", async () => {
    const root = createRoot("roundtrip");
    const { context, owners } = createContext(root);
    const seeded = [
      [ownerLocation(owners, "v3.accounts", "accounts.json"), '{"version":2,"items":[{"id":"account-a"}]}\n'],
      [path.join(ownerLocation(owners, "v3.batches", "batches"), "index.json"), '{"version":1,"batches":["batch-a"]}\n'],
      [path.join(ownerLocation(owners, "v3.batches", "batches"), "batch-a.ndjson"), '{"id":"txn-a"}\n'],
      [path.join(ownerLocation(owners, "v3.drafts", "drafts"), "profile", "draft-a.json"), '{"id":"draft-a"}\n'],
      [path.join(ownerLocation(owners, "stable.profile-run-vault", "profiles"), "profile-a.json"), '{"id":"profile-a","name":"sensitive-profile-name"}\n'],
      [path.join(ownerLocation(owners, "stable.profile-run-vault", "runs"), "index.json"), '{"runIds":["run-a"]}\n'],
      [path.join(ownerLocation(owners, "v3.news", "news"), "items", "한글-news.json"), '{"id":"news-a"}\n'],
      [path.join(ownerLocation(owners, "v3.indicators", "indicators"), "state.json"), ""],
    ] as const;
    for (const [filePath, content] of seeded) writeBytes(filePath, content);
    const unrelated = path.join(root, ".data", "unowned", "keep.txt");
    writeBytes(unrelated, "keep-me\n");

    const before = new Map([...seeded.map(([filePath]) => filePath), unrelated]
      .map((filePath) => [filePath, checksum(filePath)]));
    const built = await buildArchive({ context, owners });
    const preview = await previewPlanningOwnerArchive({
      encryptedBytes: built.encryptedBytes,
      secret: SECRET,
      owners,
    });

    expect(preview.totals.owners).toBe(17);
    expect(preview.totals.files).toBe(seeded.length);
    expect(preview.ownerIds).toHaveLength(17);
    expect(built.encryptedBytes.toString("utf-8")).not.toContain("sensitive-profile-name");
    expect(built.manifest.owners.flatMap((owner) => owner.files).some((file) => file.path.includes("unowned")))
      .toBe(false);
    for (const [filePath, expected] of before) expect(checksum(filePath)).toBe(expected);
  });

  it("round-trips explicit PLANNING_DATA_DIR and packaged vault fixtures", async () => {
    const root = createRoot("runtime-roots");
    const cases = [
      createContext(path.join(root, "explicit"), {
        env: {
          NODE_ENV: "test",
          PLANNING_DATA_DIR: path.join(root, "external", "planning"),
        },
      }),
      createContext(path.join(root, "packaged"), {
        env: {
          NODE_ENV: "production",
          XDG_DATA_HOME: path.join(root, "xdg"),
          PLANNING_APP_NAME: "Finance Fixture",
        },
        platform: "linux",
      }),
    ];

    for (const item of cases) {
      writeBytes(ownerLocation(item.owners, "v3.accounts", "accounts.json"), '{"version":2,"items":[]}\n');
      const built = await buildArchive(item);
      const preview = await previewPlanningOwnerArchive({
        encryptedBytes: built.encryptedBytes,
        secret: SECRET,
        owners: item.owners,
      });
      expect(preview.totals.files).toBe(1);
      expect(preview.manifest.owners.find((owner) => owner.ownerId === "v3.accounts")?.fileCount).toBe(1);
    }
  });

  it("limits validated payload buffers to the callback lifetime and preserves callback errors", async () => {
    const root = createRoot("validated-callback");
    const item = createContext(root);
    const accountsPath = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    writeBytes(accountsPath, '{"version":2,"items":[{"id":"account-a"}]}\n');
    const built = await buildArchive(item);
    let capturedPayload: Buffer | undefined;

    const result = await withValidatedPlanningOwnerArchivePayload({
      encryptedBytes: built.encryptedBytes,
      secret: SECRET,
      owners: item.owners,
    }, ({ manifest, payloadEntries }) => {
      expect(manifest.archiveId).toBe(ARCHIVE_ID);
      expect([...payloadEntries.keys()]).toEqual(["payload/v3.accounts/accounts.json"]);
      capturedPayload = payloadEntries.get("payload/v3.accounts/accounts.json");
      expect(capturedPayload?.toString("utf-8")).toContain("account-a");
      return "validated";
    });

    expect(result).toBe("validated");
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.every((byte) => byte === 0)).toBe(true);

    const callbackError = new Error("transaction-callback-failed");
    let errorPathPayload: Buffer | undefined;
    try {
      await withValidatedPlanningOwnerArchivePayload({
        encryptedBytes: built.encryptedBytes,
        secret: SECRET,
        owners: item.owners,
      }, ({ payloadEntries }) => {
        errorPathPayload = payloadEntries.get("payload/v3.accounts/accounts.json");
        throw callbackError;
      });
      throw new Error("expected callback failure");
    } catch (error) {
      expect(error).toBe(callbackError);
    }
    expect(errorPathPayload).toBeDefined();
    expect(errorPathPayload?.every((byte) => byte === 0)).toBe(true);
  });

  it("rejects a user A archive in user B before creating user B data", async () => {
    const root = createRoot("namespace");
    const env = { NODE_ENV: "test", PLANNING_NAMESPACE_ENABLED: "true" } satisfies NodeJS.ProcessEnv;
    const alice = createContext(root, { env, userId: "alice" });
    const bob = createContext(root, { env, userId: "bob" });
    writeBytes(ownerLocation(alice.owners, "v3.accounts", "accounts.json"), '{"version":2,"items":[]}\n');
    const built = await buildArchive(alice);

    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: built.encryptedBytes,
      secret: SECRET,
      owners: bob.owners,
    }))).toBe("MANIFEST_NAMESPACE_MISMATCH");
    expect(fs.existsSync(bob.context.userDataDir)).toBe(false);
  });

  it("fails closed on wrong secrets, strict envelope changes, and payload tampering", async () => {
    const root = createRoot("tamper");
    const item = createContext(root);
    writeBytes(ownerLocation(item.owners, "v3.accounts", "accounts.json"), '{"version":2,"items":[]}\n');
    const built = await buildArchive(item);

    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: built.encryptedBytes,
      secret: Buffer.from("wrong-secret-at-least-16-bytes"),
      owners: item.owners,
    }))).toBe("OWNER_ARCHIVE_AUTH_FAILED");

    const excessiveKdf = JSON.parse(built.encryptedBytes.toString("utf-8")) as Record<string, unknown>;
    (excessiveKdf.kdf as Record<string, unknown>).N = 1_048_576;
    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: Buffer.from(JSON.stringify(excessiveKdf)),
      secret: SECRET,
      owners: item.owners,
    }))).toBe("OWNER_ARCHIVE_ENVELOPE_INVALID");

    const payloadPath = "payload/v3.accounts/accounts.json";
    const tampered = await rewrapArchive({
      encryptedBytes: built.encryptedBytes,
      mutate: (entries) => {
        const original = entries.get(payloadPath)!;
        entries.set(payloadPath, Buffer.alloc(original.length, 0x78));
      },
    });
    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: tampered,
      secret: SECRET,
      owners: item.owners,
    }))).toBe("OWNER_ARCHIVE_ENTRY_CHECKSUM_MISMATCH");

    const missing = await rewrapArchive({
      encryptedBytes: built.encryptedBytes,
      mutate: (entries) => entries.delete(payloadPath),
    });
    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: missing,
      secret: SECRET,
      owners: item.owners,
    }))).toBe("OWNER_ARCHIVE_ENTRY_MISSING");

    const extra = await rewrapArchive({
      encryptedBytes: built.encryptedBytes,
      mutate: (entries) => entries.set("payload/v3.accounts/extra.json", Buffer.from("extra")),
    });
    expect(await errorCode(() => previewPlanningOwnerArchive({
      encryptedBytes: extra,
      secret: SECRET,
      owners: item.owners,
    }))).toBe("OWNER_ARCHIVE_ENTRY_UNEXPECTED");
  });

  it("rejects symlink sources, runtime-key encrypted stable payloads, and unsafe output paths", async () => {
    const root = createRoot("source-safety");
    const item = createContext(root);
    const batchDir = ownerLocation(item.owners, "v3.batches", "batches");
    const outside = path.join(root, "outside.json");
    writeBytes(outside, "{}\n");
    fs.mkdirSync(batchDir, { recursive: true });
    fs.symlinkSync(outside, path.join(batchDir, "linked.json"));

    expect(await errorCode(() => buildArchive(item))).toBe("OWNER_SOURCE_LINK_NOT_ALLOWED");
    fs.rmSync(path.join(batchDir, "linked.json"));

    writeBytes(path.join(ownerLocation(item.owners, "stable.profile-run-vault", "profiles"), "encrypted.json"), JSON.stringify({
      version: 2,
      alg: "aes-256-gcm",
      enc: "key",
      iv: "AA==",
      tag: "AA==",
      ciphertext: "AA==",
    }));
    expect(await errorCode(() => buildArchive(item))).toBe("OWNER_PORTABLE_EXPORT_UNAVAILABLE");

    writeBytes(path.join(ownerLocation(item.owners, "stable.profile-run-vault", "profiles"), "encrypted.json"), JSON.stringify({
      version: 2,
      alg: "aes-256-gcm",
      enc: "key",
      iv: 123,
      tag: "AA==",
      ciphertext: "AA==",
    }));
    expect(await errorCode(() => buildArchive(item))).toBe("OWNER_STABLE_ENCRYPTED_PAYLOAD_INVALID");

    writeBytes(
      path.join(ownerLocation(item.owners, "stable.profile-run-vault", "profiles"), "encrypted.json"),
      '{"version":2,"alg":"aes-256-gcm"',
    );
    expect(await errorCode(() => buildArchive(item))).toBe("OWNER_STABLE_PAYLOAD_INVALID");

    const ownedOutput = ownerLocation(item.owners, "v3.accounts", "accounts.json");
    expect(await errorCode(() => runV3OwnerExport({
      cwd: root,
      out: ownedOutput,
      now: new Date(GENERATED_AT),
      appVersion: "1.0.4",
      secret: SECRET,
      confirmQuiesced: true,
      env: { NODE_ENV: "test" },
      platform: "linux",
    }))).toBe("OWNER_ARCHIVE_PATH_OWNED");

    const outputAlias = path.join(root, "owner-output-alias");
    fs.symlinkSync(batchDir, outputAlias, "dir");
    const aliasArchivePath = path.join(outputAlias, "backup.owner.enc.json");
    expect(await errorCode(() => runV3OwnerExport({
      cwd: root,
      out: aliasArchivePath,
      now: new Date(GENERATED_AT),
      appVersion: "1.0.4",
      secret: SECRET,
      confirmQuiesced: true,
      env: { NODE_ENV: "test" },
      platform: "linux",
    }))).toBe("OWNER_AUXILIARY_PATH_LINK_NOT_ALLOWED");
    expect(fs.existsSync(path.join(batchDir, "backup.owner.enc.json"))).toBe(false);

    const ownedNewParent = path.join(batchDir, "must-not-be-created");
    expect(await errorCode(() => writePlanningOwnerArchiveFile({
      archivePath: path.join(ownedNewParent, "backup.owner.enc.json"),
      encryptedBytes: Buffer.from("complete-owner-archive"),
      owners: item.owners,
      platform: "linux",
    }))).toBe("OWNER_ARCHIVE_PATH_OWNED");
    expect(fs.existsSync(ownedNewParent)).toBe(false);

    const safeDirectory = path.join(root, "safe-owner-exports");
    const safeArchive = path.join(safeDirectory, "backup.owner.enc.json");
    const completeArchive = Buffer.from("complete-owner-archive");
    await writePlanningOwnerArchiveFile({
      archivePath: safeArchive,
      encryptedBytes: completeArchive,
      owners: item.owners,
      platform: "linux",
    });
    expect(fs.readFileSync(safeArchive)).toEqual(completeArchive);
    expect(fs.readdirSync(safeDirectory).some((name) => name.startsWith(".planning-owner-"))).toBe(false);
    expect(await errorCode(() => writePlanningOwnerArchiveFile({
      archivePath: safeArchive,
      encryptedBytes: Buffer.from("replacement"),
      owners: item.owners,
      platform: "linux",
    }))).toBe("OWNER_ARCHIVE_OUTPUT_EXISTS");
    expect(fs.readFileSync(safeArchive)).toEqual(completeArchive);

    const unsafeSharedDirectory = path.join(root, "unsafe-shared-owner-exports");
    fs.mkdirSync(unsafeSharedDirectory, { mode: 0o777 });
    fs.chmodSync(unsafeSharedDirectory, 0o777);
    expect(await errorCode(() => writePlanningOwnerArchiveFile({
      archivePath: path.join(unsafeSharedDirectory, "backup.owner.enc.json"),
      encryptedBytes: completeArchive,
      owners: item.owners,
      platform: "linux",
    }))).toBe("OWNER_ARCHIVE_OUTPUT_DIRECTORY_UNTRUSTED");
    expect(fs.readdirSync(unsafeSharedDirectory)).toHaveLength(0);

    const windowsOutputParent = path.join(root, "windows-output-must-not-exist");
    expect(await errorCode(() => writePlanningOwnerArchiveFile({
      archivePath: path.join(windowsOutputParent, "backup.owner.enc.json"),
      encryptedBytes: completeArchive,
      owners: item.owners,
      platform: "win32",
    }))).toBe("OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED");
    expect(fs.existsSync(windowsOutputParent)).toBe(false);
    expect(await errorCode(() => readPlanningOwnerSecretFile({
      secretPath: outside,
      platform: "win32",
    }))).toBe("OWNER_ARCHIVE_WINDOWS_ACL_UNVERIFIED");
  });

  it("requires quiesced confirmation and enforces bounded source files", async () => {
    const root = createRoot("limits");
    const item = createContext(root);
    writeBytes(ownerLocation(item.owners, "v3.accounts", "accounts.json"), "12345");

    expect(await errorCode(() => buildPlanningOwnerArchive({
      context: item.context,
      owners: item.owners,
      archiveId: ARCHIVE_ID,
      generatedAt: GENERATED_AT,
      appVersion: "1.0.4",
      secret: SECRET,
      confirmQuiesced: false,
    }))).toBe("OWNER_ARCHIVE_QUIESCED_CONFIRMATION_REQUIRED");

    expect(await errorCode(() => buildArchive({
      ...item,
      secret: Buffer.from("too-short"),
    }))).toBe("OWNER_ARCHIVE_SECRET_INVALID");

    expect(await errorCode(() => buildArchive({
      ...item,
      limits: {
        ...DEFAULT_PLANNING_OWNER_ARCHIVE_LIMITS,
        maxEntryBytes: 4,
      },
    }))).toBe("OWNER_ENTRY_SIZE_LIMIT_EXCEEDED");
  });

  it("strict ZIP mode rejects noncanonical names, directory records, and compressed limits", async () => {
    const base = encodeZip([{ path: "folder/file.txt", bytes: Buffer.from("payload") }]);
    const strict = {
      maxArchiveBytes: 1024 * 1024,
      maxCompressedEntryBytes: 1024,
      maxTotalCompressedBytes: 1024,
      rejectDirectoryEntries: true,
      rejectEncryptedEntries: true,
      rejectNonRegularEntries: true,
    };
    const decode = (bytes: Buffer, strictOptions = strict) => decodeZip(bytes, {
      maxEntries: 10,
      maxEntryBytes: 1024,
      maxTotalBytes: 2048,
      strict: strictOptions,
    });

    await expect(decode(replaceZipNames(base, "folder/file.txt", "folder\\file.txt")))
      .rejects.toThrow("INVALID_ZIP");
    const directory = replaceZipNames(
      encodeZip([{ path: "folder_", bytes: Buffer.from("payload") }]),
      "folder_",
      "folder/",
    );
    await expect(decode(directory)).rejects.toThrow("ZIP_DIRECTORY_ENTRY_NOT_ALLOWED");
    await expect(decode(base, { ...strict, maxCompressedEntryBytes: 1 }))
      .rejects.toThrow("ZIP_COMPRESSED_SIZE_LIMIT_EXCEEDED");
    await expect(decode(base, { ...strict, maxArchiveBytes: 1 }))
      .rejects.toThrow("ZIP_ARCHIVE_LIMIT_EXCEEDED");
    await expect(decode(withoutUtf8Flags(base))).rejects.toThrow("INVALID_ZIP_ENTRY");
    await expect(decode(withMalformedUtf8Name(base, "folder/file.txt")))
      .rejects.toThrow("INVALID_ZIP_ENTRY");
    await expect(decode(withUnicodePathExtraField(base))).rejects.toThrow("INVALID_ZIP_ENTRY");

    const dosDirectory = Buffer.from(base);
    const centralOffset = dosDirectory.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralOffset).toBeGreaterThanOrEqual(0);
    dosDirectory.writeUInt32LE(0x10, centralOffset + 38);
    await expect(decode(dosDirectory)).rejects.toThrow("ZIP_NON_REGULAR_ENTRY_NOT_ALLOWED");

    expect(() => encodeZip(Array.from({ length: 0x10000 }, (_, index) => ({
      path: `entry-${index}.txt`,
      bytes: Buffer.alloc(0),
    })))).toThrow("ZIP32_ENTRY_LIMIT_EXCEEDED");
  });

  it("supports opt-in owner CLI export and preview without exposing the secret", () => {
    const root = createRoot("cli");
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const exportEntrypoint = path.join(repositoryRoot, "src/lib/planning/v3/ops/export.ts");
    const restoreEntrypoint = path.join(repositoryRoot, "src/lib/planning/v3/ops/restore.ts");
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
    const secretPath = path.join(root, "owner-secret.txt");
    const archivePath = path.join(root, "owner-backup.enc.json");
    const secretText = "owner-cli-secret-never-log";
    writeBytes(secretPath, secretText);
    fs.chmodSync(secretPath, 0o600);
    const env = {
      ...process.env,
      NODE_ENV: "test",
      PLANNING_NAMESPACE_ENABLED: "false",
      PLANNING_SINGLE_USER_MODE: "false",
      PLANNING_USER_ID: "",
    } satisfies NodeJS.ProcessEnv;

    const exported = spawnSync(process.execPath, [
      tsxCli,
      "--tsconfig",
      path.join(repositoryRoot, "tsconfig.json"),
      exportEntrypoint,
      "--format=owner",
      `--passphrase-file=${secretPath}`,
      "--ack-quiesced",
      `--out=${archivePath}`,
    ], { cwd: root, env, encoding: "utf-8", timeout: 60_000 });
    expect(exported.status).toBe(0);
    expect(exported.stdout).toContain("format=planning-owner-vault-v1");
    expect(`${exported.stdout}${exported.stderr}`).not.toContain(secretText);
    expect(fs.existsSync(archivePath)).toBe(true);

    const previewed = spawnSync(process.execPath, [
      tsxCli,
      "--tsconfig",
      path.join(repositoryRoot, "tsconfig.json"),
      restoreEntrypoint,
      "--format=owner",
      `--passphrase-file=${secretPath}`,
      `--in=${archivePath}`,
    ], { cwd: root, env, encoding: "utf-8", timeout: 60_000 });
    expect(previewed.status).toBe(0);
    expect(previewed.stdout).toContain("owner archive preview completed");
    expect(`${previewed.stdout}${previewed.stderr}`).not.toContain(secretText);

    const literalSecret = spawnSync(process.execPath, [
      tsxCli,
      "--tsconfig",
      path.join(repositoryRoot, "tsconfig.json"),
      exportEntrypoint,
      "--format=owner",
      `--passphrase=${secretText}`,
    ], { cwd: root, env, encoding: "utf-8", timeout: 60_000 });
    expect(literalSecret.status).toBe(1);
    expect(literalSecret.stderr).toContain("ARG_FORBIDDEN:--passphrase=<literal>");
    expect(`${literalSecret.stdout}${literalSecret.stderr}`).not.toContain(secretText);

    const applyBlocked = spawnSync(process.execPath, [
      tsxCli,
      "--tsconfig",
      path.join(repositoryRoot, "tsconfig.json"),
      restoreEntrypoint,
      "--format=owner",
      `--passphrase-file=${path.join(root, "missing-secret")}`,
      `--in=${path.join(root, "missing-archive")}`,
      "--apply",
    ], { cwd: root, env, encoding: "utf-8", timeout: 60_000 });
    expect(applyBlocked.status).toBe(1);
    expect(applyBlocked.stderr).toContain("V3_RESTORE_APPLY_DISABLED");
    expect(applyBlocked.stderr).not.toContain("OWNER_ARCHIVE_SECRET_FILE_INVALID");
  }, 120_000);
});
