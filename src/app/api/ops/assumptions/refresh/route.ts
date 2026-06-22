import { NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { refreshOpsAssumptions } from "../../../../../lib/ops/assumptions/assumptionsRefreshRouteService";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import {
  isPlanningRouteUser,
  requirePlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";

type RefreshBody = {
  csrf?: unknown;
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

  let body: RefreshBody = null;
  try {
    body = (await request.json()) as RefreshBody;
  } catch {
    body = null;
  }

  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const result = await refreshOpsAssumptions({
    currentUser,
    startedAt: Date.now(),
  });
  if (result.kind === "internal-error") {
    return opsErrorResponse({
      code: "INTERNAL",
      message: result.message,
      status: 500,
    });
  }

  return NextResponse.json({
    ok: true,
    latestId: result.latestId,
    message: result.message,
    meta: result.meta,
    snapshot: result.snapshot,
  });
}
