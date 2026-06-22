import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  assertDevUnlocked,
  requireCsrf,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import { runOpsActionRoute } from "../../../../../lib/ops/actions/actionRunRouteService";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";

type ActionRunBody = {
  csrf?: unknown;
  actionId?: unknown;
  params?: unknown;
  previewToken?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, { csrf });
    return null;
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
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ActionRunBody = null;
  try {
    body = (await request.json()) as ActionRunBody;
  } catch {
    body = null;
  }

  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const startedAt = Date.now();
  const result = await runOpsActionRoute({
    actionId: body?.actionId,
    params: body?.params,
    previewToken: body?.previewToken,
    startedAt,
  });
  if (result.kind === "not-implemented") {
    return NextResponse.json({
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: result.message,
      },
    }, { status: 501 });
  }

  if (result.kind === "preview-required") {
    return NextResponse.json({
      ok: false,
      error: {
        code: "PREVIEW_REQUIRED",
        message: result.message,
      },
    }, { status: 409 });
  }

  if (result.kind === "validation-error") {
    return opsErrorResponse({
      code: "VALIDATION",
      message: result.message,
      status: 400,
      fixHref: "/ops",
    });
  }

  if (result.kind === "internal-error") {
    return opsErrorResponse({
      code: "INTERNAL",
      message: result.message,
      status: 500,
      fixHref: "/ops",
    });
  }

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    meta: planningUserMeta(currentUser),
    data: {
      actionId: result.actionId,
      ...(result.data ? result.data : {}),
    },
  });
}
