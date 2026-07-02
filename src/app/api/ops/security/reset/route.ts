import {
  NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { withPlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  assertOpsSecurityVaultCsrf,
  OPS_SECURITY_RESET_CONFIRM_PHRASE,
  recordOpsSecurityResetError,
  resetOpsSecurityVaultAndPlanningData,
  toOpsSecurityResetClientError,
} from "../../../../../lib/planning/server/security/opsSecurityResetRouteService";
import { asString, guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    confirmText?: unknown;
    keepAudit?: unknown;
  } | null;

  try {
    assertOpsSecurityVaultCsrf(request, asString(body?.csrf));
    return await withPlanningRouteUser(request, async (currentUser) => {
      const keepAudit = body?.keepAudit !== false;
      const { reset, status } = await resetOpsSecurityVaultAndPlanningData({
        confirmText: asString(body?.confirmText),
        keepAudit,
      });

      return withVaultCsrf(request, NextResponse.json({
        ok: true,
        data: status,
        meta: securityUserMeta(currentUser, {
          reset,
        }),
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
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const client = toOpsSecurityResetClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
      details: {
        expectedConfirm: OPS_SECURITY_RESET_CONFIRM_PHRASE,
      },
    });
    await recordOpsSecurityResetError({
      code: contractError.body.error.code,
      status: contractError.status,
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
