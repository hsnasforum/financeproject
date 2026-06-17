import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../planning/storage/atomicWrite";
import { resolveOpsDataDir } from "../../planning/storage/dataDir";

const BACKUP_PREVIEW_TOKEN_VERSION = 1;
const BACKUP_PREVIEW_RECEIPT_STORE_VERSION = 1;
const BACKUP_PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_BACKUP_PREVIEW_RECEIPTS = 200;
const BACKUP_PREVIEW_RECEIPT_LOCK_STALE_MS = 30_000;
const BACKUP_PREVIEW_RECEIPT_STORE_PATH = "backup/preview-receipts.json";
const BACKUP_PREVIEW_RECEIPT_STORE_UNAVAILABLE = "BACKUP_RECEIPT_STORE_UNAVAILABLE";

export const __BACKUP_PREVIEW_TOKEN_TTL_MS_FOR_TESTS = BACKUP_PREVIEW_TOKEN_TTL_MS;

type BackupPreviewTokenPayload = {
  expiresAt: number;
  tokenId: string;
  v: typeof BACKUP_PREVIEW_TOKEN_VERSION;
};

type BackupPreviewTokenInput = {
  archiveBytes: Uint8Array | Buffer;
  nowMs?: number;
  passphrase: string;
  sessionToken: string;
};

type BackupPreviewReceipt = {
  archiveSha256: string;
  createdAt: number;
  expiresAt: number;
  passphraseSha256: string;
  sessionSha256: string;
};

type BackupPreviewReceiptStore = {
  hmacSecret: string;
  receipts: Record<string, BackupPreviewReceipt>;
  updatedAt: string;
  version: typeof BACKUP_PREVIEW_RECEIPT_STORE_VERSION;
};

export type BackupPreviewTokenVerification =
  | { ok: true }
  | {
    ok: false;
    reason: "archive-mismatch" | "expired" | "invalid" | "missing" | "passphrase-mismatch" | "session-mismatch";
  };

function sha256Hex(input: Uint8Array | Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function resolveBackupPreviewReceiptStorePath(): string {
  return path.join(resolveOpsDataDir(), BACKUP_PREVIEW_RECEIPT_STORE_PATH);
}

function resolveBackupPreviewReceiptLockPath(): string {
  return `${resolveBackupPreviewReceiptStorePath()}.lock`;
}

function buildSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function signTokenBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", Buffer.from(secret, "base64url")).update(body).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isReceiptStoreUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(BACKUP_PREVIEW_RECEIPT_STORE_UNAVAILABLE);
}

function toReceiptStoreUnavailableError(error: unknown): Error {
  if (isReceiptStoreUnavailableError(error)) return error;
  const wrapped = new Error(BACKUP_PREVIEW_RECEIPT_STORE_UNAVAILABLE);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isReceipt(value: unknown): value is BackupPreviewReceipt {
  if (!isRecord(value)) return false;
  return isSha256Hex(value.archiveSha256)
    && typeof value.createdAt === "number"
    && Number.isFinite(value.createdAt)
    && typeof value.expiresAt === "number"
    && Number.isFinite(value.expiresAt)
    && isSha256Hex(value.passphraseSha256)
    && isSha256Hex(value.sessionSha256);
}

function parseReceiptStore(raw: unknown): BackupPreviewReceiptStore | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== BACKUP_PREVIEW_RECEIPT_STORE_VERSION) return null;
  if (typeof raw.hmacSecret !== "string" || !/^[A-Za-z0-9_-]{32,}$/u.test(raw.hmacSecret)) return null;
  if (!isRecord(raw.receipts)) return null;
  const receipts = Object.fromEntries(
    Object.entries(raw.receipts)
      .filter(([tokenId, receipt]) => /^[A-Za-z0-9_-]{16,}$/u.test(tokenId) && isReceipt(receipt)),
  ) as Record<string, BackupPreviewReceipt>;
  return {
    hmacSecret: raw.hmacSecret,
    receipts,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    version: BACKUP_PREVIEW_RECEIPT_STORE_VERSION,
  };
}

