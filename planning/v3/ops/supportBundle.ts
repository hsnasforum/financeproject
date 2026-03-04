import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { encodeZip, type ZipFileEntry } from "../../../src/lib/ops/backup/zipCodec";
import { AlertEventSchema } from "../alerts/contracts";
import { ExposureProfileSchema } from "../exposure/contracts";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "../indicators/specs";
import { ObservationSchema } from "../indicators/contracts";
import { JournalEntrySchema } from "../journal/contracts";
import { NewsItemSchema } from "../news/contracts";
import { loadEffectiveNewsConfig } from "../news/settings";
import { runV3Doctor } from "./doctor";
import { parseWithV3Whitelist } from "../security/whitelist";

type DateRange = {
  min: string | null;
  max: string | null;
};

const DateRangeSchema = z.object({
  min: z.string().trim().min(1).nullable(),
  max: z.string().trim().min(1).nullable(),
});

const SupportBundlePayloadSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  app: z.object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  runtime: z.object({
    nodeVersion: z.string().trim().min(1),
    platform: z.string().trim().min(1),
  }),
  doctorSummary: z.object({
    ok: z.boolean(),
    checkedAt: z.string().datetime(),
    counts: z.object({
      checks: z.number().int().nonnegative(),
      files: z.number().int().nonnegative(),
      errors: z.number().int().nonnegative(),
      warnings: z.number().int().nonnegative(),
    }),
    checks: z.array(z.object({
      check: z.string().trim().min(1),
      files: z.number().int().nonnegative(),
      errors: z.number().int().nonnegative(),
      warnings: z.number().int().nonnegative(),
    })),
  }),
  scanSummary: z.object({
    allowedFiles: z.number().int().nonnegative(),
    skippedOutsideWhitelist: z.number().int().nonnegative(),
    blockedSensitivePaths: z.number().int().nonnegative(),
    whitelistedRoots: z.array(z.string().trim().min(1)),
  }),
  dataSummary: z.object({
    news: z.object({
      itemCount: z.number().int().nonnegative(),
      publishedAtRange: DateRangeSchema,
      fetchedAtRange: DateRangeSchema,
      dailyFileCount: z.number().int().nonnegative(),
      dailyDateRange: DateRangeSchema,
      enabledSourceIds: z.array(z.string().trim().min(1)),
    }),
    indicators: z.object({
      seriesFileCount: z.number().int().nonnegative(),
      observationCount: z.number().int().nonnegative(),
      observationDateRange: DateRangeSchema,
      metaFileCount: z.number().int().nonnegative(),
      enabledSourceIds: z.array(z.string().trim().min(1)),
      enabledSeriesIds: z.array(z.string().trim().min(1)),
    }),
    alerts: z.object({
      eventCount: z.number().int().nonnegative(),
      createdAtRange: DateRangeSchema,
      dayRange: DateRangeSchema,
    }),
    journal: z.object({
      entryCount: z.number().int().nonnegative(),
      dateRange: DateRangeSchema,
      updatedAtRange: DateRangeSchema,
    }),
    exposure: z.object({
      exists: z.boolean(),
      savedAt: z.string().datetime().nullable(),
    }),
    drafts: z.object({
      fileCount: z.number().int().nonnegative(),
    }),
  }),
});

type SupportBundlePayload = z.infer<typeof SupportBundlePayloadSchema>;

type ParsedArgs = {
  out: string;
};

type BuildSupportBundleInput = {
  cwd?: string;
  out: string;
  now?: Date;
};

type AllowedFileScan = {
  relPath: string;
  absPath: string;
};

type ScanSummary = {
  allowedFiles: number;
  skippedOutsideWhitelist: number;
  blockedSensitivePaths: number;
  whitelistedRoots: string[];
};

type V3SupportBundlePlan = {
  generatedAt: string;
  archivePath: string;
  payload: SupportBundlePayload;
  scanSummary: ScanSummary;
};

export type V3SupportBundleSummary = {
  generatedAt: string;
  archivePath: string;
  archiveBytes: number;
  scanSummary: ScanSummary;
  doctor: {
    ok: boolean;
    errors: number;
    warnings: number;
  };
};

export const SUPPORT_BUNDLE_ENTRY_PATH = "support-bundle.json";

