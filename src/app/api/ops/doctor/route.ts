import { NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import {
  doctorRouteMeta,
  normalizeOpsDoctorAction,
  runOpsDoctor,
  runOpsDoctorAction,
} from "../../../../lib/planning/server/ops/doctorRouteService";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../lib/planning/api/routeAuth";

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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  try {
    const result = await runOpsDoctor();
    return NextResponse.json({
      ok: true,
      schemaVersion: result.schemaVersion,
      data: result.data,
      report: result.report,
      checks: result.checks,
      issues: result.issues,
      message: result.message,
      meta: {
        ...result.meta,
        ...doctorRouteMeta(currentUser),
      },
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "doctor 실행 실패",
      status: 500,
    });
  }
}

type DoctorActionBody = {
  csrf?: unknown;
  action?: unknown;
};

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const body = await request.json().catch(() => null) as DoctorActionBody | null;
  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const action = normalizeOpsDoctorAction(body?.action);
  if (!action) {
    return opsErrorResponse({
      code: "VALIDATION",
      message: "지원하지 않는 doctor action 입니다.",
      status: 400,
      fixHref: "/ops/doctor",
    });
  }

  const result = await runOpsDoctorAction(action, currentUser);
  if (!result.ok) {
    return opsErrorResponse({
      code: "INTERNAL",
      message: result.message,
      status: 500,
    });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    message: result.message,
    data: result.data,
    meta: doctorRouteMeta(currentUser),
  });
}
