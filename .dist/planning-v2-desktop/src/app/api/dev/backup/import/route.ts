import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { buildBundle, isServerPathWhitelisted, type BackupBundle, validateBundle } from "@/lib/backup/backupBundle";
import { validateRuntime } from "@/lib/backup/backupValidateRuntime";
import { onlyDev } from "@/lib/dev/onlyDev";
import { checkPlanningIntegrity, type PlanningIntegrityReport } from "@/lib/ops/planningDoctor";

const RESTORE_POINT_PATH = path.join(process.cwd(), "tmp", "backup_restore_point.json");

type SkippedItem = { path: string; reason: string };

function resolveSafePath(cwd: string, relativePath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const normalizedPath = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!normalizedPath || !isServerPathWhitelisted(normalizedPath)) return null;
  const absolute = path.resolve(normalizedCwd, normalizedPath);
  if (absolute === normalizedCwd || absolute.startsWith(`${normalizedCwd}${path.sep}`)) {
    return absolute;
  }
  return null;
}

function normalizePath(value: string): string {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function takeHead<T>(items: T[], max = 20): T[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max);
}

function auditBackupImport(summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "BACKUP_IMPORT",
      route: "/api/dev/backup/import",
      summary,
      details,
    });
  } catch (error) {
    console.error("[audit] failed to append backup import log", error);
  }
}

function auditRestorePoint(event: "RESTORE_POINT_CREATE" | "RESTORE_POINT_APPLY", summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event,
      route: "/api/dev/backup/import",
      summary,
      details,
    });
  } catch (error) {
    console.error(`[audit] failed to append ${event} log`, error);
  }
}

function toPlanningStats(paths: string[]): { planningIncluded: boolean; planningPathCount: number } {
  const planningPathCount = paths.filter((entry) => entry.startsWith(".data/planning/")).length;
  return {
    planningIncluded: planningPathCount > 0,
    planningPathCount,
  };
}

function toPlanningIntegritySummary(report: PlanningIntegrityReport): {
  missingCount: number;
  invalidJsonCount: number;
  optionalMissingCount: number;
} {
  return {
    missingCount: report.missing.length,
    invalidJsonCount: report.invalidJson.length,
    optionalMissingCount: report.optionalMissing.length,
  };
}

function parseOptions(input: unknown): {
  restorePoint: boolean;
  applyServerFiles: boolean;
  includePaths: string[] | null;
  error?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { restorePoint: false, applyServerFiles: true, includePaths: null };
  }
  const record = input as Record<string, unknown>;
  const restorePoint = record.restorePoint === true;
  const applyServerFiles = record.applyServerFiles !== false;

  if (!Object.prototype.hasOwnProperty.call(record, "includePaths")) {
    return { restorePoint, applyServerFiles, includePaths: null };
  }

  const includePathsRaw = record.includePaths;
  if (!Array.isArray(includePathsRaw)) {
    return {
      restorePoint,
      applyServerFiles,
      includePaths: null,
      error: "includePaths는 문자열 배열이어야 합니다.",
    };
  }

  const set = new Set<string>();
  for (const entry of includePathsRaw) {
    if (typeof entry !== "string") {
      return {
        restorePoint,
        applyServerFiles,
        includePaths: null,
        error: "includePaths는 문자열 배열이어야 합니다.",
      };
    }
    const normalized = normalizePath(entry);
    if (!normalized) continue;
    if (!isServerPathWhitelisted(normalized)) {
      return {
        restorePoint,
        applyServerFiles,
        includePaths: null,
        error: `허용되지 않은 includePaths 항목: ${normalized}`,
      };
    }
    set.add(normalized);
  }
  return { restorePoint, applyServerFiles, includePaths: [...set] };
}

function readCurrentServerFiles(cwd: string, relativePaths: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const relativePath of relativePaths) {
    const normalized = normalizePath(relativePath);
    const absolute = resolveSafePath(cwd, normalized);
    if (!absolute || !fs.existsSync(absolute)) {
      out[normalized] = null;
      continue;
    }
    try {
      out[normalized] = fs.readFileSync(absolute, "utf-8");
    } catch {
      out[normalized] = null;
    }
  }
  return out;
}

