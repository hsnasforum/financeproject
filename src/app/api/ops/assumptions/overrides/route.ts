import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import { isPlanningRouteUser, requirePlanningRouteUser } from "@/lib/planning/api/routeAuth";
import {
  listRouteAssumptionsOverrides,
  patchRouteAssumptionsOverrides,
  replaceRouteAssumptionsOverrides,
  resetRouteAssumptionsOverrides,
  type AssumptionsOverridesMutationInput,
} from "@/lib/planning/server/assumptions/overridesRouteService";
import { assumptionsUserMeta } from "../_lib";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const requestedProfileId = searchParams.get("profileId");

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  try {
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const result = await listRouteAssumptionsOverrides(requestedProfileId);
    return NextResponse.json({
      ok: true,
      ...(result.profileId ? { profileId: result.profileId } : {}),
      items: result.items,
      meta: assumptionsUserMeta(currentUser),
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "오버라이드 조회에 실패했습니다.",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  // Legacy alias: POST behaves the same as PUT (replace list).
  return PUT(request);
}

export async function PUT(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: AssumptionsOverridesMutationInput = null;
  try {
    body = (await request.json()) as AssumptionsOverridesMutationInput;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  try {
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const result = await replaceRouteAssumptionsOverrides(body);
    return NextResponse.json({
      ok: true,
      ...(result.profileId ? { profileId: result.profileId } : {}),
      items: result.items,
      meta: assumptionsUserMeta(currentUser),
      message: "가정 오버라이드를 저장했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: error instanceof Error ? error.message : "오버라이드 저장에 실패했습니다.",
      status: 400,
    });
  }
}

export async function PATCH(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: AssumptionsOverridesMutationInput = null;
  try {
    body = (await request.json()) as AssumptionsOverridesMutationInput;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  try {
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const result = await patchRouteAssumptionsOverrides(body);
    return NextResponse.json({
      ok: true,
      ...(result.profileId ? { profileId: result.profileId } : {}),
      items: result.items,
      meta: assumptionsUserMeta(currentUser),
      message: "가정 오버라이드를 업데이트했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: error instanceof Error ? error.message : "오버라이드 업데이트에 실패했습니다.",
      status: 400,
    });
  }
}

export async function DELETE(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: AssumptionsOverridesMutationInput = null;
  try {
    body = (await request.json()) as AssumptionsOverridesMutationInput;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }

  try {
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const result = await resetRouteAssumptionsOverrides(body?.profileId);
    return NextResponse.json({
      ok: true,
      ...(result.profileId ? { profileId: result.profileId } : {}),
      items: [],
      meta: assumptionsUserMeta(currentUser),
      message: "가정 오버라이드를 초기화했습니다.",
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "오버라이드 초기화에 실패했습니다.",
      status: 500,
    });
  }
}
