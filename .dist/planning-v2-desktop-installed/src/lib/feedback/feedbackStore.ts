import fs from "node:fs";
import path from "node:path";
import { normalizeDiagnosticsSnapshot, type DiagnosticsSnapshot } from "../diagnostics/snapshot";

const MAX_FEEDBACK_ITEMS = 200;
const DEFAULT_FEEDBACK_PATH = path.join(process.cwd(), "tmp", "user_feedback.json");
export const MAX_FEEDBACK_TAGS = 20;
export const MAX_FEEDBACK_TAG_LENGTH = 30;
export const MAX_FEEDBACK_NOTE_LENGTH = 5000;
export const MAX_FEEDBACK_TASKS = 20;
export const MAX_FEEDBACK_TASK_TEXT_LENGTH = 120;
export const MAX_FEEDBACK_TASK_ID_LENGTH = 64;
export const MAX_FEEDBACK_FINGERPRINT_LENGTH = 160;

export type FeedbackCategory = "bug" | "improve" | "question";
export type FeedbackStatus = "OPEN" | "DOING" | "DONE";
export type FeedbackPriority = "P0" | "P1" | "P2" | "P3";
export type FeedbackTask = {
  id: string;
  text: string;
  done: boolean;
};

export type FeedbackUpdatePatch = {
  status?: FeedbackStatus;
  tags?: string[];
  note?: string;
  priority?: FeedbackPriority;
  dueDate?: string | null;
  tasks?: FeedbackTask[];
};

export type FeedbackItem = {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  userAgent: string | null;
  url: string | null;
  appVersion: string | null;
  status: FeedbackStatus;
  tags: string[];
  note: string;
  priority: FeedbackPriority;
  dueDate: string | null;
  tasks: FeedbackTask[];
  fingerprint?: string;
  snapshot?: DiagnosticsSnapshot;
};

export type FeedbackInput = {
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  userAgent: string | null;
  url: string | null;
  appVersion: string | null;
  status?: FeedbackStatus;
  tags?: string[];
  note?: string;
  priority?: FeedbackPriority;
  dueDate?: string | null;
  tasks?: FeedbackTask[];
  fingerprint?: string | null;
  snapshot?: DiagnosticsSnapshot;
};

function resolveFeedbackPath(): string {
  const envPath = (process.env.FEEDBACK_STORE_PATH ?? "").trim();
  if (envPath) return path.resolve(envPath);
  return DEFAULT_FEEDBACK_PATH;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: unknown): FeedbackStatus {
  if (value === "OPEN" || value === "DOING" || value === "DONE") return value;
  return "OPEN";
}

function normalizePriority(value: unknown): FeedbackPriority {
  if (value === "P0" || value === "P1" || value === "P2" || value === "P3") return value;
  return "P2";
}

function normalizeDueDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const iso = new Date(parsed).toISOString().slice(0, 10);
  return iso === trimmed ? trimmed : null;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const compact = trimmed.replace(/\s+/g, " ").slice(0, MAX_FEEDBACK_TAG_LENGTH);
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
    if (out.length >= MAX_FEEDBACK_TAGS) break;
  }
  return out;
}

function normalizeNote(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, MAX_FEEDBACK_NOTE_LENGTH);
}

function normalizeTaskId(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, MAX_FEEDBACK_TASK_ID_LENGTH);
}

function normalizeTasks(value: unknown): FeedbackTask[] {
  if (!Array.isArray(value)) return [];
  const out: FeedbackTask[] = [];
  const usedIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const textRaw = typeof row.text === "string" ? row.text.trim().replace(/\s+/g, " ") : "";
    if (textRaw.length < 1 || textRaw.length > MAX_FEEDBACK_TASK_TEXT_LENGTH) continue;
    const id = normalizeTaskId(row.id) || crypto.randomUUID().slice(0, MAX_FEEDBACK_TASK_ID_LENGTH);
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    out.push({
      id,
      text: textRaw,
      done: Boolean(row.done),
    });
    if (out.length >= MAX_FEEDBACK_TASKS) break;
  }
  return out;
}

function normalizeFingerprint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FEEDBACK_FINGERPRINT_LENGTH);
}

function normalizeItem(value: unknown): FeedbackItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const category = record.category;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const id = typeof record.id === "string" ? record.id : "";
  const snapshot = normalizeDiagnosticsSnapshot(record.snapshot);
  const fingerprint = normalizeFingerprint(record.fingerprint);
  if (category !== "bug" && category !== "improve" && category !== "question") return null;
  if (!id || !createdAt || message.length < 1) return null;

  return {
    id,
    createdAt,
    category,
    message,
    traceId: toNullableString(record.traceId),
    userAgent: toNullableString(record.userAgent),
    url: toNullableString(record.url),
    appVersion: toNullableString(record.appVersion),
    status: normalizeStatus(record.status),
    tags: normalizeTags(record.tags),
    note: normalizeNote(record.note),
    priority: normalizePriority(record.priority),
    dueDate: normalizeDueDate(record.dueDate),
    tasks: normalizeTasks(record.tasks),
    ...(fingerprint ? { fingerprint } : {}),
    ...(snapshot ? { snapshot } : {}),
  };
}