export const SUPPORT_BUNDLE_WHITELIST_PREFIXES = [
  ".data/news/",
  ".data/indicators/",
  ".data/alerts/",
  ".data/journal/",
  ".data/exposure/",
  ".data/planning_v3_drafts/",
] as const;

const ENV_FILE_RE = /(^|\/)\.env(?:\.|$)/i;
const SECRET_FILE_RE = /(^|[._-])(secret|token|credential|password|passwd|private[_-]?key|api[_-]?key)([._-]|$)/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function emptyRange(): DateRange {
  return { min: null, max: null };
}

function pushRange(range: DateRange, value: unknown): void {
  const token = asString(value);
  if (!token) return;
  if (!range.min || token < range.min) range.min = token;
  if (!range.max || token > range.max) range.max = token;
}

function normalizeOutPath(rootDir: string, outPath: string): string {
  const normalized = asString(outPath);
  if (!normalized) {
    throw new Error("ARG_REQUIRED:--out=<zip path>");
  }
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(rootDir, normalized);
}

function parseArgs(argv: string[]): ParsedArgs {
  let out = "";

  for (let i = 0; i < argv.length; i += 1) {
    const token = asString(argv[i]);
    if (!token.startsWith("--")) continue;
    if (token.startsWith("--out=")) {
      out = token.slice("--out=".length);
      continue;
    }
    if (token === "--out") {
      out = asString(argv[i + 1]);
      i += 1;
    }
  }

  if (!out) {
    throw new Error("ARG_REQUIRED:--out=<zip path>");
  }

  return { out };
}

