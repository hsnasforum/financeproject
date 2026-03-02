import fs from "node:fs/promises";
import path from "node:path";
import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { type AssumptionsSnapshot } from "./types.ts";
import { ASSUMPTIONS_SCHEMA_VERSION } from "../v2/schemaVersion";

export const ASSUMPTIONS_PATH = ".data/planning/assumptions.latest.json";
export const ASSUMPTIONS_HISTORY_DIR = ".data/planning/assumptions/history";

export type SnapshotRef = {
  id: string;
  asOf?: string;
  fetchedAt: string;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning assumptions storage is server-only.");
  }
}

assertServerOnly();

function resolveAssumptionsPath(): string {
  const override = process.env.PLANNING_ASSUMPTIONS_PATH?.trim();
  return path.resolve(process.cwd(), override || ASSUMPTIONS_PATH);
}

function resolveHistoryDir(): string {
  const override = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR?.trim();
  return path.resolve(process.cwd(), override || ASSUMPTIONS_HISTORY_DIR);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSnapshot(value: unknown): value is AssumptionsSnapshot {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.schemaVersion !== undefined) {
    const schemaVersion = Math.trunc(Number(value.schemaVersion));
    if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > ASSUMPTIONS_SCHEMA_VERSION) return false;
  }
  if (typeof value.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)) return false;
  if (typeof value.fetchedAt !== "string") return false;

  if (!isRecord(value.korea)) return false;
  const koreaKeys = [
    "policyRatePct",
    "callOvernightPct",
    "cd91Pct",
    "koribor3mPct",
    "msb364Pct",
    "baseRatePct",
    "cpiYoYPct",
    "coreCpiYoYPct",
    "newDepositAvgPct",
    "newLoanAvgPct",
    "depositOutstandingAvgPct",
    "loanOutstandingAvgPct",
  ] as const;

  for (const key of koreaKeys) {
    const current = value.korea[key];
    if (current !== undefined && !isFiniteNumber(current)) return false;
  }

  if (!Array.isArray(value.sources)) return false;
  if (!value.sources.every((entry) => isRecord(entry)
      && typeof entry.name === "string"
      && typeof entry.url === "string"
      && typeof entry.fetchedAt === "string")) {
    return false;
  }

  if (!Array.isArray(value.warnings) || !value.warnings.every((entry) => typeof entry === "string")) return false;

  return true;
}

function toSnapshotBaseId(snapshot: AssumptionsSnapshot): string {
  const asOf = snapshot.asOf?.trim() || "unknown";
  const fetchedAtToken = snapshot.fetchedAt.slice(0, 19).replace(/[:T]/g, "-");
  return `${asOf}_${fetchedAtToken || "unknown"}`;
}

function sanitizeSnapshotId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return "";
  if (trimmed.includes("/") || trimmed.includes("\\")) return "";
  return trimmed;
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function readSnapshotFile(filePath: string): Promise<AssumptionsSnapshot | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const loaded = JSON.parse(raw) as unknown;
    const decoded = await decodeStoragePayload(loaded);
    const parsed = decoded.payload;
    if (!isSnapshot(parsed)) return null;
    const snapshot: AssumptionsSnapshot = {
      ...parsed,
      schemaVersion: ASSUMPTIONS_SCHEMA_VERSION,
    };
    if (decoded.rewriteToVault) {
      await writeJsonAtomic(filePath, await encodeStoragePayload(snapshot));
    }
    return snapshot;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadLatestAssumptionsSnapshot(): Promise<AssumptionsSnapshot | null> {
  assertServerOnly();

  try {
    const filePath = resolveAssumptionsPath();
    return await readSnapshotFile(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      console.warn("[planning:assumptions] failed to load latest snapshot", {
        path: resolveAssumptionsPath(),
        message: nodeError?.message,
      });
    }
    return null;
  }
}

export async function saveLatestAssumptionsSnapshot(snapshot: AssumptionsSnapshot): Promise<void> {
  assertServerOnly();

  const filePath = resolveAssumptionsPath();
  const payload = {
    ...snapshot,
    schemaVersion: ASSUMPTIONS_SCHEMA_VERSION,
  };
  await writeJsonAtomic(filePath, await encodeStoragePayload(payload));
}

export async function saveAssumptionsSnapshotToHistory(snapshot: AssumptionsSnapshot): Promise<{ id: string }> {
  assertServerOnly();

  const dirPath = resolveHistoryDir();
  await fs.mkdir(dirPath, { recursive: true });

  const baseId = toSnapshotBaseId(snapshot);
  let nextId = baseId;
  let suffix = 2;
  while (true) {
    try {
      await fs.access(path.join(dirPath, `${nextId}.json`));
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") break;
      throw error;
    }
  }

  const payload = {
    ...snapshot,
    schemaVersion: ASSUMPTIONS_SCHEMA_VERSION,
  };
  await writeJsonAtomic(path.join(dirPath, `${nextId}.json`), await encodeStoragePayload(payload));
  return { id: nextId };
}

export async function listAssumptionsHistory(limit = 50): Promise<SnapshotRef[]> {
  assertServerOnly();

  const dirPath = resolveHistoryDir();
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const refs: SnapshotRef[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const id = sanitizeSnapshotId(entry.name.slice(0, -5));
    if (!id) continue;

    const snapshot = await readSnapshotFile(path.join(dirPath, entry.name));
    if (!snapshot) continue;
    refs.push({
      id,
      ...(snapshot.asOf ? { asOf: snapshot.asOf } : {}),
      fetchedAt: snapshot.fetchedAt,
    });
  }

  const sorted = refs.sort((a, b) => {
    const aTs = Date.parse(a.fetchedAt);
    const bTs = Date.parse(b.fetchedAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 50));
  return sorted.slice(0, safeLimit);
}

export async function loadAssumptionsSnapshotById(id: string): Promise<AssumptionsSnapshot | null> {
  assertServerOnly();

  const safeId = sanitizeSnapshotId(id);
  if (!safeId) return null;
  return readSnapshotFile(path.join(resolveHistoryDir(), `${safeId}.json`));
}

export async function setLatestSnapshotFromHistory(id: string): Promise<void> {
  assertServerOnly();

  const snapshot = await loadAssumptionsSnapshotById(id);
  if (!snapshot) {
    throw new Error("assumptions snapshot not found");
  }
  await saveLatestAssumptionsSnapshot(snapshot);
}

export async function findAssumptionsSnapshotId(snapshot: AssumptionsSnapshot): Promise<string | undefined> {
  assertServerOnly();

  const baseId = sanitizeSnapshotId(toSnapshotBaseId(snapshot));
  if (!baseId) return undefined;

  const dirPath = resolveHistoryDir();
  const directPath = path.join(dirPath, `${baseId}.json`);
  const direct = await readSnapshotFile(directPath);
  if (direct && direct.asOf === snapshot.asOf && direct.fetchedAt === snapshot.fetchedAt) {
    return baseId;
  }

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return undefined;
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .filter((idValue) => idValue === baseId || idValue.startsWith(`${baseId}-`))
    .sort();

  for (const candidate of candidates) {
    const parsed = await readSnapshotFile(path.join(dirPath, `${candidate}.json`));
    if (!parsed) continue;
    if (parsed.asOf === snapshot.asOf && parsed.fetchedAt === snapshot.fetchedAt) {
      return candidate;
    }
  }

  return undefined;
}
