import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ExposureProfileSchema } from "../exposure/contracts";
import { IndicatorsStateSchema } from "../indicators/contracts";
import { DailyDigestSchema, NewsSettingsSchema, RuntimeStateSchema } from "../news/contracts";
import { ScenariosCacheSchema, TodayCacheSchema, TrendsCacheSchema } from "../news/store";
import { runV3Doctor } from "./doctor";

type MigrateMode = "preview" | "apply";

type ParsedArgs = {
  apply: boolean;
  root?: string;
};

type MigrationIssue = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

type MigrationFileResult = {
  path: string;
  exists: boolean;
  currentSchemaVersion: number | null;
  nextSchemaVersion: number | null;
  changed: boolean;
  stepIds: string[];
  valid: boolean;
};

type MigrationPlan = {
  checkedAt: string;
  files: MigrationFileResult[];
  writes: Array<{ path: string; value: unknown }>;
  issues: MigrationIssue[];
  totals: {
    targets: number;
    existing: number;
    changed: number;
    errors: number;
    warnings: number;
  };
};

export type V3MigrateSummary = {
  mode: MigrateMode;
  checkedAt: string;
  backupPath?: string;
  totals: {
    targets: number;
    existing: number;
    changed: number;
    applied: number;
    errors: number;
    warnings: number;
  };
  files: MigrationFileResult[];
  issues: MigrationIssue[];
  doctor?: {
    ok: boolean;
    errors: number;
    warnings: number;
  };
};

type MigrateTarget = {
  relPath: string;
  schema: z.ZodTypeAny;
};

type RunV3MigrateInput = {
  cwd?: string;
  apply?: boolean;
  now?: Date;
};

const CURRENT_SCHEMA_VERSION = 1;

const TARGETS: MigrateTarget[] = [
  { relPath: ".data/news/state.json", schema: RuntimeStateSchema },
  { relPath: ".data/news/settings.json", schema: NewsSettingsSchema },
  { relPath: ".data/news/digest.latest.json", schema: DailyDigestSchema },
  { relPath: ".data/news/cache/today.latest.json", schema: TodayCacheSchema },
  { relPath: ".data/news/cache/trends.7d.latest.json", schema: TrendsCacheSchema },
  { relPath: ".data/news/cache/trends.30d.latest.json", schema: TrendsCacheSchema },
  { relPath: ".data/news/cache/scenarios.latest.json", schema: ScenariosCacheSchema },
  { relPath: ".data/indicators/state.json", schema: IndicatorsStateSchema },
  { relPath: ".data/exposure/profile.json", schema: ExposureProfileSchema },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv: string[]): ParsedArgs {
  let apply = false;
  let root = "";

  for (const token of argv) {
    const normalized = asString(token);
    if (!normalized.startsWith("--")) continue;
    if (normalized === "--apply") {
      apply = true;
      continue;
    }
    if (normalized.startsWith("--root=")) {
      root = normalized.slice("--root=".length);
    }
  }

  return {
    apply,
    root: root || undefined,
  };
}

function formatStamp(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function resolveBackupPath(rootDir: string, now: Date): string {
  const base = path.join(rootDir, `.data.bak-${formatStamp(now)}`);
  if (!fs.existsSync(base)) return base;

  for (let i = 1; i < 1000; i += 1) {
    const next = `${base}-${i}`;
    if (!fs.existsSync(next)) return next;
  }

  throw new Error("BACKUP_PATH_EXHAUSTED");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON_OBJECT_REQUIRED");
  }
  return value as Record<string, unknown>;
}

function toVersion(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function pushIssue(list: MigrationIssue[], totals: MigrationPlan["totals"], issue: MigrationIssue): void {
  list.push(issue);
  if (issue.level === "error") totals.errors += 1;
  else totals.warnings += 1;
}

function applySchemaVersionStep(value: unknown): {
  value: unknown;
  currentVersion: number | null;
  nextVersion: number | null;
  changed: boolean;
  stepIds: string[];
  warnings: Array<{ code: string; message: string }>;
} {
  const record = toRecord(value);
  const currentVersion = toVersion(record.schemaVersion);

  if (currentVersion === null) {
    return {
      value: { ...record, schemaVersion: CURRENT_SCHEMA_VERSION },
      currentVersion,
      nextVersion: CURRENT_SCHEMA_VERSION,
      changed: true,
      stepIds: ["add_schema_version_v1"],
      warnings: [],
    };
  }

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    return {
      value: { ...record, schemaVersion: CURRENT_SCHEMA_VERSION },
      currentVersion,
      nextVersion: CURRENT_SCHEMA_VERSION,
      changed: true,
      stepIds: [`upgrade_schema_version_${currentVersion}_to_${CURRENT_SCHEMA_VERSION}`],
      warnings: [],
    };
  }

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    return {
      value: record,
      currentVersion,
      nextVersion: currentVersion,
      changed: false,
      stepIds: [],
      warnings: [{
        code: "FUTURE_SCHEMA_VERSION",
        message: `현재 러너 버전(${CURRENT_SCHEMA_VERSION})보다 높은 schemaVersion(${currentVersion})입니다.`,
      }],
    };
  }

  return {
    value: record,
    currentVersion,
    nextVersion: currentVersion,
    changed: false,
    stepIds: [],
    warnings: [],
  };
}

