import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { decodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { AlertEventSchema } from "../alerts/contracts";
import { ExposureProfileSchema } from "../exposure/contracts";
import { IndicatorsStateSchema, ObservationSchema, SeriesSnapshotMetaSchema } from "../indicators/contracts";
import { JournalEntrySchema } from "../journal/contracts";
import { NewsItemSchema, RuntimeStateSchema, TopicDailyStatSchema } from "../news/contracts";
import { runV3Doctor } from "./doctor";

type IssueLevel = "error" | "warning";

type RestoreIssue = {
  level: IssueLevel;
  path: string;
  code: string;
  message: string;
};

type RestoreEntry = {
  path: string;
  bytes: Buffer;
};

type RestorePlan = {
  archivePath: string;
  checkedAt: string;
  entries: RestoreEntry[];
  totals: {
    entries: number;
    bytes: number;
    errors: number;
    warnings: number;
  };
  issues: RestoreIssue[];
};

type ParsedArgs = {
  archivePath: string;
  apply: boolean;
};

type RunV3RestoreInput = {
  cwd?: string;
  archivePath?: string;
  apply?: boolean;
  now?: Date;
};

export type V3RestoreSummary = {
  mode: "preview" | "apply";
  archivePath: string;
  checkedAt: string;
  backupPath?: string;
  totals: {
    entries: number;
    restoredFiles: number;
    restoredBytes: number;
    errors: number;
    warnings: number;
  };
  issues: RestoreIssue[];
  doctor?: {
    ok: boolean;
    errors: number;
    warnings: number;
  };
};

const OBS_DATE_REGEX = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]))?$/;
const ENV_FILE_RE = /(^|\/)\.env(?:\.|$)/i;
const SECRET_FILE_RE = /(^|[._-])(secret|token|credential|password|passwd|private[_-]?key|api[_-]?key)([._-]|$)/i;

const ALLOWED_PREFIXES = [
  ".data/news/",
  ".data/indicators/",
  ".data/alerts/",
  ".data/journal/",
  ".data/exposure/",
  ".data/planning_v3_drafts/",
] as const;

