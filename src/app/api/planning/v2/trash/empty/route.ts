import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  emptyPlanningTrash,
  type PlanningTrashKind,
} from "../../../../../../lib/planning/server/store/trash";

type EmptyTrashBody = {
  kind?: unknown;
  confirmText?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function parseTrashKind(value: unknown): PlanningTrashKind | "all" {
  const raw = asString(value).toLowerCase();
  if (raw === "profiles" || raw === "runs" || raw === "reports" || raw === "all") return raw;
  return "all";
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

function appendTrashPurgeAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind: string;
  deleted?: number;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_PURGE",
      route: "/api/planning/v2/trash/empty",
      summary: `PLANNING_TRASH_PURGE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind,
        deleted: input.deleted ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash purge audit", error);
  }
}

export async function POST(request: Request) {
  let body: EmptyTrashBody = null;
  try {
    body = (await request.json()) as EmptyTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const kind = parseTrashKind(body?.kind);
  const expectedConfirm = buildConfirmString("EMPTY_TRASH", kind);
  const confirmText = asString(body?.confirmText);
  if (!verifyConfirm(confirmText, expectedConfirm)) {
    const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
    appendTrashPurgeAudit({
      result: "REJECTED",
      kind,
      message,
    });
    return jsonError("CONFIRM_MISMATCH", message, {
      status: 400,
      meta: { expectedConfirm },
    });
  }

  try {
    const applied = await emptyPlanningTrash(kind);
    appendTrashPurgeAudit({
      result: "SUCCESS",
      kind,
      deleted: applied.deleted,
      message: `trash empty applied (${applied.deleted})`,
    });
    return jsonOk({
      data: {
        kind,
        deleted: applied.deleted,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "휴지통 비우기에 실패했습니다.";
    appendTrashPurgeAudit({
      result: "ERROR",
      kind,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
