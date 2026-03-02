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
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { deleteRun } from "../../../../../lib/planning/server/store/runStore";

type RouteParams = {
  runId: string;
};

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendDeleteAudit(input: {
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

export async function DELETE(request: Request, context: { params: Promise<RouteParams> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
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
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
  }

  const { runId } = await context.params;
  const id = asString(runId);
  if (!id) {
    return NextResponse.json({ ok: false, message: "runId를 입력하세요." }, { status: 400 });
  }

  try {
    const deleted = await deleteRun(id);
    if (!deleted) {
    appendDeleteAudit({
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
      return NextResponse.json({ ok: false, message: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    appendDeleteAudit({
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

    return NextResponse.json({ ok: true, data: { id, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 삭제에 실패했습니다.";
    appendDeleteAudit({
      result: "ERROR",
      runId: id,
      message,
    });
    await appendOpsAuditEvent({
      eventType: "OPS_RUN_DELETE_ERROR",
      meta: {
        runId: id,
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
