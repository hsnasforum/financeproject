import fs from "node:fs/promises";
import path from "node:path";
import { redactText } from "../../planning/privacy/redact";
import { resolveOpsDataDir } from "../../planning/storage/dataDir";
import { isPlanningNamespaceEnabled, resolvePlanningUserId } from "../../planning/store/namespace";
import { getScopedPlanningAuthSource } from "../../planning/store/userScope";
import { type OpsActionId } from "./types";

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_FILES = 3;

type OpsActionLogStatus = "SUCCESS" | "FAILED";

export type OpsActionLogRow = {
  actionId: OpsActionId;
  at: string;
  status: OpsActionLogStatus;
  message: string;
  durationMs: number;
  meta?: Record<string, unknown>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveActionLogPath(): string {
  const override = asString(process.env.PLANNING_OPS_ACTION_LOG_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "actions", "events.ndjson");
}

function resolveMaxBytes(): number {
  return normalizeInt(process.env.PLANNING_OPS_ACTION_LOG_MAX_BYTES, DEFAULT_MAX_BYTES, 32 * 1024, 20 * 1024 * 1024);
}

function resolveMaxFiles(): number {
  return normalizeInt(process.env.PLANNING_OPS_ACTION_LOG_MAX_FILES, DEFAULT_MAX_FILES, 1, 20);
}

function resolvePlanningActionLogMeta(): Record<string, unknown> | null {
  if (!isPlanningNamespaceEnabled()) return null;
  const authSource = asString(getScopedPlanningAuthSource());
  return {
    planningNamespaceEnabled: true,
    planningUserId: resolvePlanningUserId(),
    ...(authSource ? { authSource } : {}),
  };
}

function withPlanningActionLogMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  const planningMeta = resolvePlanningActionLogMeta();
  if (!planningMeta) return meta;
  return {
    ...(meta ?? {}),
    ...planningMeta,
  };
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value).slice(0, 400);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeMeta(entry, depth + 1));
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(row).slice(0, 30)) {
      const keyLower = key.toLowerCase();
      if (
        keyLower.includes("secret")
        || keyLower.includes("token")
        || keyLower.includes("passphrase")
        || keyLower.includes("password")
        || keyLower.includes("raw")
        || keyLower.includes("blob")
      ) {
        out[key] = "***";
      } else {
        out[key] = sanitizeMeta(entry, depth + 1);
      }
    }
    return out;
  }
  return redactText(String(value)).slice(0, 200);
}

function toLine(input: OpsActionLogRow): string {
  const normalized: OpsActionLogRow = {
    actionId: input.actionId,
    at: new Date(input.at).toISOString(),
    status: input.status,
    message: redactText(asString(input.message)).slice(0, 500),
    durationMs: Math.max(0, Math.trunc(Number(input.durationMs) || 0)),
    ...(input.meta ? { meta: sanitizeMeta(input.meta) as Record<string, unknown> } : {}),
  };
  return JSON.stringify(normalized);
}

function parseStatus(value: unknown): OpsActionLogStatus {
  return asString(value).toUpperCase() === "FAILED" ? "FAILED" : "SUCCESS";
}

function parseLine(line: string): OpsActionLogRow | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const actionId = asString(row.actionId);
    if (!actionId) return null;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? sanitizeMeta(row.meta) as Record<string, unknown>
      : undefined;
    return {
      actionId: actionId as OpsActionId,
      at: toIso(row.at),
      status: parseStatus(row.status),
      message: redactText(asString(row.message)).slice(0, 500),
      durationMs: Math.max(0, Math.trunc(Number(row.durationMs) || 0)),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };
  } catch {
    return null;
  }
}

async function readFromFile(filePath: string): Promise<OpsActionLogRow[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];
  const lines = raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines
    .map((line) => parseLine(line))
    .filter((row): row is OpsActionLogRow => row !== null);
}

async function listReadableActionLogFiles(filePath: string): Promise<string[]> {
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

async function rotateIfNeeded(filePath: string, incomingBytes: number): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat && stat.size + incomingBytes <= resolveMaxBytes()) return;
  const maxFiles = resolveMaxFiles();
  await fs.rm(`${filePath}.${maxFiles}`, { force: true }).catch(() => undefined);
  for (let i = maxFiles - 1; i >= 1; i -= 1) {
    await fs.rename(`${filePath}.${i}`, `${filePath}.${i + 1}`).catch(() => undefined);
  }
  await fs.rename(filePath, `${filePath}.1`).catch(() => undefined);
}

export async function appendOpsActionLog(row: OpsActionLogRow): Promise<void> {
  const filePath = resolveActionLogPath();
  const line = `${toLine({
    ...row,
    meta: withPlanningActionLogMeta(row.meta),
  })}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(line));
  await fs.appendFile(filePath, line, "utf-8");
}

export async function listOpsActionLogs(options?: {
  limit?: number;
  actionId?: OpsActionId;
  planningUserId?: string;
}): Promise<OpsActionLogRow[]> {
  const filePath = resolveActionLogPath();
  const filePaths = await listReadableActionLogFiles(filePath);

  const chunks: OpsActionLogRow[][] = [];
  for (const candidate of filePaths) {
    const rows = await readFromFile(candidate);
    if (rows.length > 0) chunks.push(rows);
  }

  const merged = chunks.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const actionFiltered = options?.actionId ? merged.filter((row) => row.actionId === options.actionId) : merged;
  const planningUserId = asString(options?.planningUserId);
  const filtered = planningUserId
    ? actionFiltered.filter((row) => asString(row.meta?.planningUserId) === planningUserId)
    : actionFiltered;
  const limit = normalizeInt(options?.limit, 100, 1, 1000);
  return filtered.slice(0, limit);
}
