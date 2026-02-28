import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { isServerPathWhitelisted, type BackupBundle, validateBundle } from "@/lib/backup/backupBundle";
import { onlyDev } from "@/lib/dev/onlyDev";
import { checkPlanningIntegrity } from "@/lib/ops/planningDoctor";

const RESTORE_POINT_PATH = path.join(process.cwd(), "tmp", "backup_restore_point.json");

function normalizePath(value: string): string {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function resolveSafePath(cwd: string, relativePath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const normalizedPath = normalizePath(relativePath);
  if (!normalizedPath || !isServerPathWhitelisted(normalizedPath)) return null;
  const absolute = path.resolve(normalizedCwd, normalizedPath);
  if (absolute === normalizedCwd || absolute.startsWith(`${normalizedCwd}${path.sep}`)) {
    return absolute;
  }
  return null;
}

function toPlanningStats(paths: string[]): { planningIncluded: boolean; planningPathCount: number } {
  const planningPathCount = paths.filter((entry) => entry.startsWith(".data/planning/")).length;
  return {
    planningIncluded: planningPathCount > 0,
    planningPathCount,
  };
}

function appendRestoreApplyAudit(summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "RESTORE_POINT_APPLY",
      route: "/api/dev/backup/restore-point/rollback",
      summary,
      details,
    });
  } catch (error) {
    console.error("[audit] failed to append restore point apply log", error);
  }
}

export async function POST() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  if (!fs.existsSync(RESTORE_POINT_PATH)) {
    appendRestoreApplyAudit("restore point 적용 실패: NO_DATA", {
      result: "ERROR",
      code: "NO_DATA",
    });
    return NextResponse.json(
      { ok: false, error: { code: "NO_DATA", message: "restore point 파일이 없습니다." } },
      { status: 404 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(RESTORE_POINT_PATH, "utf-8")) as unknown;
  } catch {
    appendRestoreApplyAudit("restore point 적용 실패: INVALID_RESTORE_POINT", {
      result: "ERROR",
      code: "INVALID_RESTORE_POINT",
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_RESTORE_POINT", message: "restore point 파일을 읽을 수 없습니다." } },
      { status: 500 },
    );
  }

  const validation = validateBundle(payload);
  if (!validation.ok) {
    appendRestoreApplyAudit("restore point 적용 실패: INVALID_RESTORE_POINT", {
      result: "ERROR",
      code: "INVALID_RESTORE_POINT",
      message: validation.error,
    });
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_RESTORE_POINT", message: `restore point 형식이 올바르지 않습니다. (${validation.error})` },
      },
      { status: 500 },
    );
  }

  const bundle = payload as BackupBundle;
  const cwd = process.cwd();
  const planningStats = toPlanningStats(Object.keys(bundle.serverFiles).map((entry) => normalizePath(entry)));
  const written: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const [rawPath, content] of Object.entries(bundle.serverFiles)) {
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

  const planningIntegrity = await checkPlanningIntegrity({ baseDir: cwd, strict: false });
  appendRestoreApplyAudit("restore point 적용 완료", {
    result: "SUCCESS",
    writtenCount: written.length,
    skippedCount: skipped.length,
    planningIncluded: planningStats.planningIncluded,
    planningPathCount: planningStats.planningPathCount,
    planningIntegrity: {
      missingCount: planningIntegrity.missing.length,
      invalidJsonCount: planningIntegrity.invalidJson.length,
      optionalMissingCount: planningIntegrity.optionalMissing.length,
    },
  });

  return NextResponse.json({
    ok: true,
    written,
    skipped,
    planningIntegrity,
  });
}
