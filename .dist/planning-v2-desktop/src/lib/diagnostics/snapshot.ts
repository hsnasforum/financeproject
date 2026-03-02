import fs from "node:fs";
import path from "node:path";
import { readDailyRefreshResult } from "../dev/readDailyRefreshResult";
import { listErrors, type ObservedError } from "../observability/errorRingBuffer";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? process.env.npm_package_version ?? null;
const DART_DIR_RELATIVE = path.join("tmp", "dart");
const SENSITIVE_WORDS = [
  "OPENDART_API_KEY",
  "FINLIFE_API_KEY",
  "SERVICE_KEY",
  "API_KEY",
  "TOKEN",
  "SECRET",
];

export type LocalStateSummaryEntry = {
  exists: boolean;
  savedAt: string | null;
};

export type LocalStateSummary = Record<string, LocalStateSummaryEntry>;

export type DiagnosticsPageInfo = {
  url?: string | null;
  userAgent?: string | null;
  localStateSummary?: LocalStateSummary | null;
};

export type DiagnosticsSnapshot = {
  generatedAt: string;
  appVersion: string | null;
  page: {
    url: string | null;
    userAgent: string | null;
  };
  recentErrors: ObservedError[];
  dailyRefresh: {
    generatedAt: string | null;
    ok: boolean;
    steps: Array<{
      name: string;
      status: "ok" | "skipped" | "failed";
      tookMs: number;
    }>;
  } | null;
  dartArtifacts: {
    dirExists: boolean;
    items: Array<{
      name: string;
      exists: boolean;
      updatedAt: string | null;
    }>;
  };
  localStateSummary: LocalStateSummary | null;
};

type BuildDiagnosticsSnapshotInput = {
  req: Request;
  pageInfo?: DiagnosticsPageInfo | null;
  cwd?: string;
  recentErrors?: ObservedError[];
};

function sanitizeText(value: unknown, maxLength = 400): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  let sanitized = compact;
  for (const word of SENSITIVE_WORDS) {
    sanitized = sanitized.replace(new RegExp(word, "gi"), "[REDACTED]");
  }
  sanitized = sanitized
    .replace(/([?&][a-z0-9_.-]{1,60}=)[^&\s]*/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]");
  if (!sanitized) return null;
  return sanitized.slice(0, maxLength);
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const stripped = trimmed.split(/[?#]/, 1)[0] ?? "";
    const cleaned = sanitizeText(stripped, 500);
    return cleaned;
  }
}

function sanitizeObservedError(entry: ObservedError): ObservedError {
  return {
    time: sanitizeText(entry.time, 64) ?? new Date().toISOString(),
    traceId: sanitizeText(entry.traceId, 128) ?? "",
    route: sanitizeUrl(entry.route) ?? (sanitizeText(entry.route, 200) ?? ""),
    source: sanitizeText(entry.source, 64) ?? "",
    code: sanitizeText(entry.code, 64) ?? "UNKNOWN",
    message: sanitizeText(entry.message, 300) ?? "",
    status: Number.isFinite(entry.status) ? Math.max(0, Math.trunc(entry.status)) : 500,
    elapsedMs: Number.isFinite(entry.elapsedMs) ? Math.max(0, Math.trunc(entry.elapsedMs)) : 0,
  };
}

function parseSavedAt(value: unknown): string | null {
  const text = sanitizeText(value, 128);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function sanitizeLocalStateEntry(value: unknown): LocalStateSummaryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: Boolean(row.exists),
    savedAt: parseSavedAt(row.savedAt),
  };
}

export function normalizeLocalStateSummary(value: unknown): LocalStateSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: LocalStateSummary = {};
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = rawKey.trim();
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(key)) continue;
    const entry = sanitizeLocalStateEntry(rawValue);
    if (!entry) continue;
    out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildDartArtifacts(cwd: string): DiagnosticsSnapshot["dartArtifacts"] {
  const dir = path.join(cwd, DART_DIR_RELATIVE);
  if (!fs.existsSync(dir)) {
    return { dirExists: false, items: [] };
  }

  const names = fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const items = names.map((name) => {
    const filePath = path.join(dir, name);
    try {
      const stat = fs.statSync(filePath);
      return {
        name,
        exists: true,
        updatedAt: Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null,
      };
    } catch {
      return {
        name,
        exists: false,
        updatedAt: null,
      };
    }
  });

  return {
    dirExists: true,
    items,
  };
}

function buildDailyRefresh(cwd: string): DiagnosticsSnapshot["dailyRefresh"] {
  const filePath = path.join(cwd, "tmp", "daily_refresh_result.json");
  const read = readDailyRefreshResult(filePath);
  if (read.ok && read.data === null) return null;
  if (read.ok && read.data) {
    return {
      generatedAt: parseSavedAt(read.data.generatedAt),
      ok: Boolean(read.data.ok),
      steps: read.data.steps.map((step) => ({
        name: sanitizeText(step.name, 120) ?? "",
        status: step.status,
        tookMs: Number.isFinite(step.tookMs) ? Math.max(0, Math.trunc(step.tookMs)) : 0,
      })),
    };
  }
  return {
    generatedAt: null,
    ok: false,
    steps: [],
  };
}

