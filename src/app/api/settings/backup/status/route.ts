import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { opsErrorResponse } from "@/lib/ops/errorContract";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import {
  getOpsSecurityStatusPayload,
  setOpsSecurityStatusCsrfCookie,
} from "@/lib/planning/server/security/opsSecurityStatusRouteService";

export async function GET(request: Request) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
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

  return await withPlanningRouteUser(request, async (currentUser) => {
    const { status, csrfToken } = await getOpsSecurityStatusPayload(request);
    const response = NextResponse.json({
      ok: true,
      data: status,
      csrfToken,
      meta: planningUserMeta(currentUser),
    });
    return setOpsSecurityStatusCsrfCookie(response, csrfToken);
  });
}
