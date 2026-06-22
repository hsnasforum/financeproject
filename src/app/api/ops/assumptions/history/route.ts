import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { listOpsAssumptionsHistory } from "@/lib/ops/assumptions/assumptionsHistoryRouteService";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  isPlanningRouteUser,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, parsed));
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const limit = toSafeLimit(asString(searchParams.get("limit")));

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

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const result = await listOpsAssumptionsHistory({
    currentUser,
    limit,
  });
  if (result.kind === "storage-corrupt") {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: result.message,
      status: 500,
    });
  }

  return NextResponse.json({
    ok: true,
    items: result.items,
    meta: result.meta,
  });
}