function buildMigrationPlan(rootDir: string, now: Date): MigrationPlan {
  const checkedAt = now.toISOString();
  const files: MigrationFileResult[] = [];
  const writes: Array<{ path: string; value: unknown }> = [];
  const issues: MigrationIssue[] = [];

  const totals: MigrationPlan["totals"] = {
    targets: TARGETS.length,
    existing: 0,
    changed: 0,
    errors: 0,
    warnings: 0,
  };

  for (const target of TARGETS) {
    const filePath = path.join(rootDir, target.relPath);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      files.push({
        path: target.relPath,
        exists: false,
        currentSchemaVersion: null,
        nextSchemaVersion: null,
        changed: false,
        stepIds: [],
        valid: true,
      });
      continue;
    }

    totals.existing += 1;

    try {
      const parsed = readJson(filePath);
      const step = applySchemaVersionStep(parsed);
      for (const warning of step.warnings) {
        pushIssue(issues, totals, {
          level: "warning",
          code: warning.code,
          path: target.relPath,
          message: warning.message,
        });
      }

      const validated = target.schema.parse(step.value);
      if (step.changed) {
        totals.changed += 1;
        writes.push({ path: filePath, value: validated });
      }

      files.push({
        path: target.relPath,
        exists: true,
        currentSchemaVersion: step.currentVersion,
        nextSchemaVersion: step.nextVersion,
        changed: step.changed,
        stepIds: step.stepIds,
        valid: true,
      });
    } catch {
      pushIssue(issues, totals, {
        level: "error",
        code: "SCHEMA_INVALID",
        path: target.relPath,
        message: "마이그레이션 전/후 스키마 검증에 실패했습니다.",
      });
      files.push({
        path: target.relPath,
        exists: true,
        currentSchemaVersion: null,
        nextSchemaVersion: null,
        changed: false,
        stepIds: [],
        valid: false,
      });
    }
  }

  return {
    checkedAt,
    files,
    writes,
    issues,
    totals,
  };
}

export function runV3Migrate(input: RunV3MigrateInput = {}): V3MigrateSummary {
  const rootDir = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const mode: MigrateMode = input.apply ? "apply" : "preview";

  const plan = buildMigrationPlan(rootDir, now);
  const summary: V3MigrateSummary = {
    mode,
    checkedAt: plan.checkedAt,
    totals: {
      targets: plan.totals.targets,
      existing: plan.totals.existing,
      changed: plan.totals.changed,
      applied: 0,
      errors: plan.totals.errors,
      warnings: plan.totals.warnings,
    },
    files: plan.files,
    issues: plan.issues,
  };

  if (!input.apply) {
    return summary;
  }

  if (plan.totals.errors > 0) {
    throw new Error("MIGRATE_BLOCKED:VALIDATION_FAILED");
  }

  const dataDir = path.join(rootDir, ".data");
  if (fs.existsSync(dataDir)) {
    const backupPath = resolveBackupPath(rootDir, now);
    fs.cpSync(dataDir, backupPath, { recursive: true, force: false, errorOnExist: true });
    summary.backupPath = backupPath;
  }

  for (const row of plan.writes.sort((a, b) => a.path.localeCompare(b.path))) {
    atomicWriteJson(row.path, row.value);
    summary.totals.applied += 1;
  }

  const doctor = runV3Doctor({ cwd: rootDir });
  summary.doctor = {
    ok: doctor.ok,
    errors: doctor.counts.errors,
    warnings: doctor.counts.warnings,
  };

  return summary;
}

function printSummary(summary: V3MigrateSummary): void {
  console.log(`[v3:migrate] mode=${summary.mode} checkedAt=${summary.checkedAt}`);
  console.log(`[v3:migrate] totals targets=${summary.totals.targets} existing=${summary.totals.existing} changed=${summary.totals.changed} applied=${summary.totals.applied} errors=${summary.totals.errors} warnings=${summary.totals.warnings}`);
  if (summary.backupPath) {
    console.log(`[v3:migrate] backup=${summary.backupPath}`);
  }
  if (summary.issues.length > 0) {
    console.log(`[v3:migrate] issues=${summary.issues.length}`);
    for (const issue of summary.issues.slice(0, 50)) {
      console.log(`[v3:migrate][${issue.level.toUpperCase()}] ${issue.code} ${issue.path} :: ${issue.message}`);
    }
  }
  if (summary.doctor) {
    console.log(`[v3:migrate] doctor ok=${summary.doctor.ok} errors=${summary.doctor.errors} warnings=${summary.doctor.warnings}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const summary = runV3Migrate({
    cwd: args.root,
    apply: args.apply,
  });
  printSummary(summary);
  if (!args.apply) {
    console.log("[v3:migrate] dry-run completed. Re-run with --apply to migrate.");
  }
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
    const message = error instanceof Error ? error.message : "migrate_failed";
    console.error(`[v3:migrate] ${message}`);
    process.exitCode = 1;
  }
}
