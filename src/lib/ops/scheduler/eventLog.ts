import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpsDataDir } from "@/lib/planning/storage/dataDir";
import { loadOpsSchedulerThresholdPolicySync } from "./policy";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

const ALLOWED_MODES = new Set(["weekly", "regress", "monthly", "prune"]);

export type OpsSchedulerMode = "weekly" | "regress" | "monthly" | "prune" | "unknown";

export type OpsSchedulerEvent = {
  ts: string;
  mode: OpsSchedulerMode;
  ok: boolean;
  exitCode: number;
  startedAt: string;
  endedAt: string;
  host?: string;
  message?: string;
};

export type OpsSchedulerSummary = {
  total: number;
  success: number;
  failed: number;
  latestAt?: string;
  lastSuccessAt?: string;
  lastFailedAt?: string;
  latestFailed: boolean;
  consecutiveFailures: number;
  level: "OK" | "WARN" | "RISK";
  thresholds: {
    warnConsecutiveFailures: number;
    riskConsecutiveFailures: number;
  };
};

type ReadSchedulerEventsOptions = {
  limit?: number;
};

type ReadSchedulerLogTailOptions = {
  lines?: number;
  maxBytes?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveThresholds(): {
  warnConsecutiveFailures: number;
  riskConsecutiveFailures: number;
} {
  try {
    const policy = loadOpsSchedulerThresholdPolicySync();
    return {
      warnConsecutiveFailures: toSafeInt(policy.warnConsecutiveFailures, 1, 1, 100),
      riskConsecutiveFailures: toSafeInt(policy.riskConsecutiveFailures, 3, policy.warnConsecutiveFailures, 100),
    };
  } catch {
    const warnConsecutiveFailures = toSafeInt(process.env.PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE, 1, 1, 100);
    const riskConsecutiveFailures = toSafeInt(process.env.PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE, 3, warnConsecutiveFailures, 100);
    return {
      warnConsecutiveFailures,
      riskConsecutiveFailures,
    };
  }
}

function toIsoOrNow(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function toMode(value: unknown): OpsSchedulerMode {
  const normalized = asString(value).toLowerCase();
  if (ALLOWED_MODES.has(normalized)) return normalized as OpsSchedulerMode;
  return "unknown";
}

function toHost(value: unknown): string | undefined {
  const normalized = asString(value);
  if (!normalized) return undefined;
  return normalized.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64) || undefined;
}

function toMessage(value: unknown): string | undefined {
  const normalized = asString(value);
  if (!normalized) return undefined;
  return normalized.replace(/\s+/g, " ").slice(0, 140);
}

function sanitizeEvent(input: Record<string, unknown>): OpsSchedulerEvent {
  return {
    ts: toIsoOrNow(input.ts),
    mode: toMode(input.mode),
    ok: input.ok === true,
    exitCode: toSafeInt(input.exitCode, 1, 0, 255),
    startedAt: toIsoOrNow(input.startedAt),
    endedAt: toIsoOrNow(input.endedAt),
    ...(toHost(input.host) ? { host: toHost(input.host) } : {}),
    ...(toMessage(input.message) ? { message: toMessage(input.message) } : {}),
  };
}

function parseLine(line: string): OpsSchedulerEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return sanitizeEvent(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function resolveOpsSchedulerEventLogPath(): string {
  const override = asString(process.env.PLANNING_OPS_SCHEDULER_LOG_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "logs", "scheduler.ndjson");
}

export function resolveOpsSchedulerStdoutLogPath(): string {
  return path.join(resolveOpsDataDir(), "logs", "scheduler.log");
}

export function resolveOpsSchedulerStderrLogPath(): string {
  return path.join(resolveOpsDataDir(), "logs", "scheduler.err");
}

function sanitizeLogLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().slice(0, 240);
}

export async function readSchedulerLogTail(
  filePath: string,
  options: ReadSchedulerLogTailOptions = {},
): Promise<string[]> {
  const maxBytes = toSafeInt(options.maxBytes, 16 * 1024, 1024, 256 * 1024);
  const linesLimit = toSafeInt(options.lines, 8, 1, 50);
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];

  const sliced = raw.length > maxBytes ? raw.slice(-maxBytes) : raw;
  const lines = sliced
    .split("\n")
    .map((line) => sanitizeLogLine(line))
    .filter((line) => line.length > 0);
  if (lines.length <= linesLimit) return lines;
  return lines.slice(-linesLimit);
}

export async function readOpsSchedulerEvents(options: ReadSchedulerEventsOptions = {}): Promise<OpsSchedulerEvent[]> {
  const filePath = resolveOpsSchedulerEventLogPath();
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];

  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseLine(line))
    .filter((row): row is OpsSchedulerEvent => row !== null)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  const limit = toSafeInt(options.limit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
  return rows.slice(0, limit);
}

export function summarizeOpsSchedulerEvents(rows: OpsSchedulerEvent[]): OpsSchedulerSummary {
  const total = rows.length;
  const success = rows.filter((row) => row.ok).length;
  const failed = total - success;
  const lastSuccessAt = rows.find((row) => row.ok)?.ts;
  const lastFailedAt = rows.find((row) => !row.ok)?.ts;
  const thresholds = resolveThresholds();
  const warnThreshold = thresholds.warnConsecutiveFailures;
  const riskThreshold = thresholds.riskConsecutiveFailures;
  let consecutiveFailures = 0;
  for (const row of rows) {
    if (!row.ok) {
      consecutiveFailures += 1;
      continue;
    }
    break;
  }
  const level: OpsSchedulerSummary["level"] = consecutiveFailures >= riskThreshold
    ? "RISK"
    : consecutiveFailures >= warnThreshold
      ? "WARN"
      : "OK";
  return {
    total,
    success,
    failed,
    ...(lastSuccessAt ? { lastSuccessAt } : {}),
    ...(lastFailedAt ? { lastFailedAt } : {}),
    latestFailed: rows[0] ? !rows[0].ok : false,
    consecutiveFailures,
    level,
    thresholds: {
      warnConsecutiveFailures: warnThreshold,
      riskConsecutiveFailures: riskThreshold,
    },
    ...(rows[0]?.ts ? { latestAt: rows[0].ts } : {}),
  };
}
