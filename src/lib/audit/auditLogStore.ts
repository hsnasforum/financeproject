import fs from "node:fs";
import path from "node:path";

const MAX_AUDIT_ITEMS = 500;
const DEFAULT_AUDIT_PATH = path.join(process.cwd(), "tmp", "audit_log.json");
const MAX_EVENT_LENGTH = 64;
const MAX_ROUTE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;
const MAX_ID_LENGTH = 64;

export type AuditLogItem = {
  id: string;
  createdAt: string;
  event: string;
  route: string;
  summary: string;
  details?: unknown;
};

export type AuditLogInput = {
  event: string;
  route: string;
  summary: string;
  details?: unknown;
};

function resolveAuditPath(): string {
  const envPath = (process.env.AUDIT_LOG_PATH ?? "").trim();
  if (envPath) return path.resolve(envPath);
  return DEFAULT_AUDIT_PATH;
}

function normalizeShortText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.slice(0, maxLength);
}

function normalizeId(value: unknown): string {
  const id = normalizeShortText(value, MAX_ID_LENGTH);
  return id || crypto.randomUUID();
}

function normalizeCreatedAt(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function normalizeItem(value: unknown): AuditLogItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const event = normalizeShortText(row.event, MAX_EVENT_LENGTH);
  const route = normalizeShortText(row.route, MAX_ROUTE_LENGTH);
  const summary = normalizeShortText(row.summary, MAX_SUMMARY_LENGTH);
  if (!event || !route || !summary) return null;
  const details = row.details;
  return {
    id: normalizeId(row.id),
    createdAt: normalizeCreatedAt(row.createdAt),
    event,
    route,
    summary,
    ...(details === undefined ? {} : { details }),
  };
}

function writeAll(items: AuditLogItem[], filePath = resolveAuditPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function readAll(filePath = resolveAuditPath()): AuditLogItem[] {
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      writeAll([], filePath);
      return [];
    }
    const normalized = parsed
      .map((entry) => normalizeItem(entry))
      .filter((entry): entry is AuditLogItem => entry !== null);
    if (normalized.length !== parsed.length) {
      writeAll(normalized, filePath);
    }
    return normalized;
  } catch {
    writeAll([], filePath);
    return [];
  }
}

export function append(input: AuditLogInput): AuditLogItem {
  const next: AuditLogItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    event: normalizeShortText(input.event, MAX_EVENT_LENGTH),
    route: normalizeShortText(input.route, MAX_ROUTE_LENGTH),
    summary: normalizeShortText(input.summary, MAX_SUMMARY_LENGTH),
    ...(input.details === undefined ? {} : { details: input.details }),
  };

  if (!next.event) next.event = "UNKNOWN";
  if (!next.route) next.route = "/api/dev/unknown";
  if (!next.summary) next.summary = "audit event";

  const rows = readAll();
  rows.push(next);
  const capped = rows.length > MAX_AUDIT_ITEMS ? rows.slice(rows.length - MAX_AUDIT_ITEMS) : rows;
  writeAll(capped);
  return next;
}

export function list(limit = 50): AuditLogItem[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(MAX_AUDIT_ITEMS, Math.trunc(limit))) : 50;
  return readAll().slice(-safeLimit).reverse();
}
