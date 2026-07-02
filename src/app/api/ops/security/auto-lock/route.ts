import {
  NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { withPlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  assertOpsSecurityVaultCsrf,
  recordOpsSecurityAutoLockError,
  toOpsSecurityAutoLockClientError,
  updateOpsSecurityAutoLockMinutes,
} from "../../../../../lib/planning/server/security/opsSecurityAutoLockRouteService";
import { asString, guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    minutes?: unknown;
  } | null;
  try {
    assertOpsSecurityVaultCsrf(request, asString(body?.csrf));
    return await withPlanningRouteUser(request, async (currentUser) => {
      const status = await updateOpsSecurityAutoLockMinutes(Number(body?.minutes));
      return withVaultCsrf(request, NextResponse.json({
        ok: true,
        data: status,
        meta: securityUserMeta(currentUser),
      }));
    });
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      const contractGuard = toOpsContractError({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      });
      await recordOpsSecurityAutoLockError({
        code: contractGuard.body.error.code,
        status: contractGuard.status,
      }).catch(() => undefined);
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const client = toOpsSecurityAutoLockClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
    });
    await recordOpsSecurityAutoLockError({
      code: contractError.body.error.code,
      status: contractError.status,
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
