import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { loadOpsPolicy } from "@/lib/ops/opsPolicy";
import { planRunsRetention } from "@/lib/ops/runsRetention";
import { appendOpsAuditEvent } from "@/lib/ops/securityAuditLog";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import {
  deleteCurrentUserRun,
  listCurrentUserRunIndexEntries,
  type CurrentUserPlanningRunIndexEntry,
} from "./repository";

export type OpsRunsRouteMeta = {
  planningNamespaceEnabled?: true;
};

export type OpsRunsListQuery = {
  profileId?: unknown;
  status?: unknown;
  q?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  limit?: unknown;
  offset?: unknown;
};

export type OpsRunsCleanupInput = {
  keepDays?: unknown;
  keepCount?: unknown;
  profileId?: unknown;
  dryRun?: unknown;
};

export type OpsRunSummary = {
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunOverallStatus;
  snapshot?: {
    id?: string;
    asOf?: string;
    missing?: boolean;
  };
  warningsCount?: number;
  criticalCount?: number;
};

export type OpsRunsListResult = {
  items: OpsRunSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type OpsRunDeleteResult = {
  id: string;
  deleted: boolean;
};

export type OpsRunsCleanupResult = {
  message: string;
  data: {
    dryRun: boolean;
    keepDays: number;
    keepCount: number;
    profileId: string | null;
    total: number;
    kept: number;
    toDelete?: number;
    sample?: ReturnType<typeof planRunsRetention>["remove"];
    plannedDelete?: number;
    deleted?: number;
    failed?: Array<{ id: string; message: string }>;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toOptionalInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function asStatus(value: unknown): PlanningRunOverallStatus | undefined {
  return value === "RUNNING" || value === "SUCCESS" || value === "PARTIAL_SUCCESS" || value === "FAILED"
    ? value
    : undefined;
}

function includeByRange(row: CurrentUserPlanningRunIndexEntry, dateFrom: string, dateTo: string): boolean {
  const rowMs = Date.parse(row.createdAt);
  if (!Number.isFinite(rowMs)) return true;

  if (dateFrom) {
    const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
    if (Number.isFinite(fromMs) && rowMs < fromMs) return false;
  }
  if (dateTo) {
    const toMs = Date.parse(`${dateTo}T23:59:59.999Z`);
    if (Number.isFinite(toMs) && rowMs > toMs) return false;
  }
  return true;
}

function includeByQuery(row: CurrentUserPlanningRunIndexEntry, query: string): boolean {
  if (!query) return true;
  const lowered = query.toLowerCase();
  const title = asString(row.title).toLowerCase();
  const snapshotId = asString(row.snapshot?.id).toLowerCase();
  const runId = asString(row.id).toLowerCase();
  return title.includes(lowered) || snapshotId.includes(lowered) || runId.includes(lowered);
}

function toRunSummary(row: CurrentUserPlanningRunIndexEntry): OpsRunSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    ...(asString(row.title) ? { title: asString(row.title) } : {}),
    createdAt: row.createdAt,
    ...(row.overallStatus ? { overallStatus: row.overallStatus } : {}),
    snapshot: {
      ...(asString(row.snapshot?.id) ? { id: asString(row.snapshot?.id) } : {}),
      ...(asString(row.snapshot?.asOf) ? { asOf: asString(row.snapshot?.asOf) } : {}),
      ...(row.snapshot?.missing === true ? { missing: true } : {}),
    },
    ...(typeof asNumber(row.warningsCount) === "number" ? { warningsCount: asNumber(row.warningsCount) } : {}),
    ...(typeof asNumber(row.criticalCount) === "number" ? { criticalCount: asNumber(row.criticalCount) } : {}),
  };
}

export function opsRunsRouteMeta(): OpsRunsRouteMeta {
  return isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {};
}

export async function listOpsRuns(query: OpsRunsListQuery): Promise<OpsRunsListResult> {
  const policy = loadOpsPolicy();
  const profileId = asString(query.profileId);
  const status = asStatus(query.status);
  const q = asString(query.q).toLowerCase();
  const dateFrom = asString(query.dateFrom);
  const dateTo = asString(query.dateTo);
  const limit = toSafeInt(query.limit, policy.runs.defaultPageSize, 1, policy.runs.maxPageSize);
  const offset = toSafeInt(query.offset, 0, 0, 50000);

  const rows = await listCurrentUserRunIndexEntries({
    ...(profileId ? { profileId } : {}),
    limit: 50000,
    offset: 0,
  });

  const filtered = rows
    .filter((row) => (status ? row.overallStatus === status : true))
    .filter((row) => includeByRange(row, dateFrom, dateTo))
    .filter((row) => includeByQuery(row, q));

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit).map((row) => toRunSummary(row));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

export async function deleteOpsRun(id: string): Promise<OpsRunDeleteResult> {
  const deleted = await deleteCurrentUserRun(id);
  if (!deleted) {
    appendRunDeleteAudit({
      result: "ERROR",
      runId: id,
      message: "run not found",
    });
    await appendOpsAuditEvent({
      eventType: "OPS_RUN_DELETE_ERROR",
      meta: {
        runId: id,
        reason: "NOT_FOUND",
      },
    }).catch(() => undefined);
    return { id, deleted: false };
  }

  appendRunDeleteAudit({
    result: "SUCCESS",
    runId: id,
    message: "run deleted",
  });
  await appendOpsAuditEvent({
    eventType: "OPS_RUN_DELETE_SUCCESS",
    meta: {
      runId: id,
    },
  }).catch(() => undefined);

  return { id, deleted: true };
}

export async function auditOpsRunDeleteError(input: {
  runId: string;
  message: string;
}): Promise<void> {
  appendRunDeleteAudit({
    result: "ERROR",
    runId: input.runId,
    message: input.message,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_RUN_DELETE_ERROR",
    meta: {
      runId: input.runId,
    },
  }).catch(() => undefined);
}

export async function cleanupOpsRuns(input: OpsRunsCleanupInput): Promise<OpsRunsCleanupResult> {
  const policy = loadOpsPolicy();
  const keepDays = Math.min(toOptionalInt(input.keepDays) ?? policy.runs.defaultKeepDays, policy.runs.maxKeepDays);
  const keepCount = Math.min(toOptionalInt(input.keepCount) ?? policy.runs.defaultKeepCount, policy.runs.maxKeepCount);
  const profileId = asString(input.profileId);
  const dryRun = input.dryRun === true;

  const rows = await listCurrentUserRunIndexEntries({
    ...(profileId ? { profileId } : {}),
    limit: 50000,
    offset: 0,
  });

  const plan = planRunsRetention(
    rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      createdAt: row.createdAt,
    })),
    {
      keepDays,
      keepCount,
      ...(profileId ? { profileId } : {}),
    },
  );

  if (dryRun) {
    const message = `삭제 예정 ${plan.remove.length}건 (총 ${plan.total}건)`;
    appendRunsCleanupAudit({
      result: "SUCCESS",
      ...(profileId ? { profileId } : {}),
      keepDays,
      keepCount,
      dryRun: true,
      plannedCount: plan.remove.length,
      message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_RUNS_CLEANUP_DRYRUN",
      meta: {
        profileId: profileId || undefined,
        keepDays,
        keepCount,
        plannedCount: plan.remove.length,
        total: plan.total,
      },
    }).catch(() => undefined);
    return {
      message,
      data: {
        dryRun: true,
        keepDays,
        keepCount,
        profileId: profileId || null,
        total: plan.total,
        kept: plan.kept,
        toDelete: plan.remove.length,
        sample: plan.remove.slice(0, 20),
      },
    };
  }

  const deletedIds: string[] = [];
  const failed: Array<{ id: string; message: string }> = [];

  for (const target of plan.remove) {
    try {
      const deleted = await deleteCurrentUserRun(target.id);
      if (deleted) deletedIds.push(target.id);
    } catch (error) {
      failed.push({
        id: target.id,
        message: error instanceof Error ? error.message : "DELETE_FAILED",
      });
    }
  }

  const message = failed.length > 0
    ? `실행 기록 ${deletedIds.length}건 정리 완료, ${failed.length}건 실패`
    : `실행 기록 ${deletedIds.length}건 정리 완료`;

  appendRunsCleanupAudit({
    result: failed.length > 0 ? "ERROR" : "SUCCESS",
    ...(profileId ? { profileId } : {}),
    keepDays,
    keepCount,
    dryRun: false,
    deletedCount: deletedIds.length,
    plannedCount: plan.remove.length,
    message,
  });
  await appendOpsAuditEvent({
    eventType: failed.length > 0 ? "OPS_RUNS_CLEANUP_ERROR" : "OPS_RUNS_CLEANUP_SUCCESS",
    meta: {
      profileId: profileId || undefined,
      keepDays,
      keepCount,
      plannedCount: plan.remove.length,
      deletedCount: deletedIds.length,
      failedCount: failed.length,
    },
  }).catch(() => undefined);

  return {
    message,
    data: {
      dryRun: false,
      keepDays,
      keepCount,
      profileId: profileId || null,
      total: plan.total,
      kept: plan.kept,
      plannedDelete: plan.remove.length,
      deleted: deletedIds.length,
      failed,
    },
  };
}

