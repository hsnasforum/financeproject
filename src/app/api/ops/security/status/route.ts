import {
  NextResponse } from "next/server";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { withPlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  getOpsSecurityStatusPayload,
  setOpsSecurityStatusCsrfCookie,
} from "../../../../../lib/planning/server/security/opsSecurityStatusRouteService";
import { guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  return await withPlanningRouteUser(request, async (currentUser) => {

    const { status, csrfToken } = await getOpsSecurityStatusPayload(request);
    const response = NextResponse.json({
      ok: true,
      data: status,
      csrfToken,
      meta: securityUserMeta(currentUser),
    });
    return setOpsSecurityStatusCsrfCookie(response, csrfToken);
  });
}
