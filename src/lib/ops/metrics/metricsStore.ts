import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpsDataDir } from "../../planning/storage/dataDir";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_ROTATION_COUNT = 2;
const MAX_LINE_LENGTH = 4_096;

export type MetricsEventType =
  | "RUN_STAGE"
  | "RUN_PIPELINE"
  | "ASSUMPTIONS_REFRESH"
  | "BACKUP_EXPORT"
  | "BACKUP_PREVIEW"
  | "BACKUP_RESTORE"
  | "VAULT_UNLOCK"
  | "MIGRATION_ACTION"
  | "SCHEDULED_TASK";

export type MetricsEvent = {
  at: string;
  type: MetricsEventType;
  status?: string;
  runId?: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
};

export type MetricsReadOptions = {
  limit?: number;
  type?: MetricsEventType;
};

export type MetricsSummary = {
  rangeHours: number;
  from: string;
  to: string;
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  runPipeline: {
    total: number;
    success: number;
    partialSuccess: number;
    failed: number;
    successRatePct: number;
  };
  simulate: {
    count: number;
    avgDurationMs?: number;
    failed: number;
  };
  assumptionsRefresh: {
    total: number;
    success: number;
    failed: number;
    lastStatus?: string;
    consecutiveFailures: number;
  };
  backup: {
    total: number;
    success: number;
    failed: number;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function normalizeType(value: unknown): MetricsEventType {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === "RUN_STAGE"
    || normalized === "RUN_PIPELINE"
    || normalized === "ASSUMPTIONS_REFRESH"
    || normalized === "BACKUP_EXPORT"
    || normalized === "BACKUP_PREVIEW"
    || normalized === "BACKUP_RESTORE"
    || normalized === "VAULT_UNLOCK"
    || normalized === "MIGRATION_ACTION"
    || normalized === "SCHEDULED_TASK"
  ) {
    return normalized;
  }
  return "MIGRATION_ACTION";
}

function resolveMetricsPath(): string {
  const override = asString(process.env.PLANNING_OPS_METRICS_STORE_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "metrics", "metrics.ndjson");
}

function resolveMaxBytes(): number {
  return toSafeInt(process.env.PLANNING_OPS_METRICS_MAX_BYTES, DEFAULT_MAX_BYTES, 8_192, 100 * 1024 * 1024);
}

function resolveRotationCount(): number {
  return toSafeInt(process.env.PLANNING_OPS_METRICS_ROTATION_COUNT, DEFAULT_ROTATION_COUNT, 1, 20);
}

function toRotatedPath(filePath: string, index: number): string {
  const ext = path.extname(filePath);
  if (ext) {
    const base = filePath.slice(0, -ext.length);
    return `${base}.${index}${ext}`;
  }
  return `${filePath}.${index}`;
}

function sanitizeStatus(value: unknown): string | undefined {
  const raw = asString(value).toUpperCase();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^A-Z0-9_]/g, "").slice(0, 48);
  return cleaned || undefined;
}

function sanitizeCode(value: unknown): string | undefined {
  const raw = asString(value).toUpperCase();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^A-Z0-9_]/g, "").slice(0, 64);
  if (cleaned.includes("TOKEN") || cleaned.includes("SECRET") || cleaned.includes("PROCESSENV")) {
    return "REDACTED";
  }
  return cleaned || undefined;
}

function sanitizeStage(value: unknown): string | undefined {
  const raw = asString(value).toLowerCase();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  return cleaned || undefined;
}

function sanitizeRunIdPrefix(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned) return undefined;
  return cleaned.slice(0, 8);
}

function sanitizeDuration(value: unknown): number | undefined {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return undefined;
  return Math.round(duration * 100) / 100;
}

function sanitizeEvent(input: {
  type: unknown;
  at?: unknown;
  status?: unknown;
  runId?: unknown;
  stage?: unknown;
  durationMs?: unknown;
  errorCode?: unknown;
}): MetricsEvent {
  return {
    at: toIso(input.at),
    type: normalizeType(input.type),
    ...(sanitizeStatus(input.status) ? { status: sanitizeStatus(input.status) } : {}),
    ...(sanitizeRunIdPrefix(input.runId) ? { runId: sanitizeRunIdPrefix(input.runId) } : {}),
    ...(sanitizeStage(input.stage) ? { stage: sanitizeStage(input.stage) } : {}),
    ...(sanitizeDuration(input.durationMs) !== undefined ? { durationMs: sanitizeDuration(input.durationMs) } : {}),
    ...(sanitizeCode(input.errorCode) ? { errorCode: sanitizeCode(input.errorCode) } : {}),
  };
}

function toLine(event: MetricsEvent): string {
  const safe = sanitizeEvent(event);
  const text = JSON.stringify(safe);
  if (text.length <= MAX_LINE_LENGTH) return text;
  const truncated = {
    at: safe.at,
    type: safe.type,
    status: safe.status,
    errorCode: "TRUNCATED",
  };
  return JSON.stringify(truncated);
}

async function rotateIfNeeded(filePath: string, incomingBytes: number): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => null);
  const maxBytes = resolveMaxBytes();
  if (stat && stat.size + incomingBytes <= maxBytes) return;

  const rotationCount = resolveRotationCount();
  await fs.rm(toRotatedPath(filePath, rotationCount), { force: true }).catch(() => undefined);

  for (let index = rotationCount - 1; index >= 1; index -= 1) {
    await fs.rename(toRotatedPath(filePath, index), toRotatedPath(filePath, index + 1)).catch(() => undefined);
  }
  await fs.rename(filePath, toRotatedPath(filePath, 1)).catch(() => undefined);
}

