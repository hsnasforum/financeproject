import { NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { syncOpsAssumptions } from "../../../../../lib/ops/assumptions/assumptionsSyncRouteService";
import { opsErrorResponse } from "../../../../../lib/ops/errorContract";
import {
  isPlanningRouteUser,
  requirePlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";
import { assumptionsUserMeta } from "../_lib";

type SyncBody = {
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

  let body: SyncBody = null;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    body = null;
  }

  const guard = guardRequest(request, asString(body?.csrf));
  if (guard) return guard;

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const result = await syncOpsAssumptions({ currentUser });
  if (result.kind === "internal-error") {
    return opsErrorResponse({
      code: "INTERNAL",
      message: result.message,
      status: 500,
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotSummary: result.snapshotSummary,
    message: result.message,
    meta: assumptionsUserMeta(currentUser, result.meta),
  });
}
