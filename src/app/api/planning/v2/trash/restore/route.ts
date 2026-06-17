import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import { type CurrentUserPlanningTrashKind as PlanningTrashKind } from "../../../../../../lib/planning/server/trash/repository";
import { restoreCurrentUserProfileFromTrash } from "../../../../../../lib/planning/server/profiles/repository";
import { restoreCurrentUserRunFromTrash } from "../../../../../../lib/planning/server/runs/repository";
import { restoreCurrentUserReportFromTrash } from "../../../../../../lib/planning/server/reports/repository";

type RestoreTrashBody = {
  kind?: unknown;
  id?: unknown;
  confirmText?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function parseTrashKind(value: unknown): PlanningTrashKind | null {
  const raw = asString(value).toLowerCase();
  if (raw === "profiles" || raw === "runs" || raw === "reports") return raw;
  return null;
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

function appendTrashRestoreAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind?: string;
  id?: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_RESTORE",
      route: "/api/planning/v2/trash/restore",
      summary: `PLANNING_TRASH_RESTORE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind ?? null,
        id: input.id ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash restore audit", error);
  }
}

async function restoreTrashByKind(kind: PlanningTrashKind, id: string): Promise<boolean> {
  if (kind === "profiles") return restoreCurrentUserProfileFromTrash(id);
  if (kind === "runs") return restoreCurrentUserRunFromTrash(id);
  return restoreCurrentUserReportFromTrash(id);
}

export async function POST(request: Request) {
  let body: RestoreTrashBody = null;
  try {
    body = (await request.json()) as RestoreTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const kind = parseTrashKind(body?.kind);
      if (!kind) {
        return jsonError("INPUT", "kind는 profiles|runs|reports 중 하나여야 합니다.", {
          status: 400,
          meta: planningUserMeta(currentUser),
        });
      }
      const id = asString(body?.id);
      if (!id) {
        return jsonError("INPUT", "id는 필수입니다.", {
          status: 400,
          meta: planningUserMeta(currentUser),
        });
      }

      const expectedConfirm = buildConfirmString(`RESTORE ${kind}`, id);
      const confirmText = asString(body?.confirmText);
      if (!verifyConfirm(confirmText, expectedConfirm)) {
        const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
        appendTrashRestoreAudit({
          result: "REJECTED",
          kind,
          id,
          message,
        });
        return jsonError("CONFIRM_MISMATCH", message, {
          status: 400,
          meta: { expectedConfirm, ...planningUserMeta(currentUser) },
        });
      }

      try {
        const restored = await restoreTrashByKind(kind, id);
        if (!restored) {
          appendTrashRestoreAudit({
            result: "ERROR",
            kind,
            id,
            message: "trash item not found",
          });
          return jsonError("NO_DATA", "휴지통 항목을 찾을 수 없습니다.", {
            status: 404,
            meta: planningUserMeta(currentUser),
          });
        }
        appendTrashRestoreAudit({
          result: "SUCCESS",
          kind,
          id,
          message: "trash item restored",
        });
        return jsonOk({
          data: {
            kind,
            id,
            restored: true,
          },
        }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 복구에 실패했습니다.";
        appendTrashRestoreAudit({
          result: "ERROR",
          kind,
          id,
          message,
        });
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "휴지통 복구에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