function collectFilesRecursively(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: string[] = [];

  const walk = (dirPath: string): void => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const nextPath = path.join(dirPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(nextPath);
        continue;
      }
      if (entry.isFile()) out.push(nextPath);
    }
  };

  walk(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function isSensitivePath(relPath: string): boolean {
  const normalized = toPosix(relPath).toLowerCase();
  if (ENV_FILE_RE.test(normalized)) return true;
  const baseName = path.posix.basename(normalized);
  if (baseName.startsWith(".env")) return true;
  return SECRET_FILE_RE.test(baseName);
}

export function isWhitelistedSupportPath(relPath: string): boolean {
  const normalized = toPosix(asString(relPath));
  if (!normalized.startsWith(".data/")) return false;
  return SUPPORT_BUNDLE_WHITELIST_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function scanAllowedFiles(rootDir: string): {
  files: AllowedFileScan[];
  summary: ScanSummary;
} {
  const files: AllowedFileScan[] = [];
  const summary: ScanSummary = {
    allowedFiles: 0,
    skippedOutsideWhitelist: 0,
    blockedSensitivePaths: 0,
    whitelistedRoots: [...SUPPORT_BUNDLE_WHITELIST_PREFIXES],
  };

  const dataRoot = path.join(rootDir, ".data");
  for (const absPath of collectFilesRecursively(dataRoot)) {
    const relPath = toPosix(path.relative(rootDir, absPath));
    if (!relPath.startsWith(".data/")) {
      summary.skippedOutsideWhitelist += 1;
      continue;
    }
    if (isSensitivePath(relPath)) {
      summary.blockedSensitivePaths += 1;
      continue;
    }
    if (!isWhitelistedSupportPath(relPath)) {
      summary.skippedOutsideWhitelist += 1;
      continue;
    }

    files.push({ relPath, absPath });
    summary.allowedFiles += 1;
  }

  return { files, summary };
}

function readJson(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

function readJsonLines(filePath: string): unknown[] {
  try {
    return fs.readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    return [];
  }
}

function buildNewsSummary(rootDir: string, files: AllowedFileScan[]): SupportBundlePayload["dataSummary"]["news"] {
  const newsRoot = path.join(rootDir, ".data", "news");
  const config = loadEffectiveNewsConfig(newsRoot);
  const publishedAtRange = emptyRange();
  const fetchedAtRange = emptyRange();
  const dailyDateRange = emptyRange();

  let itemCount = 0;
  let dailyFileCount = 0;

  for (const file of files) {
    if (/^\.data\/news\/items\/[^/]+\.json$/i.test(file.relPath)) {
      const parsed = readJson(file.absPath);
      const item = parsed ? NewsItemSchema.safeParse(parsed) : null;
      if (!item?.success) continue;
      itemCount += 1;
      pushRange(publishedAtRange, item.data.publishedAt ?? null);
      pushRange(fetchedAtRange, item.data.fetchedAt);
      continue;
    }

    const dailyMatch = file.relPath.match(/^\.data\/news\/daily\/(\d{4}-\d{2}-\d{2})\.json$/i);
    if (dailyMatch) {
      dailyFileCount += 1;
      pushRange(dailyDateRange, dailyMatch[1]);
    }
  }

  const enabledSourceIds = config.sources
    .filter((row) => row.enabled)
    .map((row) => row.id)
    .sort((a, b) => a.localeCompare(b));

  return {
    itemCount,
    publishedAtRange,
    fetchedAtRange,
    dailyFileCount,
    dailyDateRange,
    enabledSourceIds,
  };
}

function buildIndicatorsSummary(files: AllowedFileScan[]): SupportBundlePayload["dataSummary"]["indicators"] {
  let seriesFileCount = 0;
  let observationCount = 0;
  const observationDateRange = emptyRange();
  let metaFileCount = 0;

  for (const file of files) {
    if (/^\.data\/indicators\/series\/[^/]+\.jsonl$/i.test(file.relPath)) {
      seriesFileCount += 1;
      for (const row of readJsonLines(file.absPath)) {
        const parsed = ObservationSchema.safeParse(row);
        if (!parsed.success) continue;
        observationCount += 1;
        pushRange(observationDateRange, parsed.data.date);
      }
      continue;
    }
    if (/^\.data\/indicators\/meta\/[^/]+\.json$/i.test(file.relPath)) {
      metaFileCount += 1;
    }
  }

  const enabledSourceIds = INDICATOR_SOURCES
    .filter((row) => row.enabled)
    .map((row) => row.id)
    .sort((a, b) => a.localeCompare(b));
  const enabledSources = new Set(enabledSourceIds);
  const enabledSeriesIds = INDICATOR_SERIES_SPECS
    .filter((row) => row.enabled !== false && enabledSources.has(row.sourceId))
    .map((row) => row.id)
    .sort((a, b) => a.localeCompare(b));

  return {
    seriesFileCount,
    observationCount,
    observationDateRange,
    metaFileCount,
    enabledSourceIds,
    enabledSeriesIds,
  };
}

function buildAlertsSummary(files: AllowedFileScan[]): SupportBundlePayload["dataSummary"]["alerts"] {
  const createdAtRange = emptyRange();
  const dayRange = emptyRange();
  let eventCount = 0;

  for (const file of files) {
    if (file.relPath !== ".data/alerts/events.jsonl") continue;
    for (const row of readJsonLines(file.absPath)) {
      const parsed = AlertEventSchema.safeParse(row);
      if (!parsed.success) continue;
      eventCount += 1;
      pushRange(createdAtRange, parsed.data.createdAt);
      pushRange(dayRange, parsed.data.dayKst);
    }
  }

  return {
    eventCount,
    createdAtRange,
    dayRange,
  };
}

function buildJournalSummary(files: AllowedFileScan[]): SupportBundlePayload["dataSummary"]["journal"] {
  const dateRange = emptyRange();
  const updatedAtRange = emptyRange();
  let entryCount = 0;

  for (const file of files) {
    if (!/^\.data\/journal\/entries\/[^/]+\.json$/i.test(file.relPath)) continue;
    const parsed = readJson(file.absPath);
    const entry = parsed ? JournalEntrySchema.safeParse(parsed) : null;
    if (!entry?.success) continue;
    entryCount += 1;
    pushRange(dateRange, entry.data.date);
    pushRange(updatedAtRange, entry.data.updatedAt);
  }

  return {
    entryCount,
    dateRange,
    updatedAtRange,
  };
}

function buildExposureSummary(rootDir: string): SupportBundlePayload["dataSummary"]["exposure"] {
  const filePath = path.join(rootDir, ".data", "exposure", "profile.json");
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      savedAt: null,
    };
  }
  const parsed = readJson(filePath);
  const profile = parsed ? ExposureProfileSchema.safeParse(parsed) : null;
  if (!profile?.success) {
    return {
      exists: true,
      savedAt: null,
    };
  }
  return {
    exists: true,
    savedAt: profile.data.savedAt ?? null,
  };
}

function countDraftFiles(files: AllowedFileScan[]): number {
  return files.filter((row) => row.relPath.startsWith(".data/planning_v3_drafts/")).length;
}

function readAppInfo(rootDir: string): { name: string; version: string } {
  const packagePath = path.join(rootDir, "package.json");
  const parsed = readJson(packagePath);
  if (!parsed || typeof parsed !== "object") {
    return { name: "finance", version: "unknown" };
  }
  const record = parsed as Record<string, unknown>;
  return {
    name: asString(record.name) || "finance",
    version: asString(record.version) || "unknown",
  };
}

export function buildV3SupportBundlePlan(input: BuildSupportBundleInput): V3SupportBundlePlan {
  const rootDir = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const archivePath = normalizeOutPath(rootDir, input.out);

  const scan = scanAllowedFiles(rootDir);
  const doctor = runV3Doctor({ cwd: rootDir });
  const app = readAppInfo(rootDir);

  const payload = parseWithV3Whitelist(SupportBundlePayloadSchema, {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    app,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    doctorSummary: {
      ok: doctor.ok,
      checkedAt: doctor.checkedAt,
      counts: doctor.counts,
      checks: doctor.summaries,
    },
    scanSummary: scan.summary,
    dataSummary: {
      news: buildNewsSummary(rootDir, scan.files),
      indicators: buildIndicatorsSummary(scan.files),
      alerts: buildAlertsSummary(scan.files),
      journal: buildJournalSummary(scan.files),
      exposure: buildExposureSummary(rootDir),
      drafts: {
        fileCount: countDraftFiles(scan.files),
      },
    },
  }, {
    scope: "persistence",
    context: "v3.supportBundle",
  });

  return {
    generatedAt: payload.generatedAt,
    archivePath,
    payload,
    scanSummary: scan.summary,
  };
}

export function writeV3SupportBundle(plan: V3SupportBundlePlan): V3SupportBundleSummary {
  const entries: ZipFileEntry[] = [
    {
      path: SUPPORT_BUNDLE_ENTRY_PATH,
      bytes: Buffer.from(`${JSON.stringify(plan.payload, null, 2)}\n`, "utf-8"),
    },
  ];

  fs.mkdirSync(path.dirname(plan.archivePath), { recursive: true });
  const archiveBytes = encodeZip(entries);
  fs.writeFileSync(plan.archivePath, archiveBytes);

  return {
    generatedAt: plan.generatedAt,
    archivePath: plan.archivePath,
    archiveBytes: archiveBytes.length,
    scanSummary: plan.scanSummary,
    doctor: {
      ok: plan.payload.doctorSummary.ok,
      errors: plan.payload.doctorSummary.counts.errors,
      warnings: plan.payload.doctorSummary.counts.warnings,
    },
  };
}

export function runV3SupportBundle(input: BuildSupportBundleInput): V3SupportBundleSummary {
  const plan = buildV3SupportBundlePlan(input);
  return writeV3SupportBundle(plan);
}

function printDryRunSummary(plan: V3SupportBundlePlan): void {
  console.log(`[v3:support-bundle] dry-run generatedAt=${plan.generatedAt}`);
  console.log(`[v3:support-bundle] archive=${plan.archivePath}`);
  console.log(`[v3:support-bundle] scan allowed=${plan.scanSummary.allowedFiles} outsideWhitelist=${plan.scanSummary.skippedOutsideWhitelist} blockedSensitive=${plan.scanSummary.blockedSensitivePaths}`);
  console.log(`[v3:support-bundle] doctor ok=${plan.payload.doctorSummary.ok} errors=${plan.payload.doctorSummary.counts.errors} warnings=${plan.payload.doctorSummary.counts.warnings}`);
  console.log(`[v3:support-bundle] news items=${plan.payload.dataSummary.news.itemCount} indicators.observations=${plan.payload.dataSummary.indicators.observationCount} alerts.events=${plan.payload.dataSummary.alerts.eventCount} journal.entries=${plan.payload.dataSummary.journal.entryCount}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildV3SupportBundlePlan({ out: args.out });
  printDryRunSummary(plan);
  const result = writeV3SupportBundle(plan);
  console.log(`[v3:support-bundle] archiveBytes=${result.archiveBytes}`);
  console.log(`[v3:support-bundle] done`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "support_bundle_failed";
    console.error(`[v3:support-bundle] ${message}`);
    process.exitCode = 1;
  }
}
