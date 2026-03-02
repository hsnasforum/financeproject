import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import { type PlanningTrashKind } from "../../../../../../lib/planning/server/store/trash";
import { restoreProfileFromTrash } from "../../../../../../lib/planning/server/store/profileStore";
import { restoreRunFromTrash } from "../../../../../../lib/planning/server/store/runStore";
import { restoreReportFromTrash } from "../../../../../../lib/planning/server/reports/storage";

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

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
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
  if (kind === "profiles") return restoreProfileFromTrash(id);
  if (kind === "runs") return restoreRunFromTrash(id);
  return restoreReportFromTrash(id);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RestoreTrashBody = null;
  try {
    body = (await request.json()) as RestoreTrashBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const kind = parseTrashKind(body?.kind);
  if (!kind) {
    return jsonError("INPUT", "kind는 profiles|runs|reports 중 하나여야 합니다.", { status: 400 });
  }
  const id = asString(body?.id);
  if (!id) {
    return jsonError("INPUT", "id는 필수입니다.", { status: 400 });
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
      meta: { expectedConfirm },
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
      return jsonError("NO_DATA", "휴지통 항목을 찾을 수 없습니다.", { status: 404 });
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "휴지통 복구에 실패했습니다.";
    appendTrashRestoreAudit({
      result: "ERROR",
      kind,
      id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
