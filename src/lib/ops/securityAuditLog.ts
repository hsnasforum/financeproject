import fs from "node:fs/promises";
import path from "node:path";
import { redactText } from "../planning/privacy/redact";
import { resolveOpsDataDir } from "../planning/storage/dataDir";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const MAX_LINE_LENGTH = 8_000;

export type OpsAuditEvent = {
  eventType: string;
  at: string;
  actor: "local";
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

function resolveAuditPath(): string {
  const override = asString(process.env.PLANNING_OPS_AUDIT_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "audit", "events.ndjson");
}

function resolveMaxBytes(): number {
  return normalizeInt(process.env.PLANNING_OPS_AUDIT_MAX_BYTES, DEFAULT_MAX_BYTES, 32 * 1024, 50 * 1024 * 1024);
}

function resolveMaxFiles(): number {
  return normalizeInt(process.env.PLANNING_OPS_AUDIT_MAX_FILES, DEFAULT_MAX_FILES, 1, 20);
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function sanitizeEventType(value: unknown): string {
  const raw = asString(value).toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9_:-]/g, "_").slice(0, 80);
  return cleaned || "UNKNOWN";
}

function redactByKey(key: string, value: string): string {
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey.includes("passphrase")
    || normalizedKey.includes("secret")
    || normalizedKey.includes("token")
    || normalizedKey.includes("password")
    || normalizedKey.includes("key")
  ) {
    return "***";
  }
  return redactText(value).slice(0, 1_000);
}

function sanitizeMetaValue(value: unknown, keyHint = "", depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactByKey(keyHint, value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeMetaValue(entry, keyHint, depth + 1));
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(row).slice(0, 50)) {
      out[key] = sanitizeMetaValue(entry, key, depth + 1);
    }
    return out;
  }
  return String(value);
}

function toLine(event: OpsAuditEvent): string {
  const normalized: OpsAuditEvent = {
    eventType: sanitizeEventType(event.eventType),
    at: toIso(event.at),
    actor: "local",
    ...(event.meta && Object.keys(event.meta).length > 0
      ? { meta: sanitizeMetaValue(event.meta, "meta", 0) as Record<string, unknown> }
      : {}),
  };
  const line = JSON.stringify(normalized);
  if (line.length <= MAX_LINE_LENGTH) return line;
  const compact = {
    eventType: normalized.eventType,
    at: normalized.at,
    actor: normalized.actor,
    meta: {
      truncated: true,
    },
  };
  return JSON.stringify(compact);
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

export async function appendOpsAuditEvent(input: {
  eventType: string;
  at?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const filePath = resolveAuditPath();
  const line = `${toLine({
    eventType: input.eventType,
    at: input.at ?? new Date().toISOString(),
    actor: "local",
    ...(input.meta ? { meta: input.meta } : {}),
  })}\n`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateIfNeeded(filePath, Buffer.byteLength(line));
  await fs.appendFile(filePath, line, "utf-8");
}

function parseLine(line: string): OpsAuditEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const eventType = sanitizeEventType(row.eventType);
    const at = toIso(row.at);
    const actor = row.actor === "local" ? "local" : "local";
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : undefined;
    return {
      eventType,
      at,
      actor,
      ...(meta ? { meta } : {}),
    };
  } catch {
    return null;
  }
}

async function readFromFile(filePath: string): Promise<OpsAuditEvent[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];
  const lines = raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines
    .map((line) => parseLine(line))
    .filter((row): row is OpsAuditEvent => row !== null);
}

async function listReadableAuditFiles(filePath: string): Promise<string[]> {
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

export async function listOpsAuditEvents(options?: {
  limit?: number;
  eventType?: string;
}): Promise<OpsAuditEvent[]> {
  const filePath = resolveAuditPath();
  const filePaths = await listReadableAuditFiles(filePath);

  const chunks: OpsAuditEvent[][] = [];
  for (const candidate of filePaths) {
    const rows = await readFromFile(candidate);
    if (rows.length > 0) chunks.push(rows);
  }

  const merged = chunks.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const targetEventType = asString(options?.eventType).toUpperCase();
  const filtered = targetEventType
    ? merged.filter((row) => row.eventType === targetEventType)
    : merged;
  const limit = normalizeInt(options?.limit, 200, 1, 1000);
  return filtered.slice(0, limit);
}