export async function auditOpsRunsCleanupError(input: {
  profileId?: unknown;
  keepDays?: unknown;
  keepCount?: unknown;
  dryRun?: unknown;
  message: string;
}): Promise<void> {
  appendRunsCleanupAudit({
    result: "ERROR",
    ...(asString(input.profileId) ? { profileId: asString(input.profileId) } : {}),
    keepDays: toOptionalInt(input.keepDays),
    keepCount: toOptionalInt(input.keepCount),
    dryRun: input.dryRun === true,
    message: input.message,
  });
  await appendOpsAuditEvent({
    eventType: "OPS_RUNS_CLEANUP_ERROR",
    meta: {
      profileId: asString(input.profileId) || undefined,
      keepDays: toOptionalInt(input.keepDays),
      keepCount: toOptionalInt(input.keepCount),
      dryRun: input.dryRun === true,
    },
  }).catch(() => undefined);
}

function appendRunDeleteAudit(input: {
  result: "SUCCESS" | "ERROR";
  runId: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "OPS_RUN_DELETE",
      route: "/api/ops/runs/[runId]",
      summary: `OPS_RUN_DELETE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        runId: input.runId,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append ops run delete log", error);
  }
}

function appendRunsCleanupAudit(input: {
  result: "SUCCESS" | "ERROR";
  profileId?: string;
  keepDays?: number;
  keepCount?: number;
  dryRun: boolean;
  deletedCount?: number;
  plannedCount?: number;
  message: string;
}): void {
  try {
    appendAuditLog({
      event: "OPS_RUNS_CLEANUP",
      route: "/api/ops/runs/cleanup",
      summary: `OPS_RUNS_CLEANUP ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        dryRun: input.dryRun,
        profileId: input.profileId ?? null,
        keepDays: input.keepDays ?? null,
        keepCount: input.keepCount ?? null,
        deletedCount: input.deletedCount ?? null,
        plannedCount: input.plannedCount ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append ops runs cleanup log", error);
  }
}