function parseLine(line: string): MetricsEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    return sanitizeEvent({
      at: row.at,
      type: row.type,
      status: row.status,
      runId: row.runId,
      stage: row.stage,
      durationMs: row.durationMs,
      errorCode: row.errorCode,
    });
  } catch {
    return null;
  }
}

async function readFromFile(filePath: string): Promise<MetricsEvent[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseLine(line))
    .filter((row): row is MetricsEvent => row !== null);
}

function toSummary(events: MetricsEvent[], rangeHours: number, now = new Date()): MetricsSummary {
  const nowMs = now.getTime();
  const fromMs = nowMs - rangeHours * 60 * 60 * 1000;
  const inRange = events.filter((event) => {
    const atMs = Date.parse(event.at);
    return Number.isFinite(atMs) && atMs >= fromMs && atMs <= nowMs;
  });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const event of inRange) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    if (event.status) {
      byStatus[event.status] = (byStatus[event.status] ?? 0) + 1;
    }
  }

  const runPipelines = inRange.filter((event) => event.type === "RUN_PIPELINE");
  const runSuccess = runPipelines.filter((event) => event.status === "SUCCESS").length;
  const runPartial = runPipelines.filter((event) => event.status === "PARTIAL_SUCCESS").length;
  const runFailed = runPipelines.filter((event) => event.status === "FAILED").length;
  const runSuccessRatePct = runPipelines.length > 0
    ? Number((((runSuccess + runPartial) / runPipelines.length) * 100).toFixed(2))
    : 0;

  const simulateRows = inRange.filter((event) => event.type === "RUN_STAGE" && event.stage === "simulate");
  const simulateDurations = simulateRows
    .map((event) => event.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const simulateAvgDuration = simulateDurations.length > 0
    ? Number((simulateDurations.reduce((sum, value) => sum + value, 0) / simulateDurations.length).toFixed(2))
    : undefined;
  const simulateFailed = simulateRows.filter((event) => event.status === "FAILED").length;

  const refreshRows = inRange
    .filter((event) => event.type === "ASSUMPTIONS_REFRESH")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  let consecutiveFailures = 0;
  for (const row of refreshRows) {
    if (row.status === "FAILED" || row.status === "ERROR" || row.status === "FAIL") {
      consecutiveFailures += 1;
      continue;
    }
    break;
  }
  const refreshSuccess = refreshRows.filter((event) => event.status === "SUCCESS").length;
  const refreshFailed = refreshRows.filter((event) => event.status === "FAILED" || event.status === "ERROR" || event.status === "FAIL").length;

  const backupRows = inRange.filter((event) => event.type === "BACKUP_EXPORT" || event.type === "BACKUP_PREVIEW" || event.type === "BACKUP_RESTORE");
  const backupSuccess = backupRows.filter((event) => event.status === "SUCCESS").length;
  const backupFailed = backupRows.filter((event) => event.status === "FAILED" || event.status === "ERROR" || event.status === "FAIL").length;

  return {
    rangeHours,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    total: inRange.length,
    byType,
    byStatus,
    runPipeline: {
      total: runPipelines.length,
      success: runSuccess,
      partialSuccess: runPartial,
      failed: runFailed,
      successRatePct: runSuccessRatePct,
    },
    simulate: {
      count: simulateRows.length,
      ...(typeof simulateAvgDuration === "number" ? { avgDurationMs: simulateAvgDuration } : {}),
      failed: simulateFailed,
    },
    assumptionsRefresh: {
      total: refreshRows.length,
      success: refreshSuccess,
      failed: refreshFailed,
      ...(refreshRows[0]?.status ? { lastStatus: refreshRows[0].status } : {}),
      consecutiveFailures,
    },
    backup: {
      total: backupRows.length,
      success: backupSuccess,
      failed: backupFailed,
    },
  };
}

function scrubLineForSafety(line: string): string {
  return line.replace(/process\.env/gi, "***");
}

export async function appendEvent(event: Partial<MetricsEvent> & { type: MetricsEventType; at?: string }): Promise<void> {
  const filePath = resolveMetricsPath();
  const line = `${toLine(sanitizeEvent(event))}\n`;
  const safeLine = scrubLineForSafety(line);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(safeLine));
  await fs.appendFile(filePath, safeLine, "utf-8");
}

export async function readRecent(options?: MetricsReadOptions): Promise<MetricsEvent[]> {
  const filePath = resolveMetricsPath();
  const rotationCount = resolveRotationCount();
  const files = [
    filePath,
    ...Array.from({ length: rotationCount }, (_, index) => toRotatedPath(filePath, index + 1)),
  ];

  const rows = (await Promise.all(files.map((candidate) => readFromFile(candidate)))).flat();
  const sorted = rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const filtered = options?.type ? sorted.filter((row) => row.type === options.type) : sorted;
  const limit = toSafeInt(options?.limit, 200, 1, 10_000);
  return filtered.slice(0, limit);
}

export async function summarize(input: { rangeHours: number; type?: MetricsEventType }): Promise<MetricsSummary> {
  const limit = Math.max(5_000, input.rangeHours * 400);
  const rows = await readRecent({ limit, ...(input.type ? { type: input.type } : {}) });
  return toSummary(rows, toSafeInt(input.rangeHours, 24, 1, 24 * 30));
}