function parseLocalStateHeader(request: Request): LocalStateSummary | null {
  const raw = request.headers.get("x-local-state-summary");
  const text = sanitizeText(raw, 8_000);
  if (!text) return null;
  try {
    const decoded = decodeURIComponent(text);
    return normalizeLocalStateSummary(JSON.parse(decoded) as unknown);
  } catch {
    return null;
  }
}

export function parseDiagnosticsPageInfoFromRequest(request: Request): DiagnosticsPageInfo {
  return {
    url: sanitizeUrl(request.headers.get("x-page-url")) ?? sanitizeUrl(request.headers.get("referer")),
    userAgent: sanitizeText(request.headers.get("user-agent"), 300),
    localStateSummary: parseLocalStateHeader(request),
  };
}

export function buildDiagnosticsSnapshot(input: BuildDiagnosticsSnapshotInput): DiagnosticsSnapshot {
  const cwd = input.cwd ?? process.cwd();
  const pageUrl = sanitizeUrl(input.pageInfo?.url) ?? sanitizeUrl(input.req.headers.get("x-page-url")) ?? sanitizeUrl(input.req.headers.get("referer")) ?? sanitizeUrl(input.req.url);
  const pageUserAgent = sanitizeText(input.pageInfo?.userAgent, 300) ?? sanitizeText(input.req.headers.get("user-agent"), 300);
  const localStateSummary = normalizeLocalStateSummary(input.pageInfo?.localStateSummary) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    appVersion: sanitizeText(APP_VERSION, 80),
    page: {
      url: pageUrl,
      userAgent: pageUserAgent,
    },
    recentErrors: (Array.isArray(input.recentErrors) ? input.recentErrors : listErrors(20)).map((entry) => sanitizeObservedError(entry)).slice(0, 20),
    dailyRefresh: buildDailyRefresh(cwd),
    dartArtifacts: buildDartArtifacts(cwd),
    localStateSummary,
  };
}

export function normalizeDiagnosticsSnapshot(value: unknown): DiagnosticsSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const generatedAt = parseSavedAt(row.generatedAt);
  if (!generatedAt) return undefined;

  const pageRaw = row.page && typeof row.page === "object" && !Array.isArray(row.page)
    ? (row.page as Record<string, unknown>)
    : {};
  const page = {
    url: sanitizeUrl(pageRaw.url),
    userAgent: sanitizeText(pageRaw.userAgent, 300),
  };

  const errorsRaw = Array.isArray(row.recentErrors) ? row.recentErrors : [];
  const recentErrors = errorsRaw
    .filter((item): item is ObservedError => Boolean(item && typeof item === "object"))
    .map((item) => sanitizeObservedError(item))
    .slice(0, 20);

  let dailyRefresh: DiagnosticsSnapshot["dailyRefresh"] = null;
  if (row.dailyRefresh && typeof row.dailyRefresh === "object" && !Array.isArray(row.dailyRefresh)) {
    const daily = row.dailyRefresh as Record<string, unknown>;
    const stepsRaw = Array.isArray(daily.steps) ? daily.steps : [];
    dailyRefresh = {
      generatedAt: parseSavedAt(daily.generatedAt),
      ok: Boolean(daily.ok),
      steps: stepsRaw
        .filter((step): step is Record<string, unknown> => Boolean(step && typeof step === "object"))
        .map((step) => {
          const statusText = sanitizeText(step.status, 16);
          const status: "ok" | "skipped" | "failed" = statusText === "skipped" || statusText === "failed" ? statusText : "ok";
          return {
            name: sanitizeText(step.name, 120) ?? "",
            status,
            tookMs: Number.isFinite(step.tookMs) ? Math.max(0, Math.trunc(Number(step.tookMs))) : 0,
          };
        })
        .filter((step) => step.name.length > 0)
        .slice(0, 50),
    };
  }

  let dartArtifacts: DiagnosticsSnapshot["dartArtifacts"] = { dirExists: false, items: [] };
  if (row.dartArtifacts && typeof row.dartArtifacts === "object" && !Array.isArray(row.dartArtifacts)) {
    const dart = row.dartArtifacts as Record<string, unknown>;
    const itemsRaw = Array.isArray(dart.items) ? dart.items : [];
    dartArtifacts = {
      dirExists: Boolean(dart.dirExists),
      items: itemsRaw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          name: sanitizeText(item.name, 120) ?? "unknown.json",
          exists: Boolean(item.exists),
          updatedAt: parseSavedAt(item.updatedAt),
        }))
        .slice(0, 200),
    };
  }

  return {
    generatedAt,
    appVersion: sanitizeText(row.appVersion, 80),
    page,
    recentErrors,
    dailyRefresh,
    dartArtifacts,
    localStateSummary: normalizeLocalStateSummary(row.localStateSummary),
  };
}