function createEmptyReceiptStore(): BackupPreviewReceiptStore {
  return {
    hmacSecret: buildSecret(),
    receipts: {},
    updatedAt: new Date().toISOString(),
    version: BACKUP_PREVIEW_RECEIPT_STORE_VERSION,
  };
}

async function readReceiptStore(): Promise<BackupPreviewReceiptStore> {
  try {
    const raw = await fs.readFile(resolveBackupPreviewReceiptStorePath(), "utf-8");
    const parsed = parseReceiptStore(JSON.parse(raw) as unknown);
    return parsed ?? createEmptyReceiptStore();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return createEmptyReceiptStore();
    if (error instanceof SyntaxError) return createEmptyReceiptStore();
    throw error;
  }
}

async function writeReceiptStore(store: BackupPreviewReceiptStore): Promise<void> {
  await atomicWriteJson(resolveBackupPreviewReceiptStorePath(), {
    ...store,
    updatedAt: new Date().toISOString(),
  });
}

type BackupPreviewReceiptLockState =
  | { status: "active" }
  | { status: "removed" }
  | { error: unknown; status: "unavailable" };

async function clearStaleLock(lockPath: string): Promise<BackupPreviewReceiptLockState> {
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw) as { createdAt?: unknown };
    if (typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) {
      return { error: new Error("Invalid backup preview receipt lock metadata"), status: "unavailable" };
    }
    if (Date.now() - parsed.createdAt < BACKUP_PREVIEW_RECEIPT_LOCK_STALE_MS) return { status: "active" };
    await fs.unlink(lockPath);
    return { status: "removed" };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return { status: "removed" };
    return { error, status: "unavailable" };
  }
}

async function withReceiptStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = resolveBackupPreviewReceiptLockPath();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }));
      } finally {
        await handle.close().catch(() => undefined);
      }
      try {
        return await fn();
      } finally {
        await fs.unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "EEXIST") throw error;
      const lockState = await clearStaleLock(lockPath);
      if (lockState.status === "unavailable") {
        throw toReceiptStoreUnavailableError(lockState.error);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function pruneExpiredReceipts(store: BackupPreviewReceiptStore, nowMs: number): boolean {
  let changed = false;
  for (const [tokenId, receipt] of Object.entries(store.receipts)) {
    if (receipt.expiresAt <= nowMs) {
      delete store.receipts[tokenId];
      changed = true;
    }
  }
  return changed;
}

function trimReceiptStore(store: BackupPreviewReceiptStore): boolean {
  let changed = false;
  while (Object.keys(store.receipts).length > MAX_BACKUP_PREVIEW_RECEIPTS) {
    const oldest = Object.entries(store.receipts)
      .sort((left, right) => left[1].createdAt - right[1].createdAt)[0]?.[0];
    if (!oldest) return changed;
    delete store.receipts[oldest];
    changed = true;
  }
  return changed;
}

function removeReceipt(store: BackupPreviewReceiptStore, tokenId: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(store.receipts, tokenId)) return false;
  delete store.receipts[tokenId];
  return true;
}

function buildReceipt({ archiveBytes, nowMs, passphrase, sessionToken }: BackupPreviewTokenInput): BackupPreviewReceipt {
  const issuedAt = typeof nowMs === "number" ? nowMs : Date.now();
  return {
    archiveSha256: sha256Hex(Buffer.from(archiveBytes)),
    createdAt: issuedAt,
    expiresAt: issuedAt + BACKUP_PREVIEW_TOKEN_TTL_MS,
    passphraseSha256: sha256Hex(passphrase),
    sessionSha256: sha256Hex(sessionToken),
  };
}

