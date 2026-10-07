import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../planning/storage/atomicWrite";
import { resolveOpsDataDir } from "../../planning/storage/dataDir";
import { sanitizePlanningUserId } from "../../planning/store/namespace";
import {
  commitPlanningDataVaultExportCheckpoint,
  type PlanningDataVaultExportCheckpoint,
  type PlanningDataVaultExportCheckpointState,
  type PlanningDataVaultScope,
} from "./planningDataVault";

const EXPORT_RECEIPT_TOKEN_VERSION = 1 as const;
const EXPORT_RECEIPT_STORE_VERSION = 1 as const;
const EXPORT_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const EXPORT_RECEIPT_LOCK_STALE_MS = 60_000;
const EXPORT_RECEIPT_LOCK_WAIT_MS = 5_000;
const MAX_EXPORT_RECEIPTS = 200;
const EXPORT_RECEIPT_STORE_PATH = "backup/export-receipts.json";
const EXPORT_RECEIPT_STORE_UNAVAILABLE = "BACKUP_EXPORT_RECEIPT_STORE_UNAVAILABLE";

export const __BACKUP_EXPORT_RECEIPT_TTL_MS_FOR_TESTS = EXPORT_RECEIPT_TTL_MS;

type ExportReceiptStatus = "finalized" | "pending" | "superseded";

type ExportReceiptRecord = {
  checkpoint: PlanningDataVaultExportCheckpoint;
  createdAt: number;
  expiresAt: number;
  finalizedAt?: number;
  issuedOrdinal: number;
  scope: PlanningDataVaultScope;
  status: ExportReceiptStatus;
  userId: string;
};

type ExportReceiptStore = {
  hmacSecret: string;
  lastIssuedOrdinal: number;
  latestFinalizedByContext: Record<string, number>;
  receipts: Record<string, ExportReceiptRecord>;
  updatedAt: string;
  version: typeof EXPORT_RECEIPT_STORE_VERSION;
};

type ExportReceiptTokenPayload = {
  expiresAt: number;
  tokenId: string;
  v: typeof EXPORT_RECEIPT_TOKEN_VERSION;
};

export type BackupExportFinalizeResult =
  | { ok: true; status: "already-finalized" | "committed" | "superseded" }
  | {
    ok: false;
    reason: "context-mismatch" | "expired" | "invalid" | "missing";
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalSha256(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && /^[a-f0-9]{64}$/u.test(value));
}

function parseCheckpointState(value: unknown): PlanningDataVaultExportCheckpointState | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || !isIso(value.updatedAt) || !isNonNegativeInteger(value.lastJournalOffset)) {
    return null;
  }
  if (value.lastExportAt !== undefined && !isIso(value.lastExportAt)) return null;
  if (!isOptionalSha256(value.runsIndexHash)) return null;
  const boundary = value.lastJournalBoundary;
  if (boundary !== undefined) {
    if (!isRecord(boundary) || !isNonNegativeInteger(boundary.offset) || boundary.offset < 1) return null;
    if (typeof boundary.tailHash !== "string" || !/^[a-f0-9]{64}$/u.test(boundary.tailHash)) return null;
  }
  const scan = value.lastJournalScan;
  if (scan !== undefined) {
    if (!isRecord(scan) || (scan.mode !== "offset" && scan.mode !== "full-scan")) return null;
    if (!isNonNegativeInteger(scan.startOffset)) return null;
    const fallback = scan.fallbackReason;
    if (
      fallback !== undefined
      && fallback !== "previous-offset-out-of-range"
      && fallback !== "previous-boundary-missing"
      && fallback !== "previous-boundary-mismatch"
      && fallback !== "previous-tail-mismatch"
    ) {
      return null;
    }
  }
  return value as PlanningDataVaultExportCheckpointState;
}

function parseCheckpoint(value: unknown): PlanningDataVaultExportCheckpoint | null {
  if (!isRecord(value) || typeof value.statePath !== "string" || !path.isAbsolute(value.statePath)) return null;
  const state = parseCheckpointState(value.state);
  if (!state) return null;
  return {
    statePath: value.statePath,
    state,
  };
}

function parseReceipt(value: unknown): ExportReceiptRecord | null {
  if (!isRecord(value)) return null;
  if (!isNonNegativeInteger(value.createdAt) || !isNonNegativeInteger(value.expiresAt)) return null;
  if (!isNonNegativeInteger(value.issuedOrdinal)) return null;
  if (value.status !== "pending" && value.status !== "finalized" && value.status !== "superseded") return null;
  if (value.scope !== "ops" && value.scope !== "user") return null;
  let userId: string;
  try {
    userId = sanitizePlanningUserId(value.userId);
  } catch {
    return null;
  }
  if (value.finalizedAt !== undefined && !isNonNegativeInteger(value.finalizedAt)) return null;
  const checkpoint = parseCheckpoint(value.checkpoint);
  if (!checkpoint) return null;
  return {
    checkpoint,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    ...(typeof value.finalizedAt === "number" ? { finalizedAt: value.finalizedAt } : {}),
    issuedOrdinal: value.issuedOrdinal,
    scope: value.scope,
    status: value.status,
    userId,
  };
}

