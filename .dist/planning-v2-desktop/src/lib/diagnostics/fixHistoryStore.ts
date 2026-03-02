import fs from "node:fs";
import path from "node:path";
import { isAllowedFixId, type AllowedFixId } from "../dev/fixCatalog";
import type { FixFailureAnalysis, FixFailureCause } from "./fixFailureAnalyzer";

const MAX_FIX_HISTORY_ITEMS = 200;
const DEFAULT_FIX_HISTORY_PATH = path.join(process.cwd(), "tmp", "fix_history.json");

export type FixHistoryEntry = {
  id: string;
  createdAt: string;
  fixId: string;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode: string | null;
  errorMessage: string | null;
  chainId?: string;
  steps?: FixHistoryStep[];
  analysis?: FixFailureAnalysis;
};

export type FixHistoryStep = {
  fixId: string;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode: string | null;
  errorMessage: string | null;
  analysis?: FixFailureAnalysis;
};

export type FixHistoryInput = {
  fixId: string;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  chainId?: string | null;
  steps?: FixHistoryStep[];
  analysis?: FixFailureAnalysis;
};

const KNOWN_CAUSES: FixFailureCause[] = [
  "MISSING_OPENDART_KEY",
  "MISSING_CORP_INDEX",
  "DB_NOT_READY",
  "UPSTREAM_UNAVAILABLE",
  "PERMISSION_DENIED",
  "UNKNOWN",
];

function resolveHistoryPath(): string {
  const envPath = (process.env.FIX_HISTORY_PATH ?? "").trim();
  if (envPath) return path.resolve(envPath);
  return DEFAULT_FIX_HISTORY_PATH;
}

function toText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

function toNullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

function toPositiveInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function isKnownCause(value: unknown): value is FixFailureCause {
  return typeof value === "string" && KNOWN_CAUSES.includes(value as FixFailureCause);
}

function normalizeSuggestedFixIds(value: unknown): AllowedFixId[] {
  if (!Array.isArray(value)) return [];
  const out: AllowedFixId[] = [];
  const seen = new Set<AllowedFixId>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const fixId = raw.trim();
    if (!fixId || !isAllowedFixId(fixId) || seen.has(fixId)) continue;
    seen.add(fixId);
    out.push(fixId);
    if (out.length >= 6) break;
  }
  return out;
}

function normalizeAnalysis(value: unknown): FixFailureAnalysis | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (!isKnownCause(row.cause)) return undefined;
  const summary = toNullableText(row.summary, 500);
  if (!summary) return undefined;
  return {
    cause: row.cause,
    summary,
    suggestedFixIds: normalizeSuggestedFixIds(row.suggestedFixIds),
  };
}

function normalizeStep(value: unknown): FixHistoryStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fixId = toNullableText(row.fixId, 80);
  if (!fixId) return null;
  return {
    fixId,
    ok: Boolean(row.ok),
    tookMs: toPositiveInt(row.tookMs),
    stdoutTail: toText(row.stdoutTail, 2000),
    stderrTail: toText(row.stderrTail, 2000),
    errorCode: toNullableText(row.errorCode, 80),
    errorMessage: toNullableText(row.errorMessage, 500),
    analysis: normalizeAnalysis(row.analysis),
  };
}

function normalizeSteps(value: unknown): FixHistoryStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map((entry) => normalizeStep(entry)).filter((entry): entry is FixHistoryStep => entry !== null).slice(0, 20);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEntry(value: unknown): FixHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = toNullableText(row.id, 80);
  const createdAt = toNullableText(row.createdAt, 80);
  const fixId = toNullableText(row.fixId, 80);
  if (!id || !createdAt || !fixId) return null;
  if (!Number.isFinite(Date.parse(createdAt))) return null;
  return {
    id,
    createdAt: new Date(createdAt).toISOString(),
    fixId,
    ok: Boolean(row.ok),
    tookMs: toPositiveInt(row.tookMs),
    stdoutTail: toText(row.stdoutTail, 2000),
    stderrTail: toText(row.stderrTail, 2000),
    errorCode: toNullableText(row.errorCode, 80),
    errorMessage: toNullableText(row.errorMessage, 500),
    chainId: toNullableText(row.chainId, 80) ?? undefined,
    steps: normalizeSteps(row.steps),
    analysis: normalizeAnalysis(row.analysis),
  };
}

function writeAll(rows: FixHistoryEntry[], filePath = resolveHistoryPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(rows, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function readAll(): FixHistoryEntry[] {
  const filePath = resolveHistoryPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      writeAll([], filePath);
      return [];
    }
    const normalized = parsed.map((entry) => normalizeEntry(entry)).filter((entry): entry is FixHistoryEntry => entry !== null);
    if (normalized.length !== parsed.length) {
      writeAll(normalized, filePath);
    }
    return normalized;
  } catch {
    writeAll([], filePath);
    return [];
  }
}

export function appendFixHistory(input: FixHistoryInput): FixHistoryEntry {
  const entry: FixHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    fixId: toNullableText(input.fixId, 80) ?? "UNKNOWN",
    ok: Boolean(input.ok),
    tookMs: toPositiveInt(input.tookMs),
    stdoutTail: toText(input.stdoutTail, 2000),
    stderrTail: toText(input.stderrTail, 2000),
    errorCode: toNullableText(input.errorCode, 80),
    errorMessage: toNullableText(input.errorMessage, 500),
    chainId: toNullableText(input.chainId, 80) ?? undefined,
    steps: normalizeSteps(input.steps),
    analysis: normalizeAnalysis(input.analysis),
  };

  const rows = readAll();
  rows.push(entry);
  const capped = rows.length > MAX_FIX_HISTORY_ITEMS ? rows.slice(rows.length - MAX_FIX_HISTORY_ITEMS) : rows;
  writeAll(capped);
  return entry;
}

export function listFixHistory(limit = 20): FixHistoryEntry[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 20;
  if (safeLimit <= 0) return [];
  return readAll().slice(-safeLimit).reverse();
}
