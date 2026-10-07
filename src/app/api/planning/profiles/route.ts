import {
  assertLocalHost,
  assertSameOrigin,
  hasCsrfCookie,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../lib/http/apiResponse";
import { planningStorageErrorResponse, planningProfileStorageErrorMessage } from "../../../../lib/planning/api/storageErrorResponse";
import {
  planningUserMeta,
  planningAuthErrorResponse as toAuthErrorResponse,
  withPlanningRouteUser,
} from "../../../../lib/planning/api/routeAuth";
import {
  createCurrentUserProfileMetaRowForRoute,
  listCurrentUserProfileMetaRowsForRoute,
} from "../../../../lib/planning/server/profiles/routeService";

type CreateProfileBody = {
  name?: unknown;
  profile?: unknown;
  isDefault?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
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
    if (hasCsrfCookie(request)) {
      requireCsrf(request, body, { allowWhenCookieMissing: false });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const result = await listCurrentUserProfileMetaRowsForRoute();
      return jsonOk({
        data: result.rows,
        meta: {
          ...(result.defaultProfileId ? { defaultProfileId: result.defaultProfileId } : {}),
          ...planningUserMeta(currentUser),
        },
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
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CreateProfileBody = null;
  try {
    body = (await request.json()) as CreateProfileBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const row = await createCurrentUserProfileMetaRowForRoute({
        name: asString(body?.name) || "기본 프로필",
        profile: body?.profile,
        isDefault: asBoolean(body?.isDefault) === true,
      });
      return jsonOk({
        data: row,
        meta: planningUserMeta(currentUser),
      }, { status: 201 });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;
    const storageError = planningStorageErrorResponse(error, undefined, { recoveryHref: null });
    if (storageError) return storageError;
    const message = planningProfileStorageErrorMessage(error, "프로필 생성에 실패했습니다.");
    return jsonError("INPUT", message, { status: 400 });
  }
}
