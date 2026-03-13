import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "./atomicWrite";
import { resolvePlanningDataDir } from "../server/runtime/dataDir";

export type StorageTxKind = "RUN_CREATE" | "RUN_INDEX_UPDATE" | "SNAPSHOT_WRITE" | "MIGRATION_APPLY" | "OPS_ACTION_RUN";
export type StorageTxOutcome = "COMMIT" | "ROLLBACK" | "RECOVERED_COMMIT" | "RECOVERED_ROLLBACK";

type StorageJournalBase = {
  version: 1;
  txId: string;
  kind: StorageTxKind;
  at: string;
};

type StorageJournalBegin = StorageJournalBase & {
  event: "BEGIN";
  payload?: Record<string, unknown>;
};

type StorageJournalStep = StorageJournalBase & {
  event: "STEP";
  step: string;
  payload?: Record<string, unknown>;
};

type StorageJournalEnd = StorageJournalBase & {
  event: "COMMIT" | "ROLLBACK" | "RECOVERED_COMMIT" | "RECOVERED_ROLLBACK";
  note?: string;
};

export type StorageJournalEvent = StorageJournalBegin | StorageJournalStep | StorageJournalEnd;

export type StorageTransactionContext = {
  txId: string;
  kind: StorageTxKind;
};

export type PendingStorageTransaction = {
  begin: StorageJournalBegin;
  steps: StorageJournalStep[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveJournalPath(): string {
  const override = asString(process.env.PLANNING_STORAGE_JOURNAL_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolvePlanningDataDir(), "storage", "journal.ndjson");
}

async function appendLine(filePath: string, line: string): Promise<void> {
  const dirPath = path.dirname(filePath);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      await fs.appendFile(filePath, line, "utf-8");
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT" || attempt > 0) throw error;
    }
  }
}

async function appendEvent(event: StorageJournalEvent): Promise<void> {
  const filePath = resolveJournalPath();
  await appendLine(filePath, `${JSON.stringify(event)}\n`);
}

function createTxId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeKind(value: unknown): StorageTxKind | null {
  const kind = asString(value).toUpperCase();
  if (
    kind === "RUN_CREATE"
    || kind === "RUN_INDEX_UPDATE"
    || kind === "SNAPSHOT_WRITE"
    || kind === "MIGRATION_APPLY"
    || kind === "OPS_ACTION_RUN"
  ) {
    return kind;
  }
  return null;
}

function parseEvent(raw: unknown): StorageJournalEvent | null {
  if (!isRecord(raw)) return null;
  if (Math.trunc(Number(raw.version)) !== 1) return null;
  const txId = asString(raw.txId);
  const kind = normalizeKind(raw.kind);
  const at = asString(raw.at);
  const event = asString(raw.event).toUpperCase();
  if (!txId || !kind || !at) return null;

  if (event === "BEGIN") {
    return {
      version: 1,
      event: "BEGIN",
      txId,
      kind,
      at,
      ...(isRecord(raw.payload) ? { payload: raw.payload } : {}),
    };
  }

  if (event === "STEP") {
    const step = asString(raw.step);
    if (!step) return null;
    return {
      version: 1,
      event: "STEP",
      txId,
      kind,
      at,
      step,
      ...(isRecord(raw.payload) ? { payload: raw.payload } : {}),
    };
  }

  if (
    event === "COMMIT"
    || event === "ROLLBACK"
    || event === "RECOVERED_COMMIT"
    || event === "RECOVERED_ROLLBACK"
  ) {
    return {
      version: 1,
      event,
      txId,
      kind,
      at,
      ...(asString(raw.note) ? { note: asString(raw.note) } : {}),
    };
  }

  return null;
}

export async function beginStorageTransaction(
  kind: StorageTxKind,
  payload?: Record<string, unknown>,
): Promise<StorageTransactionContext> {
  const ctx: StorageTransactionContext = {
    txId: createTxId(),
    kind,
  };
  await appendEvent({
    version: 1,
    event: "BEGIN",
    txId: ctx.txId,
    kind: ctx.kind,
    at: nowIso(),
    ...(payload ? { payload } : {}),
  });
  return ctx;
}

export async function appendStorageTransactionStep(
  ctx: StorageTransactionContext,
  step: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const normalizedStep = asString(step);
  if (!normalizedStep) return;
  await appendEvent({
    version: 1,
    event: "STEP",
    txId: ctx.txId,
    kind: ctx.kind,
    at: nowIso(),
    step: normalizedStep,
    ...(payload ? { payload } : {}),
  });
}

export async function endStorageTransaction(
  ctx: StorageTransactionContext,
  outcome: StorageTxOutcome,
  note?: string,
): Promise<void> {
  await appendEvent({
    version: 1,
    event: outcome,
    txId: ctx.txId,
    kind: ctx.kind,
    at: nowIso(),
    ...(asString(note) ? { note: asString(note) } : {}),
  });
}

export async function readStorageJournalEvents(): Promise<StorageJournalEvent[]> {
  const filePath = resolveJournalPath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const lines = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const events: StorageJournalEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = parseEvent(JSON.parse(line) as unknown);
      if (parsed) events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}

export async function listPendingStorageTransactions(): Promise<PendingStorageTransaction[]> {
  const events = await readStorageJournalEvents();
  const grouped = new Map<string, StorageJournalEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.txId) ?? [];
    list.push(event);
    grouped.set(event.txId, list);
  }

  const pending: PendingStorageTransaction[] = [];
  for (const txEvents of grouped.values()) {
    const begin = txEvents.find((event): event is StorageJournalBegin => event.event === "BEGIN");
    if (!begin) continue;
    const isClosed = txEvents.some((event) => (
      event.event === "COMMIT"
      || event.event === "ROLLBACK"
      || event.event === "RECOVERED_COMMIT"
      || event.event === "RECOVERED_ROLLBACK"
    ));
    if (isClosed) continue;
    const steps = txEvents.filter((event): event is StorageJournalStep => event.event === "STEP");
    pending.push({ begin, steps });
  }

  return pending.sort((a, b) => a.begin.at.localeCompare(b.begin.at));
}

export async function compactStorageJournal(options?: {
  keepLast?: number;
}): Promise<void> {
  const keepLast = Math.max(100, Math.trunc(Number(options?.keepLast) || 2000));
  const events = await readStorageJournalEvents();
  if (events.length <= keepLast) return;
  const kept = events.slice(-keepLast);
  const content = kept.map((event) => JSON.stringify(event)).join("\n");
  await atomicWriteFile(resolveJournalPath(), `${content}\n`);
}

export function getStorageJournalPath(): string {
  return resolveJournalPath();
}
