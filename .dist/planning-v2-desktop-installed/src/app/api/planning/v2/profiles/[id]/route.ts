import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../../lib/http/apiResponse";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  deleteProfile,
  getProfile,
  updateProfile,
} from "../../../../../../lib/planning/server/store/profileStore";
import { PlanningV2ValidationError } from "../../../../../../lib/planning/server/v2/types";
import { loadCanonicalProfile } from "../../../../../../lib/planning/v2/loadCanonicalProfile";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchProfileBody = {
  name?: unknown;
  profile?: unknown;
  csrf?: unknown;
  confirmText?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
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

function appendProfileAudit(input: {
  event: "PLANNING_PROFILE_UPDATE" | "PLANNING_PROFILE_DELETE";
  route: string;
  result: "SUCCESS" | "ERROR";
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: input.event,
      route: input.route,
      summary: `${input.event} ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning profile audit", error);
  }
}

function appendTrashAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind: "profile";
  id: string;
  message: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_TRASH_MOVE",
      route: "/api/planning/v2/profiles/[id]",
      summary: `PLANNING_TRASH_MOVE ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        kind: input.kind,
        id: input.id,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning trash move audit", error);
  }
}

function normalizeCanonicalProfile(input: unknown) {
  return loadCanonicalProfile(input).profile;
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;

  try {
    const record = await getProfile(id);
    if (!record) {
      return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    }
    return jsonOk({ data: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PatchProfileBody = null;
  try {
    body = (await request.json()) as PatchProfileBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  const name = asString(body?.name);
  const hasProfilePatch = body?.profile !== undefined;

  try {
    const patch: { name?: string; profile?: ReturnType<typeof normalizeCanonicalProfile> } = {};
    if (name) patch.name = name;
    if (hasProfilePatch) patch.profile = normalizeCanonicalProfile(body?.profile);

    if (!patch.name && !patch.profile) {
      appendProfileAudit({
        event: "PLANNING_PROFILE_UPDATE",
        route: "/api/planning/v2/profiles/[id]",
        result: "ERROR",
        recordId: id,
        message: "no update fields",
      });
      return jsonError("INPUT", "No update fields provided");
    }

    const updated = await updateProfile(id, patch);
    if (!updated) {
      appendProfileAudit({
        event: "PLANNING_PROFILE_UPDATE",
        route: "/api/planning/v2/profiles/[id]",
        result: "ERROR",
        recordId: id,
        message: "profile not found",
      });
      return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    }

    appendProfileAudit({
      event: "PLANNING_PROFILE_UPDATE",
      route: "/api/planning/v2/profiles/[id]",
      result: "SUCCESS",
      recordId: updated.id,
      message: "planning profile updated",
    });

    return jsonOk({ data: updated });
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      const message = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
      appendProfileAudit({
        event: "PLANNING_PROFILE_UPDATE",
        route: "/api/planning/v2/profiles/[id]",
        result: "ERROR",
        recordId: id,
        message,
      });
      return jsonError("INPUT", "Invalid profile input", {
        issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }

    const message = error instanceof Error ? error.message : "프로필 수정에 실패했습니다.";
    appendProfileAudit({
      event: "PLANNING_PROFILE_UPDATE",
      route: "/api/planning/v2/profiles/[id]",
      result: "ERROR",
      recordId: id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: { csrf?: unknown; confirmText?: unknown } | null = null;
  try {
    body = (await request.json()) as { csrf?: unknown } | null;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  const expectedConfirm = buildConfirmString("DELETE profile", id);
  const confirmText = asString(body?.confirmText);
  if (!verifyConfirm(confirmText, expectedConfirm)) {
    const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
    appendTrashAudit({
      result: "REJECTED",
      kind: "profile",
      id,
      message,
    });
    return jsonError("CONFIRM_MISMATCH", message, {
      status: 400,
      meta: { expectedConfirm },
    });
  }

  try {
    const deleted = await deleteProfile(id);
    if (!deleted) {
      appendProfileAudit({
        event: "PLANNING_PROFILE_DELETE",
        route: "/api/planning/v2/profiles/[id]",
        result: "ERROR",
        recordId: id,
        message: "profile not found",
      });
      return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    }

    appendProfileAudit({
      event: "PLANNING_PROFILE_DELETE",
      route: "/api/planning/v2/profiles/[id]",
      result: "SUCCESS",
      recordId: id,
      message: "planning profile deleted",
    });
    appendTrashAudit({
      result: "SUCCESS",
      kind: "profile",
      id,
      message: "planning profile moved to trash",
    });

    return jsonOk({ data: { id, deleted: true, softDeleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 삭제에 실패했습니다.";
    appendProfileAudit({
      event: "PLANNING_PROFILE_DELETE",
      route: "/api/planning/v2/profiles/[id]",
      result: "ERROR",
      recordId: id,
      message,
    });
    appendTrashAudit({
      result: "ERROR",
      kind: "profile",
      id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
