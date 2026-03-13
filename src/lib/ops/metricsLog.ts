import fs from "node:fs/promises";
import path from "node:path";
import { redactText } from "../planning/privacy/redact";
import { resolveOpsDataDir } from "../planning/storage/dataDir";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 7;
const MAX_LINE_LENGTH = 8_000;

export type OpsMetricEventType =
  | "RUN_STAGE"
  | "SCHEDULED_TASK"
  | "ASSUMPTIONS_REFRESH"
  | "BACKUP_EXPORT"
  | "BACKUP_PREVIEW"
  | "BACKUP_RESTORE"
  | "VAULT_UNLOCK"
  | "MIGRATION_ACTION";

export type OpsMetricEvent = {
  type: OpsMetricEventType;
  at: string;
  meta?: Record<string, unknown>;
};

export type OpsMetricsWindowSummary = {
  windowHours: number;
  from: string;
  to: string;
  total: number;
  failed: number;
  failureRatePct: number;
  durationAvgMs?: number;
  durationP95Ms?: number;
  assumptionsRefreshFailures: number;
};

export type OpsMetricsSummary = {
  last24h: OpsMetricsWindowSummary;
  last7d: OpsMetricsWindowSummary;
};

const META_ALLOWLIST: Record<OpsMetricEventType, ReadonlySet<string>> = {
  RUN_STAGE: new Set(["requestId", "runId", "profileId", "stageId", "status", "durationMs", "reason", "overallStatus"]),
  SCHEDULED_TASK: new Set(["taskName", "status", "code", "durationMs", "profileId", "runId", "snapshotId", "overallStatus", "warningsCount", "message"]),
  ASSUMPTIONS_REFRESH: new Set(["status", "latestId", "warningsCount", "durationMs", "code"]),
  BACKUP_EXPORT: new Set(["status", "mode", "gzip", "durationMs", "sizeBytes", "code"]),
  BACKUP_PREVIEW: new Set(["status", "durationMs", "sizeBytes", "warningCount", "code"]),
  BACKUP_RESTORE: new Set(["status", "mode", "durationMs", "sizeBytes", "issues", "warnings", "code"]),
  VAULT_UNLOCK: new Set(["status", "durationMs", "code"]),
  MIGRATION_ACTION: new Set(["action", "status", "durationMs", "applied", "pending", "deferred", "failed", "updated", "code"]),
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveMetricsPath(): string {
  const override = asString(process.env.PLANNING_OPS_METRICS_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "metrics", "events.ndjson");
}

function resolveMaxBytes(): number {
  return normalizeInt(process.env.PLANNING_OPS_METRICS_MAX_BYTES, DEFAULT_MAX_BYTES, 32 * 1024, 100 * 1024 * 1024);
}

function resolveMaxFiles(): number {
  return normalizeInt(process.env.PLANNING_OPS_METRICS_MAX_FILES, DEFAULT_MAX_FILES, 1, 30);
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function sanitizeType(value: unknown): OpsMetricEventType {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "SCHEDULED_TASK"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
  ) {
    return normalized;
  }
  return "MIGRATION_ACTION";
}

function redactByKey(key: string, value: string): string {
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey.includes("passphrase")
    || normalizedKey.includes("secret")
    || normalizedKey.includes("token")
    || normalizedKey.includes("password")
    || normalizedKey.includes("key")
    || normalizedKey.includes("raw")
    || normalizedKey.includes("blob")
    || normalizedKey.includes("profile")
  ) {
    return "***";
  }
  return redactText(value).slice(0, 200);
}

function sanitizeMetaValue(value: unknown, key: string): string | number | boolean | string[] | number[] | boolean[] | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactByKey(key, value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Math.abs(value) > 1_000_000_000_000 ? 0 : value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const clipped = value.slice(0, 20);
    if (clipped.every((entry) => typeof entry === "string")) {
      return clipped.map((entry) => redactByKey(key, entry));
    }
    if (clipped.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      return clipped.map((entry) => (Math.abs(entry) > 1_000_000_000_000 ? 0 : entry));
    }
    if (clipped.every((entry) => typeof entry === "boolean")) {
      return clipped as boolean[];
    }
    return clipped.map((entry) => redactByKey(key, String(entry)));
  }
  return redactByKey(key, String(value));
}

