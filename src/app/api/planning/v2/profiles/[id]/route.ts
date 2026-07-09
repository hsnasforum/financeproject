import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../../lib/planning/api/response";
import { assertPlanningWriteGuard } from "../../../../../../lib/planning/api/writeGuard";
import {
  planningUserMeta,
  planningAuthErrorResponse as toAuthErrorResponse,
  withPlanningRouteUser,
} from "../../../../../../lib/planning/api/routeAuth";
import { buildConfirmString, verifyConfirm } from "../../../../../../lib/ops/confirm";
import {
  deleteCurrentUserProfileForRoute,
  getCurrentUserProfileForRoute,
  recordCurrentUserProfileAudit,
  recordCurrentUserProfileTrashAudit,
  updateCurrentUserProfileForRoute,
} from "../../../../../../lib/planning/server/profiles/routeService";
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
    assertPlanningWriteGuard(request, body);
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
  recordCurrentUserProfileAudit(input);
}

function appendTrashAudit(input: {
  result: "SUCCESS" | "ERROR" | "REJECTED";
  kind: "profile";
  id: string;
  message: string;
}) {
  recordCurrentUserProfileTrashAudit({
    result: input.result,
    id: input.id,
    message: input.message,
  });
}

function normalizeCanonicalProfile(input: unknown) {
  return loadCanonicalProfile(input);
}

export async function GET(request: Request, context: RouteContext) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const record = await getCurrentUserProfileForRoute(id);
      if (!record) {
        return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
      }
      return jsonOk({
        data: record,
        meta: planningUserMeta(currentUser),
      });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : "프로필 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let body: PatchProfileBody = null;
  try {
    body = (await request.json()) as PatchProfileBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  const name = asString(body?.name);
  const hasProfilePatch = body?.profile !== undefined;
  let normalizationMeta: ReturnType<typeof normalizeCanonicalProfile>["normalization"] | undefined;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const patch: { name?: string; profile?: ReturnType<typeof normalizeCanonicalProfile>["profile"] } = {};
      if (name) patch.name = name;
      if (hasProfilePatch) {
        const canonical = normalizeCanonicalProfile(body?.profile);
        patch.profile = canonical.profile;
        normalizationMeta = canonical.normalization;
      }

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

      const updated = await updateCurrentUserProfileForRoute(id, patch);
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

      return jsonOk({
        data: updated,
        meta: {
          ...(normalizationMeta ? { normalization: normalizationMeta } : {}),
          ...planningUserMeta(currentUser),
        },
      });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
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
  let body: { csrf?: unknown; confirmText?: unknown } | null = null;
  try {
    body = (await request.json()) as { csrf?: unknown } | null;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
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
    return await withPlanningRouteUser(request, async (currentUser) => {
      const deleted = await deleteCurrentUserProfileForRoute(id);
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

      return jsonOk({
        data: { id, deleted: true, softDeleted: true },
        meta: planningUserMeta(currentUser),
      });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
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
