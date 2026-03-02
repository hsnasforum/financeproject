import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
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
      await appendOpsAuditEvent({
        eventType: "VAULT_LOCK_ERROR",
        meta: {
          code: guardError.code,
          status: guardError.status,
        },
      }).catch(() => undefined);
      return withVaultCsrf(request, NextResponse.json(
        { ok: false, error: { code: guardError.code, message: guardError.message } },
        { status: guardError.status },
      ));
    }
    await appendOpsAuditEvent({
      eventType: "VAULT_LOCK_ERROR",
      meta: {
        code: "LOCK_FAILED",
        status: 500,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(
      { ok: false, error: { code: "LOCK_FAILED", message: "Vault 잠금 처리에 실패했습니다." } },
      { status: 500 },
    ));
  }
}