function sanitizeMeta(type: OpsMetricEventType, input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const allow = META_ALLOWLIST[type];
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (!(key in input)) continue;
    const sanitized = sanitizeMetaValue(input[key], key);
    out[key] = sanitized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function toLine(input: OpsMetricEvent): string {
  const normalized: OpsMetricEvent = {
    type: sanitizeType(input.type),
    at: toIso(input.at),
    ...(input.meta ? { meta: sanitizeMeta(sanitizeType(input.type), input.meta) } : {}),
  };

  const line = JSON.stringify(normalized);
  if (line.length <= MAX_LINE_LENGTH) return line;
  return JSON.stringify({
    type: normalized.type,
    at: normalized.at,
    meta: { truncated: true },
  });
}

async function rotateIfNeeded(filePath: string, incomingBytes: number): Promise<void> {
  const maxBytes = resolveMaxBytes();
  const maxFiles = resolveMaxFiles();
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat && stat.size + incomingBytes <= maxBytes) return;

  const oldestPath = `${filePath}.${maxFiles}`;
  await fs.rm(oldestPath, { force: true }).catch(() => undefined);
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    await fs.rename(source, target).catch(() => undefined);
  }
  await fs.rename(filePath, `${filePath}.1`).catch(() => undefined);
}

function parseLine(line: string): OpsMetricEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const type = sanitizeType(row.type);
    const at = toIso(row.at);
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : undefined;
    return {
      type,
      at,
      ...(meta ? { meta } : {}),
    };
  } catch {
    return null;
  }
}

async function readFromFile(filePath: string): Promise<OpsMetricEvent[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];
  const lines = raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines
    .map((line) => parseLine(line))
    .filter((row): row is OpsMetricEvent => row !== null);
}

async function listReadableMetricFiles(filePath: string): Promise<string[]> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const rotated = entries
    .map((name) => {
      const matched = name.match(new RegExp(`^${escapedBase}\\.(\\d+)$`));
      if (!matched) return null;
      return { name, index: Number(matched[1]) };
    })
    .filter((row): row is { name: string; index: number } => row !== null && Number.isFinite(row.index))
    .sort((a, b) => a.index - b.index)
    .map((row) => path.join(dir, row.name));
  return [filePath, ...rotated];
}

function isFailureStatus(status: unknown): boolean {
  const normalized = asString(status).toUpperCase();
  return normalized === "FAILED" || normalized === "FAIL" || normalized === "ERROR";
}

function metricsWindowSummary(events: OpsMetricEvent[], hours: number, now = new Date()): OpsMetricsWindowSummary {
  const nowMs = now.getTime();
  const fromMs = nowMs - hours * 60 * 60 * 1000;

  const rows = events.filter((event) => {
    const atMs = Date.parse(event.at);
    return Number.isFinite(atMs) && atMs >= fromMs && atMs <= nowMs;
  });

  const failures = rows.filter((event) => isFailureStatus((event.meta as Record<string, unknown> | undefined)?.status));
  const durations = rows
    .map((event) => Number((event.meta as Record<string, unknown> | undefined)?.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const refreshFailures = rows.filter((event) => event.type === "ASSUMPTIONS_REFRESH" && isFailureStatus((event.meta as Record<string, unknown> | undefined)?.status));

  const durationAvgMs = durations.length > 0
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : undefined;
  const durationP95Ms = durations.length > 0
    ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)]
    : undefined;
  const failureRatePct = rows.length > 0
    ? Number(((failures.length / rows.length) * 100).toFixed(2))
    : 0;

  return {
    windowHours: hours,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    total: rows.length,
    failed: failures.length,
    failureRatePct,
    ...(typeof durationAvgMs === "number" ? { durationAvgMs: Number(durationAvgMs.toFixed(2)) } : {}),
    ...(typeof durationP95Ms === "number" ? { durationP95Ms } : {}),
    assumptionsRefreshFailures: refreshFailures.length,
  };
}

export async function appendOpsMetricEvent(input: {
  type: OpsMetricEventType;
  at?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const filePath = resolveMetricsPath();
  const event: OpsMetricEvent = {
    type: input.type,
    at: input.at ?? new Date().toISOString(),
    ...(input.meta ? { meta: input.meta } : {}),
  };
  const line = `${toLine(event)}\n`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(line));
  await fs.appendFile(filePath, line, "utf-8");
}

export async function listOpsMetricEvents(options?: {
  limit?: number;
  type?: OpsMetricEventType;
}): Promise<OpsMetricEvent[]> {
  const filePath = resolveMetricsPath();
  const filePaths = await listReadableMetricFiles(filePath);

  const chunks: OpsMetricEvent[][] = [];
  for (const candidate of filePaths) {
    const rows = await readFromFile(candidate);
    if (rows.length > 0) chunks.push(rows);
  }

  const merged = chunks.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const filtered = options?.type ? merged.filter((row) => row.type === options.type) : merged;
  const limit = normalizeInt(options?.limit, 200, 1, 10_000);
  return filtered.slice(0, limit);
}

export function summarizeOpsMetricEvents(events: OpsMetricEvent[], now = new Date()): OpsMetricsSummary {
  return {
    last24h: metricsWindowSummary(events, 24, now),
    last7d: metricsWindowSummary(events, 24 * 7, now),
  };
}
