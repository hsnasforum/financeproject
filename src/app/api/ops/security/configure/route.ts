import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { opsErrorResponse, toOpsContractError } from "../../../../../lib/ops/errorContract";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  assertOpsSecurityVaultCsrf,
  configureOpsSecurityVault,
  recordOpsSecurityConfigureError,
  toOpsSecurityConfigureClientError,
} from "../../../../../lib/planning/server/security/opsSecurityConfigureRouteService";
import { asString, guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    passphrase?: unknown;
    autoLockMinutes?: unknown;
  } | null;

  try {
    assertOpsSecurityVaultCsrf(request, asString(body?.csrf));
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const status = await configureOpsSecurityVault({
      passphrase: asString(body?.passphrase),
      autoLockMinutes: Number(body?.autoLockMinutes),
    });
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
      await recordOpsSecurityConfigureError({
        code: contractGuard.body.error.code,
        status: contractGuard.status,
      }).catch(() => undefined);
      return withVaultCsrf(request, opsErrorResponse({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      }));
    }
    const client = toOpsSecurityConfigureClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
    });
    await recordOpsSecurityConfigureError({
      code: contractError.body.error.code,
      status: contractError.status,
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
