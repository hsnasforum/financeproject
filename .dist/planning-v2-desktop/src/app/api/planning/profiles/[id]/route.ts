import {
  assertLocalHost,
  assertSameOrigin,
  hasCsrfCookie,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/http/apiResponse";
import {
  getDefaultProfileId,
  getProfile,
  listProfileMetas,
  setDefaultProfile,
  updateProfile,
} from "../../../../../lib/planning/server/store/profileStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchProfileBody = {
  name?: unknown;
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

async function toMeta(profileId: string) {
  const [metas, defaultProfileId] = await Promise.all([
    listProfileMetas(),
    getDefaultProfileId(),
  ]);
  const found = metas.find((item) => item.profileId === profileId);
  if (!found) return null;
  return {
    profileId: found.profileId,
    name: found.name,
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
    isDefault: found.profileId === defaultProfileId,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const row = await toMeta(id);
    if (!row) return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    return jsonOk({ data: row });
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
  const nextName = asString(body?.name);
  const isDefault = asBoolean(body?.isDefault);
  if (!nextName && isDefault === undefined) {
    return jsonError("INPUT", "name 또는 isDefault(true) 중 하나는 필요합니다.", { status: 400 });
  }
  if (isDefault === false) {
    return jsonError("INPUT", "isDefault=false는 지원되지 않습니다. 기본 프로필 지정은 true만 허용됩니다.", { status: 400 });
  }

  try {
    if (nextName) {
      const updated = await updateProfile(id, { name: nextName });
      if (!updated) return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    } else {
      const existing = await getProfile(id);
      if (!existing) return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    }
    if (isDefault === true) {
      await setDefaultProfile(id);
    }
    const row = await toMeta(id);
    if (!row) return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
    return jsonOk({ data: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 수정에 실패했습니다.";
    return jsonError("INPUT", message, { status: 400 });
  }
}
