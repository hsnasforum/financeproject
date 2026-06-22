import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { isPlanningRouteUser, requirePlanningRouteUser } from "../../../../../lib/planning/api/routeAuth";
import {
  assertOpsSecurityVaultCsrf,
  changeOpsSecurityVaultPassphrase,
  recordOpsSecurityChangePassphraseError,
  toOpsSecurityChangePassphraseClientError,
} from "../../../../../lib/planning/server/security/opsSecurityChangePassphraseRouteService";
import { asString, guardLocalRequest, securityUserMeta, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as {
    csrf?: unknown;
    oldPassphrase?: unknown;
    newPassphrase?: unknown;
  } | null;

  try {
    assertOpsSecurityVaultCsrf(request, asString(body?.csrf));
    const currentUser = await requirePlanningRouteUser(request);
    if (!isPlanningRouteUser(currentUser)) return currentUser;
    const status = await changeOpsSecurityVaultPassphrase({
      oldPassphrase: asString(body?.oldPassphrase),
      newPassphrase: asString(body?.newPassphrase),
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
      await recordOpsSecurityChangePassphraseError({
        code: contractGuard.body.error.code,
        status: contractGuard.status,
      }).catch(() => undefined);
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const client = toOpsSecurityChangePassphraseClientError(error);
    const contractError = toOpsContractError({
      code: client.code,
      message: client.message,
      status: client.status,
    });
    await recordOpsSecurityChangePassphraseError({
      code: contractError.body.error.code,
      status: contractError.status,
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
