import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsPlanningDashboardClient } from "@/components/OpsPlanningDashboardClient";
import {
  ASSUMPTIONS_HISTORY_DIR,
  findAssumptionsSnapshotId,
  loadLatestAssumptionsSnapshot,
} from "@/lib/planning/assumptions/storage";
import { cacheStats, getCacheUsageStats } from "@/lib/planning/cache/storage";
import { readLatestEvalReport } from "@/lib/planning/regression/readLatestEval";
import { resolveProfilesDir, resolveRunsDir } from "@/lib/planning/store/paths";
import { checkPlanningIntegrity } from "@/lib/ops/planningDoctor";

type DirStats = {
  count: number;
  bytes: number;
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function daysSince(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return undefined;
  const diffMs = Date.now() - ts;
  if (!Number.isFinite(diffMs)) return undefined;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function resolveAssumptionsHistoryDir(): string {
  const override = asString(process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR);
  return path.resolve(process.cwd(), override || ASSUMPTIONS_HISTORY_DIR);
}

function summarizeDiff(row: { path?: string; kind?: string; diff?: number; tolerance?: number; added?: string[]; removed?: string[] }): string {
  const pathText = row.path ? `${row.path}` : "diff";
  const kind = asString(row.kind) || "change";

  if (kind === "set") {
    const added = Array.isArray(row.added) ? row.added.slice(0, 2).join(", ") : "";
    const removed = Array.isArray(row.removed) ? row.removed.slice(0, 2).join(", ") : "";
    return `${pathText} set changed (added: ${added || "-"}, removed: ${removed || "-"})`;
  }

  if (typeof row.diff === "number" && typeof row.tolerance === "number") {
    return `${pathText} ${kind} diff=${row.diff} tolerance=${row.tolerance}`;
  }

  return `${pathText} ${kind}`;
}

async function countJsonFiles(dirPath: string): Promise<DirStats> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return { count: 0, bytes: 0 };
    throw error;
  }

  let count = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    count += 1;
    const stat = await fs.stat(path.join(dirPath, entry.name)).catch(() => null);
    bytes += stat?.size ?? 0;
  }
  return { count, bytes };
}

async function countAssumptionsHistory(): Promise<number> {
  const dirPath = resolveAssumptionsHistoryDir();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return 0;
    throw error;
  }

  return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).length;
}

export default async function OpsPlanningPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  const [
    snapshot,
    historyCount,
    report,
    entryStats,
    usageStats,
    profilesStats,
    runsStats,
    doctorReport,
  ] = await Promise.all([
    loadLatestAssumptionsSnapshot(),
    countAssumptionsHistory(),
    readLatestEvalReport(),
    cacheStats(),
    getCacheUsageStats(),
    countJsonFiles(resolveProfilesDir()),
    countJsonFiles(resolveRunsDir()),
    checkPlanningIntegrity({ strict: false }),
  ]);

  const snapshotId = snapshot ? await findAssumptionsSnapshotId(snapshot) : undefined;
  const totalLookups = usageStats.totals.hits + usageStats.totals.misses;
  const hitRate = totalLookups > 0 ? usageStats.totals.hits / totalLookups : 0;
  const failedCases = (report?.cases ?? []).filter((row) => row.status === "FAIL").slice(0, 5);

  const assumptionsMetrics = snapshot ? [
    { label: "기준금리", value: snapshot.korea.policyRatePct },
    { label: "기준금리(Base Rate)", value: snapshot.korea.baseRatePct },
    { label: "CPI 전년동월비", value: snapshot.korea.cpiYoYPct },
    { label: "근원 CPI 전년동월비", value: snapshot.korea.coreCpiYoYPct },
    { label: "신규 예금 평균", value: snapshot.korea.newDepositAvgPct },
    { label: "신규 대출 평균", value: snapshot.korea.newLoanAvgPct },
    { label: "CD 91일", value: snapshot.korea.cd91Pct },
    { label: "KORIBOR 3개월", value: snapshot.korea.koribor3mPct },
    { label: "콜금리 익일물", value: snapshot.korea.callOvernightPct },
    { label: "통안증권 364일", value: snapshot.korea.msb364Pct },
  ].filter((row) => typeof row.value === "number" && Number.isFinite(row.value)).map((row) => ({
    label: row.label,
    value: row.value as number,
  })) : [];

  return (
    <OpsPlanningDashboardClient
      csrf={csrf}
      assumptions={{
        ...(snapshotId ? { snapshotId } : {}),
        ...(snapshot?.asOf ? { asOf: snapshot.asOf } : {}),
        ...(snapshot?.fetchedAt ? { fetchedAt: snapshot.fetchedAt } : {}),
        missing: !snapshot,
        warningsCount: snapshot?.warnings.length ?? 0,
        sourcesCount: snapshot?.sources.length ?? 0,
        ...(snapshot?.fetchedAt ? { staleDays: daysSince(snapshot.fetchedAt) } : {}),
        historyCount,
        metrics: assumptionsMetrics,
      }}
      regression={{
        ...(report?.generatedAt ? { generatedAt: report.generatedAt } : {}),
        totalCases: toNumber(report?.summary?.total),
        passCount: toNumber(report?.summary?.pass),
        failCount: toNumber(report?.summary?.fail),
        topFails: failedCases.map((row) => ({
          caseId: asString(row.id) || asString(row.title) || "unknown-case",
          summary: summarizeDiff((row.diffs ?? [])[0] ?? {}),
        })),
      }}
      cache={{
        totalEntries: entryStats.total,
        byKind: entryStats.byKind,
        totalLookups,
        hitRate,
        updatedAt: usageStats.updatedAt,
      }}
      store={{
        profilesCount: profilesStats.count,
        runsCount: runsStats.count,
        approxBytes: profilesStats.bytes + runsStats.bytes,
      }}
      doctor={doctorReport}
    />
  );
}
