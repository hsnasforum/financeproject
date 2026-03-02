import fs from "node:fs/promises";
import path from "node:path";
import { redactText } from "../../planning/privacy/redact";
import { resolveOpsDataDir } from "../../planning/storage/dataDir";
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
  const line = `${toLine(row)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(line));
  await fs.appendFile(filePath, line, "utf-8");
}
