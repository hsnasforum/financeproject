import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  deleteReport,
  getReport,
} from "../../../../../../lib/planning/server/reports/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function withWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    if (hasCsrfCookie(request) && csrfToken) {
      assertCsrf(request, { csrf: csrfToken });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendTrashAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  id: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_MOVE",
      route: "/api/planning/v2/reports/[id]",
      summary: `PLANNING_TRASH_MOVE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: "report",
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const { id } = await context.params;
    const found = await getReport(id);
    if (!found) {
      return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.");
    }
    return jsonOk({
      data: {
        id: found.meta.id,
        createdAt: found.meta.createdAt,
        kind: found.meta.kind,
        ...(found.meta.runId ? { runId: found.meta.runId } : {}),
        markdown: found.markdown,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  let body: { csrf?: unknown; confirmText?: unknown } | null = null;
  try {
    body = (await request.json()) as { csrf?: unknown } | null;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const expectedConfirm = buildConfirmString("DELETE report", id);
    const confirmText = asString(body?.confirmText);
    if (!verifyConfirm(confirmText, expectedConfirm)) {
      const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
      appendTrashAudit({
        result: "REJECTED",
        id,
        message,
      });
      return jsonError("CONFIRM_MISMATCH", message, {
        status: 400,
        meta: { expectedConfirm },
      });
    }

    const deleted = await deleteReport(id);
    if (!deleted) {
      return jsonError("NO_DATA", "리포트를 찾을 수 없습니다.");
    }
    appendTrashAudit({
      result: "SUCCESS",
      id,
      message: "planning report moved to trash",
    });
    return jsonOk({ data: { id, deleted: true, softDeleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리포트 삭제에 실패했습니다.";
    appendTrashAudit({
      result: "ERROR",
      id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
