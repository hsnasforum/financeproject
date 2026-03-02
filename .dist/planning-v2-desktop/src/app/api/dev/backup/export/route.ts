import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isServerPathWhitelisted } from "@/lib/backup/backupBundle";
import { collectServerPaths as collectBackupServerPaths } from "@/lib/backup/exportPaths";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { onlyDev } from "@/lib/dev/onlyDev";

function countPlanningPaths(paths: string[]): { planningFileCount: number; planningIncluded: boolean } {
  const planningFileCount = paths.filter((entry) => entry.startsWith(".data/planning/")).length;
  return {
    planningFileCount,
    planningIncluded: planningFileCount > 0,
  };
}

function appendExportAudit(summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "BACKUP_EXPORT",
      route: "/api/dev/backup/export",
      summary,
      details,
    });
  } catch (error) {
    console.error("[audit] failed to append backup export log", error);
  }
}

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

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const cwd = process.cwd();
  const serverFiles: Record<string, string | null> = {};
  const readFailed: string[] = [];
  const paths = collectBackupServerPaths(cwd);

  for (const relativePath of paths) {
    const absolutePath = resolveSafePath(cwd, relativePath);
    if (!absolutePath) {
      serverFiles[relativePath] = null;
      readFailed.push(relativePath);
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      serverFiles[relativePath] = null;
      continue;
    }
    try {
      serverFiles[relativePath] = fs.readFileSync(absolutePath, "utf-8");
    } catch {
      serverFiles[relativePath] = null;
      readFailed.push(relativePath);
    }
  }

  const planningStats = countPlanningPaths(paths);
  appendExportAudit("백업 export 완료", {
    ok: true,
    totalPaths: paths.length,
    readFailedCount: readFailed.length,
    planningIncluded: planningStats.planningIncluded,
    planningFileCount: planningStats.planningFileCount,
  });

  return NextResponse.json({
    ok: true,
    data: {
      serverFiles,
      readFailed,
      planningIncluded: planningStats.planningIncluded,
    },
  });
}