const IndicatorsMetaFileSchema = z.object({
  seriesId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  meta: SeriesSnapshotMetaSchema,
  observations: z.object({
    count: z.number().int().nonnegative(),
    firstDate: z.string().trim().regex(OBS_DATE_REGEX).optional(),
    lastDate: z.string().trim().regex(OBS_DATE_REGEX).optional(),
  }),
});

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function isAllowedPath(entryPath: string): boolean {
  const normalized = toPosix(entryPath);
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isSensitivePath(entryPath: string): boolean {
  const normalized = toPosix(entryPath).toLowerCase();
  if (ENV_FILE_RE.test(normalized)) return true;
  const base = path.posix.basename(normalized);
  if (base.startsWith(".env")) return true;
  return SECRET_FILE_RE.test(base);
}

function addIssue(issues: RestoreIssue[], totals: RestorePlan["totals"], issue: RestoreIssue): void {
  issues.push(issue);
  if (issue.level === "error") {
    totals.errors += 1;
  } else {
    totals.warnings += 1;
  }
}

function parseJson(value: Buffer): unknown {
  return JSON.parse(value.toString("utf-8")) as unknown;
}

function parseJsonLines(value: Buffer): unknown[] {
  return value
    .toString("utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function validateEntrySchema(entryPath: string, bytes: Buffer): void {
  if (/^\.data\/news\/items\/[^/]+\.json$/i.test(entryPath)) {
    NewsItemSchema.parse(parseJson(bytes));
    return;
  }
  if (entryPath === ".data/news/state.json") {
    RuntimeStateSchema.parse(parseJson(bytes));
    return;
  }
  if (/^\.data\/news\/daily\/[^/]+\.json$/i.test(entryPath)) {
    const parsed = parseJson(bytes);
    if (!Array.isArray(parsed)) {
      throw new Error("daily_array_expected");
    }
    for (const row of parsed) {
      TopicDailyStatSchema.parse(row);
    }
    return;
  }

  if (/^\.data\/indicators\/series\/[^/]+\.jsonl$/i.test(entryPath)) {
    for (const row of parseJsonLines(bytes)) {
      ObservationSchema.parse(row);
    }
    return;
  }
  if (/^\.data\/indicators\/meta\/[^/]+\.json$/i.test(entryPath)) {
    IndicatorsMetaFileSchema.parse(parseJson(bytes));
    return;
  }
  if (entryPath === ".data/indicators/state.json") {
    IndicatorsStateSchema.parse(parseJson(bytes));
    return;
  }

  if (entryPath === ".data/alerts/events.jsonl") {
    for (const row of parseJsonLines(bytes)) {
      AlertEventSchema.parse(row);
    }
    return;
  }

  if (/^\.data\/journal\/entries\/[^/]+\.json$/i.test(entryPath)) {
    JournalEntrySchema.parse(parseJson(bytes));
    return;
  }

  if (entryPath === ".data/exposure/profile.json") {
    ExposureProfileSchema.parse(parseJson(bytes));
    return;
  }

  if (entryPath.startsWith(".data/planning_v3_drafts/")) {
    // Draft artifacts can evolve by feature; keep structure-only validation here.
    return;
  }

  // Unknown but allowed paths are warning-only in caller.
}

async function buildRestorePlan(input: {
  rootDir: string;
  archivePath: string;
  now: Date;
}): Promise<RestorePlan> {
  const archivePath = path.resolve(input.archivePath);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`ARCHIVE_NOT_FOUND:${archivePath}`);
  }

  const zipBuffer = fs.readFileSync(archivePath);
  const decoded = await decodeZip(zipBuffer, {
    maxEntries: 20000,
    maxTotalBytes: 1024 * 1024 * 512,
  });

  const issues: RestoreIssue[] = [];
  const totals: RestorePlan["totals"] = {
    entries: 0,
    bytes: 0,
    errors: 0,
    warnings: 0,
  };

  const entries: RestoreEntry[] = [];
  for (const [entryPathRaw, bytes] of [...decoded.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const entryPath = toPosix(asString(entryPathRaw));
    totals.entries += 1;
    totals.bytes += bytes.length;

    if (!isAllowedPath(entryPath)) {
      addIssue(issues, totals, {
        level: "error",
        path: entryPath,
        code: "PATH_NOT_ALLOWED",
        message: "v3 허용 경로(.data/news|indicators|alerts|journal|exposure|planning_v3_drafts) 밖의 파일입니다.",
      });
      continue;
    }

    if (isSensitivePath(entryPath)) {
      addIssue(issues, totals, {
        level: "error",
        path: entryPath,
        code: "SENSITIVE_PATH_BLOCKED",
        message: "환경/시크릿 파일은 restore 대상이 아닙니다.",
      });
      continue;
    }

    try {
      validateEntrySchema(entryPath, bytes);
    } catch {
      addIssue(issues, totals, {
        level: "error",
        path: entryPath,
        code: "SCHEMA_INVALID",
        message: "스키마 검증에 실패했습니다.",
      });
      continue;
    }

    const isKnownSchemaPath =
      /^\.data\/news\/items\/[^/]+\.json$/i.test(entryPath)
      || entryPath === ".data/news/state.json"
      || /^\.data\/news\/daily\/[^/]+\.json$/i.test(entryPath)
      || /^\.data\/indicators\/series\/[^/]+\.jsonl$/i.test(entryPath)
      || /^\.data\/indicators\/meta\/[^/]+\.json$/i.test(entryPath)
      || entryPath === ".data/indicators/state.json"
      || entryPath === ".data/alerts/events.jsonl"
      || /^\.data\/journal\/entries\/[^/]+\.json$/i.test(entryPath)
      || entryPath === ".data/exposure/profile.json"
      || entryPath.startsWith(".data/planning_v3_drafts/");

    if (!isKnownSchemaPath) {
      addIssue(issues, totals, {
        level: "warning",
        path: entryPath,
        code: "UNKNOWN_ALLOWED_PATH",
        message: "허용 경로 내 확장 파일입니다. 구조만 허용하고 상세 스키마 검증은 생략했습니다.",
      });
    }

    entries.push({ path: entryPath, bytes });
  }

  return {
    archivePath,
    checkedAt: input.now.toISOString(),
    entries,
    totals,
    issues,
  };
}

function makeBackupPath(rootDir: string, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const base = path.join(rootDir, `.data.bak-${yyyy}${mm}${dd}${hh}${mi}${ss}`);

  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("BACKUP_PATH_EXHAUSTED");
}

function restoreEntries(rootDir: string, entries: RestoreEntry[]): { restoredFiles: number; restoredBytes: number } {
  let restoredFiles = 0;
  let restoredBytes = 0;

  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    const targetPath = path.resolve(rootDir, entry.path);
    if (!toPosix(targetPath).startsWith(toPosix(path.resolve(rootDir)) + "/")) {
      throw new Error(`RESTORE_PATH_ESCAPE:${entry.path}`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.bytes);
    restoredFiles += 1;
    restoredBytes += entry.bytes.length;
  }

  return { restoredFiles, restoredBytes };
}

function parseArgs(argv: string[]): ParsedArgs {
  let archivePath = "";
  let apply = false;

  for (const token of argv) {
    const normalized = asString(token);
    if (!normalized.startsWith("--")) continue;
    if (normalized === "--apply") {
      apply = true;
      continue;
    }
    if (normalized.startsWith("--in=")) {
      archivePath = normalized.slice("--in=".length);
    }
  }

  if (!archivePath) {
    throw new Error("ARG_REQUIRED:--in=<zip path>");
  }

  return {
    archivePath,
    apply,
  };
}

export async function runV3Restore(input: RunV3RestoreInput = {}): Promise<V3RestoreSummary> {
  const rootDir = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const archivePath = asString(input.archivePath);

  if (!archivePath) {
    throw new Error("ARG_REQUIRED:archivePath");
  }

  const plan = await buildRestorePlan({
    rootDir,
    archivePath: path.isAbsolute(archivePath) ? archivePath : path.resolve(rootDir, archivePath),
    now,
  });

  const mode: V3RestoreSummary["mode"] = input.apply ? "apply" : "preview";
  const baseSummary: V3RestoreSummary = {
    mode,
    archivePath: plan.archivePath,
    checkedAt: plan.checkedAt,
    totals: {
      entries: plan.totals.entries,
      restoredFiles: 0,
      restoredBytes: 0,
      errors: plan.totals.errors,
      warnings: plan.totals.warnings,
    },
    issues: plan.issues,
  };

  if (!input.apply) {
    return baseSummary;
  }

  if (plan.totals.errors > 0) {
    throw new Error("RESTORE_BLOCKED:VALIDATION_FAILED");
  }

  const dataDir = path.join(rootDir, ".data");
  const backupPath = makeBackupPath(rootDir, now);
  let backupCreated = false;

  try {
    if (fs.existsSync(dataDir)) {
      fs.renameSync(dataDir, backupPath);
      backupCreated = true;
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const restored = restoreEntries(rootDir, plan.entries);

    const doctor = runV3Doctor({ cwd: rootDir });
    return {
      ...baseSummary,
      backupPath: backupCreated ? backupPath : undefined,
      totals: {
        ...baseSummary.totals,
        restoredFiles: restored.restoredFiles,
        restoredBytes: restored.restoredBytes,
      },
      doctor: {
        ok: doctor.ok,
        errors: doctor.counts.errors,
        warnings: doctor.counts.warnings,
      },
    };
  } catch (error) {
    if (backupCreated && fs.existsSync(backupPath)) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.renameSync(backupPath, dataDir);
      } catch {
        // ignore rollback failure; keep primary error.
      }
    }
    const message = error instanceof Error ? error.message : "restore_failed";
    throw new Error(`RESTORE_FAILED:${message}`);
  }
}

