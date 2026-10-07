import {
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import { planningStorageErrorResponse, planningProfileStorageErrorMessage } from "../../../../../lib/planning/api/storageErrorResponse";
import { assertPlanningWriteGuard } from "../../../../../lib/planning/api/writeGuard";
import {
  planningUserMeta,
  planningAuthErrorResponse as toAuthErrorResponse,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import {
  createCurrentUserProfileForRoute,
  listCurrentUserProfilesForRoute,
  recordCurrentUserProfileAudit,
} from "../../../../../lib/planning/server/profiles/routeService";
import { PlanningV2ValidationError } from "../../../../../lib/planning/server/v2/types";
import { loadCanonicalProfile } from "../../../../../lib/planning/v2/loadCanonicalProfile";

type CreateProfileBody = {
  name?: unknown;
  profile?: unknown;
  csrf?: unknown;
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
  event: "PLANNING_PROFILE_CREATE";
  route: string;
  result: "SUCCESS" | "ERROR";
  recordId?: string | null;
  message: string;
}) {
  recordCurrentUserProfileAudit(input);
}

function normalizeCanonicalProfile(input: unknown) {
  return loadCanonicalProfile(input);
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const records = await listCurrentUserProfilesForRoute();
      return jsonOk({
        data: records,
        meta: planningUserMeta(currentUser),
      });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const storageError = planningStorageErrorResponse(error, undefined, { recoveryHref: null });
    if (storageError) return storageError;
    const message = planningProfileStorageErrorMessage(error, "프로필 목록 조회에 실패했습니다.");
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: CreateProfileBody = null;
  try {
    body = (await request.json()) as CreateProfileBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const name = asString(body?.name);
  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const canonical = normalizeCanonicalProfile(body?.profile);
      const created = await createCurrentUserProfileForRoute({
        name: name || "기본 프로필",
        profile: canonical.profile,
      });

      appendProfileAudit({
        event: "PLANNING_PROFILE_CREATE",
        route: "/api/planning/v2/profiles",
        result: "SUCCESS",
        recordId: created.id,
        message: "planning profile created",
      });

      return jsonOk({
        data: created,
        meta: {
          normalization: canonical.normalization,
          ...planningUserMeta(currentUser),
        },
      }, { status: 201 });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const storageError = planningStorageErrorResponse(error, undefined, { recoveryHref: null });
    if (storageError) return storageError;
    if (error instanceof PlanningV2ValidationError) {
      const message = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
      appendProfileAudit({
        event: "PLANNING_PROFILE_CREATE",
        route: "/api/planning/v2/profiles",
        result: "ERROR",
        message,
      });
      return jsonError("INPUT", "Invalid profile input", {
        issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }

    const message = planningProfileStorageErrorMessage(error, "프로필 생성에 실패했습니다.");
    appendProfileAudit({
      event: "PLANNING_PROFILE_CREATE",
      route: "/api/planning/v2/profiles",
      result: "ERROR",
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
