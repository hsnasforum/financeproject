import { NextResponse } from "next/server";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import { getOrCreateVaultCsrfToken, setVaultCsrfCookie } from "../../../../../lib/planning/security/vaultCsrf";
import { getVaultStatus } from "../../../../../lib/planning/security/vaultState";
import { guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;

  const status = await getVaultStatus();
  const csrfToken = getOrCreateVaultCsrfToken(request);
  const response = NextResponse.json({
    ok: true,
    data: status,
    csrfToken,
    meta: securityUserMeta(currentUser),
  });
  return setVaultCsrfCookie(response, csrfToken);
}