function applyServerBundle(
  cwd: string,
  serverFiles: Record<string, string | null>,
): { written: string[]; skipped: SkippedItem[]; error?: string } {
  const written: string[] = [];
  const skipped: SkippedItem[] = [];
  for (const [rawPath, content] of Object.entries(serverFiles)) {
    const relativePath = normalizePath(rawPath);
    const absolute = resolveSafePath(cwd, relativePath);
    if (!absolute) {
      skipped.push({ path: relativePath, reason: "NOT_WHITELISTED" });
      continue;
    }
    try {
      if (content === null) {
        if (fs.existsSync(absolute)) {
          fs.unlinkSync(absolute);
        }
        written.push(relativePath);
        continue;
      }
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, "utf-8");
      written.push(relativePath);
    } catch (error) {
      skipped.push({
        path: relativePath,
        reason: error instanceof Error ? error.message : "WRITE_FAILED",
      });
    }
  }
  return { written, skipped };
}

function rollbackFromRestorePoint(cwd: string): { ok: boolean; written: string[]; skipped: SkippedItem[]; error?: string } {
  if (!fs.existsSync(RESTORE_POINT_PATH)) {
    return { ok: false, written: [], skipped: [], error: "restore point 파일이 없습니다." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(RESTORE_POINT_PATH, "utf-8")) as unknown;
  } catch {
    return { ok: false, written: [], skipped: [], error: "restore point 파일을 읽을 수 없습니다." };
  }

  const validation = validateBundle(payload);
  if (!validation.ok) {
    return {
      ok: false,
      written: [],
      skipped: [],
      error: `restore point 형식이 올바르지 않습니다. (${validation.error})`,
    };
  }

  const applied = applyServerBundle(cwd, (payload as BackupBundle).serverFiles);
  if (applied.error) {
    return {
      ok: false,
      written: applied.written,
      skipped: applied.skipped,
      error: applied.error,
    };
  }
  return {
    ok: true,
    written: applied.written,
    skipped: applied.skipped,
  };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    auditBackupImport("백업 import 실패: INVALID_JSON", {
      ok: false,
      code: "INVALID_JSON",
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "JSON body 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  let bundleInput: unknown = body;
  let optionsInput: unknown = null;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "bundle")) {
      bundleInput = record.bundle;
      optionsInput = record.options;
    }
  }

  const validation = validateBundle(bundleInput);
  if (!validation.ok) {
    auditBackupImport("백업 import 실패: INVALID_BUNDLE", {
      ok: false,
      code: "INVALID_BUNDLE",
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BUNDLE", message: validation.error } },
      { status: 400 },
    );
  }

  const optionState = parseOptions(optionsInput);
  if (optionState.error) {
    auditBackupImport("백업 import 실패: INVALID_OPTIONS", {
      ok: false,
      code: "INVALID_OPTIONS",
      includePathsSelected: Array.isArray(optionState.includePaths) ? optionState.includePaths.length : null,
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_OPTIONS", message: optionState.error } },
      { status: 400 },
    );
  }

  const bundle = bundleInput as BackupBundle;
  const cwd = process.cwd();
  const normalizedEntries = new Map<string, string | null>();
  for (const [relativePath, content] of Object.entries(bundle.serverFiles)) {
    normalizedEntries.set(normalizePath(relativePath), content);
  }

  const targetPaths = [...normalizedEntries.keys()].filter((relativePath) => {
    if (!isServerPathWhitelisted(relativePath)) return false;
    if (!optionState.includePaths) return true;
    return optionState.includePaths.includes(relativePath);
  });
  const planningStats = toPlanningStats(targetPaths);

  let restorePointCreated = false;
  if (optionState.restorePoint && optionState.applyServerFiles && targetPaths.length > 0) {
    try {
      const currentFiles = readCurrentServerFiles(cwd, targetPaths);
      const restorePointBundle = buildBundle({
        serverFilesMap: currentFiles,
        clientStorageMap: {},
      });
      fs.mkdirSync(path.dirname(RESTORE_POINT_PATH), { recursive: true });
      fs.writeFileSync(RESTORE_POINT_PATH, JSON.stringify(restorePointBundle, null, 2), "utf-8");
      restorePointCreated = true;
      auditRestorePoint("RESTORE_POINT_CREATE", "restore point 생성 완료", {
        result: "SUCCESS",
        targetPathCount: targetPaths.length,
        planningIncluded: planningStats.planningIncluded,
      });
    } catch {
      auditRestorePoint("RESTORE_POINT_CREATE", "restore point 생성 실패", {
        result: "ERROR",
        targetPathCount: targetPaths.length,
        planningIncluded: planningStats.planningIncluded,
      });
      auditBackupImport("백업 import 실패: RESTORE_POINT_FAILED", {
        ok: false,
        code: "RESTORE_POINT_FAILED",
        restorePointRequested: true,
        targetPathCount: targetPaths.length,
        planningIncluded: planningStats.planningIncluded,
      });
      return NextResponse.json(
        { ok: false, error: { code: "RESTORE_POINT_FAILED", message: "restore point 생성에 실패했습니다." } },
        { status: 500 },
      );
    }
  }

  const written: string[] = [];
  const skipped: SkippedItem[] = [];

  for (const [relativePath, content] of normalizedEntries) {
    if (optionState.includePaths && !optionState.includePaths.includes(relativePath)) {
      skipped.push({ path: relativePath, reason: "PATH_NOT_SELECTED" });
      continue;
    }
    if (!optionState.applyServerFiles) {
      skipped.push({ path: relativePath, reason: "APPLY_SERVER_FILES_DISABLED" });
      continue;
    }

    const absolute = resolveSafePath(cwd, relativePath);
    if (!absolute) {
      skipped.push({ path: relativePath, reason: "NOT_WHITELISTED" });
      continue;
    }
    if (content === null) {
      skipped.push({ path: relativePath, reason: "NULL_CONTENT" });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, "utf-8");
      written.push(relativePath);
    } catch (error) {
      skipped.push({
        path: relativePath,
        reason: error instanceof Error ? error.message : "WRITE_FAILED",
      });
    }
  }

  const requiredPaths = targetPaths.filter((relativePath) => normalizedEntries.get(relativePath) !== null);
  const runtime = validateRuntime({ baseDir: cwd, requiredPaths });
  if (!runtime.ok) {
    let rolledBack = false;
    if (optionState.restorePoint && restorePointCreated) {
      const rollback = rollbackFromRestorePoint(cwd);
      rolledBack = rollback.ok;
      auditRestorePoint("RESTORE_POINT_APPLY", "restore point 롤백 실행", {
        result: rollback.ok ? "SUCCESS" : "ERROR",
        writtenCount: rollback.written.length,
        skippedCount: rollback.skipped.length,
        planningIncluded: planningStats.planningIncluded,
      });
      if (!rollback.ok && rollback.error) {
        runtime.issues.push(`rollback: ${rollback.error}`);
      }
    }
    const planningIntegrity = await checkPlanningIntegrity({ baseDir: cwd, strict: false });
    auditBackupImport("백업 import 실패: RESTORE_FAILED", {
      ok: false,
      code: "RESTORE_FAILED",
      restorePointCreated,
      rolledBack,
      requiredPathCount: requiredPaths.length,
      writtenCount: written.length,
      skippedCount: skipped.length,
      skipped: takeHead(skipped, 20),
      issuesCount: runtime.issues.length,
      issues: takeHead(runtime.issues, 10),
      planningIncluded: planningStats.planningIncluded,
      planningPathCount: planningStats.planningPathCount,
      planningIntegrity: toPlanningIntegritySummary(planningIntegrity),
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RESTORE_FAILED",
          message: rolledBack ? "검증 실패로 롤백했습니다." : "검증 실패가 발생했습니다.",
        },
        issues: runtime.issues,
        rolledBack,
        restorePointCreated,
        planningIntegrity,
      },
      { status: 500 },
    );
  }

  const planningIntegrity = await checkPlanningIntegrity({ baseDir: cwd, strict: false });
  auditBackupImport("백업 import 완료", {
    ok: true,
    restorePointCreated,
    validated: true,
    targetPathCount: targetPaths.length,
    requiredPathCount: requiredPaths.length,
    writtenCount: written.length,
    skippedCount: skipped.length,
    written: takeHead(written, 20),
    skipped: takeHead(skipped, 20),
    issuesCount: runtime.issues.length,
    planningIncluded: planningStats.planningIncluded,
    planningPathCount: planningStats.planningPathCount,
    planningIntegrity: toPlanningIntegritySummary(planningIntegrity),
  });

  return NextResponse.json({
    ok: true,
    written,
    skipped,
    restorePointCreated,
    validated: true,
    issues: runtime.issues,
    planningIntegrity,
  });
}