function printSummary(summary: V3RestoreSummary): void {
  console.log(`[v3:restore] mode=${summary.mode} checkedAt=${summary.checkedAt}`);
  console.log(`[v3:restore] archive=${summary.archivePath}`);
  console.log(`[v3:restore] totals entries=${summary.totals.entries} restoredFiles=${summary.totals.restoredFiles} restoredBytes=${summary.totals.restoredBytes} errors=${summary.totals.errors} warnings=${summary.totals.warnings}`);
  if (summary.backupPath) {
    console.log(`[v3:restore] backup=${summary.backupPath}`);
  }
  if (summary.issues.length > 0) {
    console.log(`[v3:restore] issues=${summary.issues.length}`);
    for (const issue of summary.issues.slice(0, 50)) {
      console.log(`[v3:restore][${issue.level.toUpperCase()}] ${issue.code} ${issue.path} :: ${issue.message}`);
    }
  }
  if (summary.doctor) {
    console.log(`[v3:restore] doctor ok=${summary.doctor.ok} errors=${summary.doctor.errors} warnings=${summary.doctor.warnings}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const summary = await runV3Restore({
    archivePath: args.archivePath,
    apply: args.apply,
  });
  printSummary(summary);
  if (!args.apply) {
    console.log("[v3:restore] dry-run completed. Re-run with --apply to restore.");
  }
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "restore_failed";
    console.error(`[v3:restore] ${message}`);
    process.exitCode = 1;
  });
}
