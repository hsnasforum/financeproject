import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { loadOpsPolicy } from "../../../../../lib/ops/opsPolicy";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { planRunsRetention } from "../../../../../lib/ops/runsRetention";
import { deleteRun, listRunIndexEntries } from "../../../../../lib/planning/server/store/runStore";

type CleanupBody = {
  csrf?: unknown;
  keepDays?: unknown;
  keepCount?: unknown;
  profileId?: unknown;
  dryRun?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function appendCleanupAudit(input: {
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

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CleanupBody = null;
  try {
    body = (await request.json()) as CleanupBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  const policy = loadOpsPolicy();
  const keepDays = Math.min(toOptionalInt(body?.keepDays) ?? policy.runs.defaultKeepDays, policy.runs.maxKeepDays);
  const keepCount = Math.min(toOptionalInt(body?.keepCount) ?? policy.runs.defaultKeepCount, policy.runs.maxKeepCount);
  const profileId = asString(body?.profileId);
  const dryRun = body?.dryRun === true;

  try {
    const rows = await listRunIndexEntries({
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
      appendCleanupAudit({
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
      return NextResponse.json({
        ok: true,
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
      });
    }

    const deletedIds: string[] = [];
    const failed: Array<{ id: string; message: string }> = [];

    for (const target of plan.remove) {
      try {
        const deleted = await deleteRun(target.id);
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

    appendCleanupAudit({
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

    return NextResponse.json({
      ok: true,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "runs cleanup 실행에 실패했습니다.";
    appendCleanupAudit({
      result: "ERROR",
      ...(profileId ? { profileId } : {}),
      keepDays,
      keepCount,
      dryRun,
      message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_RUNS_CLEANUP_ERROR",
      meta: {
        profileId: profileId || undefined,
        keepDays,
        keepCount,
        dryRun,
      },
    }).catch(() => undefined);
    return opsErrorResponse({
      code: "INTERNAL",
      message,
      status: 500,
    });
  }
}