function parseStore(value: unknown): ExportReceiptStore | null {
  if (!isRecord(value) || value.version !== EXPORT_RECEIPT_STORE_VERSION) return null;
  if (typeof value.hmacSecret !== "string" || !/^[A-Za-z0-9_-]{32,}$/u.test(value.hmacSecret)) return null;
  if (!isNonNegativeInteger(value.lastIssuedOrdinal)) return null;
  if (!isRecord(value.latestFinalizedByContext) || !isRecord(value.receipts)) return null;
  const latestFinalizedByContext: Record<string, number> = {};
  for (const [key, ordinal] of Object.entries(value.latestFinalizedByContext)) {
    if (!/^(ops|user):[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(key) || !isNonNegativeInteger(ordinal)) {
      return null;
    }
    latestFinalizedByContext[key] = ordinal;
  }
  const receipts: Record<string, ExportReceiptRecord> = {};
  for (const [tokenId, rawReceipt] of Object.entries(value.receipts)) {
    if (!/^[A-Za-z0-9_-]{16,}$/u.test(tokenId)) return null;
    const receipt = parseReceipt(rawReceipt);
    if (!receipt) return null;
    receipts[tokenId] = receipt;
  }
  return {
    hmacSecret: value.hmacSecret,
    lastIssuedOrdinal: value.lastIssuedOrdinal,
    latestFinalizedByContext,
    receipts,
    updatedAt: isIso(value.updatedAt) ? value.updatedAt : new Date(0).toISOString(),
    version: EXPORT_RECEIPT_STORE_VERSION,
  };
}

function createEmptyStore(): ExportReceiptStore {
  return {
    hmacSecret: crypto.randomBytes(32).toString("base64url"),
    lastIssuedOrdinal: 0,
    latestFinalizedByContext: {},
    receipts: {},
    updatedAt: new Date().toISOString(),
    version: EXPORT_RECEIPT_STORE_VERSION,
  };
}

function receiptStorePath(): string {
  return path.join(resolveOpsDataDir(), EXPORT_RECEIPT_STORE_PATH);
}

function receiptLockPath(): string {
  return `${receiptStorePath()}.lock`;
}

function toStoreUnavailable(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith(EXPORT_RECEIPT_STORE_UNAVAILABLE)) return error;
  const wrapped = new Error(EXPORT_RECEIPT_STORE_UNAVAILABLE);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

async function readStore(): Promise<ExportReceiptStore> {
  try {
    const parsed = parseStore(JSON.parse(await fs.readFile(receiptStorePath(), "utf-8")) as unknown);
    if (!parsed) throw new Error("invalid backup export receipt store");
    return parsed;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return createEmptyStore();
    throw toStoreUnavailable(error);
  }
}

async function writeStore(store: ExportReceiptStore): Promise<void> {
  try {
    await atomicWriteJson(receiptStorePath(), {
      ...store,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw toStoreUnavailable(error);
  }
}

async function clearStaleLock(lockPath: string): Promise<"active" | "removed"> {
  try {
    const raw = JSON.parse(await fs.readFile(lockPath, "utf-8")) as unknown;
    if (!isRecord(raw) || !isNonNegativeInteger(raw.createdAt)) {
      throw new Error("invalid backup export receipt lock");
    }
    if (Date.now() - raw.createdAt < EXPORT_RECEIPT_LOCK_STALE_MS) return "active";
    await fs.unlink(lockPath);
    return "removed";
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return "removed";
    throw toStoreUnavailable(error);
  }
}

async function withStoreLock<T>(callback: () => Promise<T>): Promise<T> {
  const lockPath = receiptLockPath();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + EXPORT_RECEIPT_LOCK_WAIT_MS;
  while (Date.now() <= deadline) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }));
        await handle.sync();
      } finally {
        await handle.close().catch(() => undefined);
      }
      try {
        return await callback();
      } finally {
        await fs.unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "EEXIST") throw toStoreUnavailable(error);
      if (await clearStaleLock(lockPath) === "removed") continue;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw toStoreUnavailable(new Error("backup export receipt lock timeout"));
}

function contextKey(scope: PlanningDataVaultScope, userId: string): string {
  return `${scope}:${sanitizePlanningUserId(userId)}`;
}

function pruneAndTrim(store: ExportReceiptStore, nowMs: number): void {
  for (const [tokenId, receipt] of Object.entries(store.receipts)) {
    if (receipt.expiresAt <= nowMs) delete store.receipts[tokenId];
  }
  while (Object.keys(store.receipts).length > MAX_EXPORT_RECEIPTS) {
    const removable = Object.entries(store.receipts)
      .sort((left, right) => {
        const leftPending = left[1].status === "pending" ? 1 : 0;
        const rightPending = right[1].status === "pending" ? 1 : 0;
        return leftPending - rightPending || left[1].createdAt - right[1].createdAt;
      })[0]?.[0];
    if (!removable) break;
    delete store.receipts[removable];
  }
}