function encodePayload(payload: BackupPreviewTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodePayload(body: string): BackupPreviewTokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Partial<BackupPreviewTokenPayload>;
    if (record.v !== BACKUP_PREVIEW_TOKEN_VERSION) return null;
    if (typeof record.tokenId !== "string" || !/^[A-Za-z0-9_-]{16,}$/u.test(record.tokenId)) return null;
    if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
    return {
      expiresAt: record.expiresAt,
      tokenId: record.tokenId,
      v: BACKUP_PREVIEW_TOKEN_VERSION,
    };
  } catch {
    return null;
  }
}

export async function createBackupPreviewToken(input: BackupPreviewTokenInput): Promise<string> {
  const issuedAt = typeof input.nowMs === "number" ? input.nowMs : Date.now();
  try {
    return await withReceiptStoreLock(async () => {
      const store = await readReceiptStore();
      pruneExpiredReceipts(store, issuedAt);
      const tokenId = crypto.randomBytes(24).toString("base64url");
      const receipt = buildReceipt({
        ...input,
        nowMs: issuedAt,
      });
      store.receipts[tokenId] = receipt;
      trimReceiptStore(store);
      await writeReceiptStore(store);
      const body = encodePayload({
        expiresAt: receipt.expiresAt,
        tokenId,
        v: BACKUP_PREVIEW_TOKEN_VERSION,
      });
      return `${body}.${signTokenBody(body, store.hmacSecret)}`;
    });
  } catch (error) {
    throw toReceiptStoreUnavailableError(error);
  }
}

export async function consumeBackupPreviewToken(
  token: string,
  input: BackupPreviewTokenInput,
): Promise<BackupPreviewTokenVerification> {
  const normalized = token.trim();
  if (!normalized) return { ok: false, reason: "missing" };
  const [body, signature, ...extra] = normalized.split(".");
  if (!body || !signature || extra.length > 0) return { ok: false, reason: "invalid" };
  const payload = decodePayload(body);
  if (!payload) return { ok: false, reason: "invalid" };
  const nowMs = typeof input.nowMs === "number" ? input.nowMs : Date.now();
  try {
    return await withReceiptStoreLock(async () => {
      const store = await readReceiptStore();
      const pruned = pruneExpiredReceipts(store, nowMs);
      let changed = pruned;
      if (!safeEqual(signature, signTokenBody(body, store.hmacSecret))) {
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "invalid" };
      }
      const receipt = store.receipts[payload.tokenId];
      if (!receipt) {
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: payload.expiresAt <= nowMs ? "expired" : "invalid" };
      }
      if (payload.expiresAt <= nowMs || receipt.expiresAt <= nowMs) {
        changed = removeReceipt(store, payload.tokenId) || changed;
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "expired" };
      }
      if (receipt.expiresAt !== payload.expiresAt) {
        changed = removeReceipt(store, payload.tokenId) || changed;
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "invalid" };
      }
      const expected = buildReceipt({
        archiveBytes: input.archiveBytes,
        nowMs: receipt.createdAt,
        passphrase: input.passphrase,
        sessionToken: input.sessionToken,
      });
      if (receipt.archiveSha256 !== expected.archiveSha256) {
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "archive-mismatch" };
      }
      if (receipt.passphraseSha256 !== expected.passphraseSha256) {
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "passphrase-mismatch" };
      }
      if (receipt.sessionSha256 !== expected.sessionSha256) {
        if (changed) await writeReceiptStore(store);
        return { ok: false, reason: "session-mismatch" };
      }
      changed = removeReceipt(store, payload.tokenId) || changed;
      if (changed) await writeReceiptStore(store);
      return { ok: true };
    });
  } catch (error) {
    throw toReceiptStoreUnavailableError(error);
  }
}

export async function resetBackupPreviewTokensForTests(): Promise<void> {
  await fs.unlink(resolveBackupPreviewReceiptStorePath()).catch(() => undefined);
  await fs.unlink(resolveBackupPreviewReceiptLockPath()).catch(() => undefined);
}
