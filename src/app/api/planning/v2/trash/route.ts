import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../lib/ops/confirm";
import {
  listCurrentUserPlanningTrash,
  type CurrentUserPlanningTrashKind as PlanningTrashKind,
} from "../../../../../lib/planning/server/trash/repository";
import { hardDeleteCurrentUserProfileFromTrash } from "../../../../../lib/planning/server/profiles/repository";
import { hardDeleteCurrentUserRunFromTrash } from "../../../../../lib/planning/server/runs/repository";
import { hardDeleteCurrentUserReportFromTrash } from "../../../../../lib/planning/server/reports/repository";

type DeleteTrashBody = {
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

function parseTrashKind(value: unknown): PlanningTrashKind | "all" | null {
  const raw = asString(value).toLowerCase();
  if (raw === "profiles" || raw === "runs" || raw === "reports" || raw === "all") return raw;
  return null;
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

function appendTrashPurgeAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind?: string;
  id?: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_PURGE",
      route: "/api/planning/v2/trash",
      summary: `PLANNING_TRASH_PURGE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind ?? null,
        id: input.id ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash purge audit", error);
  }
}

async function hardDeleteTrashByKind(kind: PlanningTrashKind, id: string): Promise<boolean> {
  if (kind === "profiles") return hardDeleteCurrentUserProfileFromTrash(id);
  if (kind === "runs") return hardDeleteCurrentUserRunFromTrash(id);
  return hardDeleteCurrentUserReportFromTrash(id);
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      try {
        const url = new URL(request.url);
        const parsedKind = parseTrashKind(url.searchParams.get("kind"));
        const kind = parsedKind ?? "all";
        const limit = Math.max(1, Math.min(200, Math.trunc(Number(url.searchParams.get("limit"))) || 100));
        const rows = await listCurrentUserPlanningTrash(kind, limit);
        return jsonOk({
          data: rows.map((row) => ({
            kind: row.kind,
            id: row.id,
            deletedAt: row.deletedAt,
            sizeBytes: row.sizeBytes,
          })),
        }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 조회에 실패했습니다.";
        return jsonError("INTERNAL", message, {
          status: 500,
          meta: planningUserMeta(currentUser),
        });
      }
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "휴지통 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let body: DeleteTrashBody = null;
  try {
    body = (await request.json()) as DeleteTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const parsedKind = parseTrashKind(body?.kind);
      if (!parsedKind || parsedKind === "all") {
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

      const expectedConfirm = buildConfirmString(`DELETE ${parsedKind}`, id);
      const confirmText = asString(body?.confirmText);
      if (!verifyConfirm(confirmText, expectedConfirm)) {
        const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
        appendTrashPurgeAudit({
          result: "REJECTED",
          kind: parsedKind,
          id,
          message,
        });
        return jsonError("CONFIRM_MISMATCH", message, {
          status: 400,
          meta: { expectedConfirm, ...planningUserMeta(currentUser) },
        });
      }

      try {
        const deleted = await hardDeleteTrashByKind(parsedKind, id);
        if (!deleted) {
          appendTrashPurgeAudit({
            result: "ERROR",
            kind: parsedKind,
            id,
            message: "trash item not found",
          });
          return jsonError("NO_DATA", "휴지통 항목을 찾을 수 없습니다.", {
            status: 404,
            meta: planningUserMeta(currentUser),
          });
        }
        appendTrashPurgeAudit({
          result: "SUCCESS",
          kind: parsedKind,
          id,
          message: "trash item deleted permanently",
        });
        return jsonOk({
          data: {
            kind: parsedKind,
            id,
            deleted: true,
          },
        }, { meta: planningUserMeta(currentUser) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "휴지통 영구 삭제에 실패했습니다.";
        appendTrashPurgeAudit({
          result: "ERROR",
          kind: parsedKind,
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
    const message = error instanceof Error ? error.message : "휴지통 영구 삭제에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
