import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  assertOpsSecurityVaultCsrf,
  lockOpsSecurityVault,
  recordOpsSecurityLockError,
} from "../../../../../lib/planning/server/security/opsSecurityLockRouteService";
import { asString, guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as { csrf?: unknown } | null;
  try {
    assertOpsSecurityVaultCsrf(request, asString(body?.csrf));
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const status = await lockOpsSecurityVault();
    return withVaultCsrf(request, NextResponse.json({
      ok: true,
      data: status,
      meta: securityUserMeta(currentUser),
    }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      const contractGuard = toOpsContractError({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      });
      await recordOpsSecurityLockError({
        code: contractGuard.body.error.code,
        status: contractGuard.status,
      }).catch(() => undefined);
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const contractError = toOpsContractError({
      code: "LOCK_FAILED",
      message: "Vault 잠금 처리에 실패했습니다.",
      status: 500,
    });
    await recordOpsSecurityLockError({
      code: contractError.body.error.code,
      status: contractError.status,
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