function encodePayload(payload: ExportReceiptTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodePayload(body: string): ExportReceiptTokenPayload | null {
  try {
    const raw = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as unknown;
    if (!isRecord(raw) || raw.v !== EXPORT_RECEIPT_TOKEN_VERSION) return null;
    if (typeof raw.tokenId !== "string" || !/^[A-Za-z0-9_-]{16,}$/u.test(raw.tokenId)) return null;
    if (!isNonNegativeInteger(raw.expiresAt)) return null;
    return { expiresAt: raw.expiresAt, tokenId: raw.tokenId, v: EXPORT_RECEIPT_TOKEN_VERSION };
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", Buffer.from(secret, "base64url")).update(body).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export async function createBackupExportReceipt(input: {
  checkpoint: PlanningDataVaultExportCheckpoint;
  nowMs?: number;
  scope: PlanningDataVaultScope;
  userId: string;
}): Promise<string> {
  try {
    return await withStoreLock(async () => {
      const nowMs = Math.max(0, Math.trunc(input.nowMs ?? Date.now()));
      const store = await readStore();
      pruneAndTrim(store, nowMs);
      const userId = sanitizePlanningUserId(input.userId);
      const tokenId = crypto.randomBytes(24).toString("base64url");
      const issuedOrdinal = Math.max(nowMs, store.lastIssuedOrdinal + 1);
      const expiresAt = nowMs + EXPORT_RECEIPT_TTL_MS;
      store.lastIssuedOrdinal = issuedOrdinal;
      store.receipts[tokenId] = {
        checkpoint: input.checkpoint,
        createdAt: nowMs,
        expiresAt,
        issuedOrdinal,
        scope: input.scope,
        status: "pending",
        userId,
      };
      pruneAndTrim(store, nowMs);
      await writeStore(store);
      const body = encodePayload({ expiresAt, tokenId, v: EXPORT_RECEIPT_TOKEN_VERSION });
      return `${body}.${sign(body, store.hmacSecret)}`;
    });
  } catch (error) {
    throw toStoreUnavailable(error);
  }
}

export async function finalizeBackupExportReceipt(input: {
  nowMs?: number;
  receipt: string;
  scope: PlanningDataVaultScope;
  userId: string;
}): Promise<BackupExportFinalizeResult> {
  const normalized = input.receipt.trim();
  if (!normalized) return { ok: false, reason: "missing" };
  const [body, signature, ...extra] = normalized.split(".");
  if (!body || !signature || extra.length > 0) return { ok: false, reason: "invalid" };
  const payload = decodePayload(body);
  if (!payload) return { ok: false, reason: "invalid" };

  try {
    return await withStoreLock(async () => {
      const nowMs = Math.max(0, Math.trunc(input.nowMs ?? Date.now()));
      const store = await readStore();
      const receipt = store.receipts[payload.tokenId];
      if (!safeEqual(signature, sign(body, store.hmacSecret))) {
        return { ok: false, reason: "invalid" };
      }
      if (!receipt) {
        return { ok: false, reason: payload.expiresAt <= nowMs ? "expired" : "invalid" };
      }
      if (payload.expiresAt !== receipt.expiresAt) return { ok: false, reason: "invalid" };
      if (payload.expiresAt <= nowMs || receipt.expiresAt <= nowMs) {
        delete store.receipts[payload.tokenId];
        await writeStore(store);
        return { ok: false, reason: "expired" };
      }
      const userId = sanitizePlanningUserId(input.userId);
      if (receipt.userId !== userId || receipt.scope !== input.scope) {
        return { ok: false, reason: "context-mismatch" };
      }
      if (receipt.status === "finalized") return { ok: true, status: "already-finalized" };
      if (receipt.status === "superseded") return { ok: true, status: "superseded" };

      const key = contextKey(input.scope, userId);
      if ((store.latestFinalizedByContext[key] ?? 0) > receipt.issuedOrdinal) {
        receipt.status = "superseded";
        await writeStore(store);
        return { ok: true, status: "superseded" };
      }

      const committed = await commitPlanningDataVaultExportCheckpoint(receipt.checkpoint, {
        scope: input.scope,
        userId,
      });
      if (committed === "superseded") {
        receipt.status = "superseded";
        await writeStore(store);
        return { ok: true, status: "superseded" };
      }

      receipt.status = "finalized";
      receipt.finalizedAt = nowMs;
      store.latestFinalizedByContext[key] = Math.max(
        store.latestFinalizedByContext[key] ?? 0,
        receipt.issuedOrdinal,
      );
      await writeStore(store);
      return {
        ok: true,
        status: committed === "already-committed" ? "already-finalized" : "committed",
      };
    });
  } catch (error) {
    throw toStoreUnavailable(error);
  }
}

export async function resetBackupExportReceiptsForTests(): Promise<void> {
  await fs.unlink(receiptStorePath()).catch(() => undefined);
  await fs.unlink(receiptLockPath()).catch(() => undefined);
}