function writeAll(items: FeedbackItem[], filePath = resolveFeedbackPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(items, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function readAll(): FeedbackItem[] {
  const filePath = resolveFeedbackPath();
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      writeAll([], filePath);
      return [];
    }
    const normalized = parsed.map((entry) => normalizeItem(entry)).filter((entry): entry is FeedbackItem => entry !== null);
    if (normalized.length !== parsed.length) {
      writeAll(normalized, filePath);
    }
    return normalized;
  } catch {
    writeAll([], filePath);
    return [];
  }
}

export function addFeedback(input: FeedbackInput): FeedbackItem {
  const fingerprint = normalizeFingerprint(input.fingerprint);
  const next: FeedbackItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    category: input.category,
    message: input.message.trim(),
    traceId: toNullableString(input.traceId),
    userAgent: toNullableString(input.userAgent),
    url: toNullableString(input.url),
    appVersion: toNullableString(input.appVersion),
    status: normalizeStatus(input.status),
    tags: normalizeTags(input.tags),
    note: normalizeNote(input.note),
    priority: normalizePriority(input.priority),
    dueDate: normalizeDueDate(input.dueDate),
    tasks: normalizeTasks(input.tasks),
    ...(fingerprint ? { fingerprint } : {}),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  };

  const rows = readAll();
  rows.push(next);
  const capped = rows.length > MAX_FEEDBACK_ITEMS ? rows.slice(rows.length - MAX_FEEDBACK_ITEMS) : rows;
  writeAll(capped);
  return next;
}

export function listRecent(limit = 20): FeedbackItem[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 20;
  if (safeLimit <= 0) return [];
  return readAll().slice(-safeLimit).reverse();
}

export function listFeedback(limit = 50): FeedbackItem[] {
  return listRecent(limit);
}

export function getFeedbackById(id: string): FeedbackItem | null {
  const needle = String(id ?? "").trim();
  if (!needle) return null;
  const rows = readAll();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const item = rows[i];
    if (item?.id === needle) return item;
  }
  return null;
}

export function updateFeedback(id: string, patch: FeedbackUpdatePatch): FeedbackItem | null {
  const needle = String(id ?? "").trim();
  if (!needle) return null;
  const rows = readAll();
  const index = rows.findIndex((item) => item.id === needle);
  if (index < 0) return null;

  const base = rows[index];
  const next: FeedbackItem = {
    ...base,
    ...(patch.status !== undefined ? { status: normalizeStatus(patch.status) } : {}),
    ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
    ...(patch.note !== undefined ? { note: normalizeNote(patch.note) } : {}),
    ...(patch.priority !== undefined ? { priority: normalizePriority(patch.priority) } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: normalizeDueDate(patch.dueDate) } : {}),
    ...(patch.tasks !== undefined ? { tasks: normalizeTasks(patch.tasks) } : {}),
  };

  rows[index] = next;
  writeAll(rows);
  return next;
}

export function findRecentByFingerprint(fingerprint: string, withinMs: number): FeedbackItem | null {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  if (!normalizedFingerprint) return null;
  const safeWindowMs = Number.isFinite(withinMs) ? Math.max(0, Math.trunc(withinMs)) : 0;
  if (safeWindowMs <= 0) return null;

  const rows = readAll();
  const now = Date.now();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row || row.fingerprint !== normalizedFingerprint) continue;
    const createdAt = Date.parse(row.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    if (now - createdAt <= safeWindowMs) return row;
  }
  return null;
}

export function appendNote(id: string, text: string): FeedbackItem | null {
  const needle = String(id ?? "").trim();
  if (!needle) return null;
  const appendText = normalizeNote(text);
  if (!appendText) return getFeedbackById(needle);

  const rows = readAll();
  const index = rows.findIndex((item) => item.id === needle);
  if (index < 0) return null;
  const base = rows[index];
  const merged = base.note ? `${base.note}\n\n${appendText}` : appendText;
  const capped = merged.length <= MAX_FEEDBACK_NOTE_LENGTH ? merged : merged.slice(merged.length - MAX_FEEDBACK_NOTE_LENGTH);
  const next: FeedbackItem = {
    ...base,
    note: normalizeNote(capped),
  };
  rows[index] = next;
  writeAll(rows);
  return next;
}
