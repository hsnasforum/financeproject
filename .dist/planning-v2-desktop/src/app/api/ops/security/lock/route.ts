import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { toOpsContractError } from "../../../../../lib/ops/errorContract";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../../../../lib/planning/security/vaultCsrf";
import { lockVault } from "../../../../../lib/planning/security/vaultState";
import { asString, guardLocalRequest, withVaultCsrf } from "../_lib";

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guard = guardLocalRequest(request);
  if (guard) return withVaultCsrf(request, guard);

  const body = await request.json().catch(() => null) as { csrf?: unknown } | null;
  try {
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const status = await lockVault();
    await appendOpsAuditEvent({
      eventType: "VAULT_LOCK_SUCCESS",
      meta: {
        unlocked: status.unlocked,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json({ ok: true, data: status }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      const contractGuard = toOpsContractError({
        code: guardError.code,
        message: guardError.message,
        status: guardError.status,
      });
      await appendOpsAuditEvent({
        eventType: "VAULT_LOCK_ERROR",
        meta: {
          code: contractGuard.body.error.code,
          status: contractGuard.status,
        },
      }).catch(() => undefined);
      return withVaultCsrf(request, NextResponse.json(contractGuard.body, { status: contractGuard.status }));
    }
    const contractError = toOpsContractError({
      code: "LOCK_FAILED",
      message: "Vault 잠금 처리에 실패했습니다.",
      status: 500,
    });
    await appendOpsAuditEvent({
      eventType: "VAULT_LOCK_ERROR",
      meta: {
        code: contractError.body.error.code,
        status: contractError.status,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(contractError.body, { status: contractError.status }));
  }
}
