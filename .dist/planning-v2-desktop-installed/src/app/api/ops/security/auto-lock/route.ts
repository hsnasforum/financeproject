import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../../../../lib/planning/security/vaultCsrf";
import { updateVaultAutoLockMinutes } from "../../../../../lib/planning/security/vaultState";
import { asString, guardLocalRequest, withVaultCsrf } from "../_lib";

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = error instanceof Error ? error.message : "vault auto lock update failed";
  if (message.startsWith("VAULT_NOT_CONFIGURED")) {
    return { status: 400, code: "VAULT_NOT_CONFIGURED", message: "먼저 vault 암호를 설정해 주세요." };
  }
  return { status: 500, code: "AUTO_LOCK_UPDATE_FAILED", message: "자동 잠금 시간을 저장하지 못했습니다." };
}

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
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const status = await updateVaultAutoLockMinutes(Number(body?.minutes));
    await appendOpsAuditEvent({
      eventType: "VAULT_AUTOLOCK_UPDATE_SUCCESS",
      meta: {
        autoLockMinutes: status.autoLockMinutes,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json({ ok: true, data: status }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      await appendOpsAuditEvent({
        eventType: "VAULT_AUTOLOCK_UPDATE_ERROR",
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
    const client = toClientError(error);
    await appendOpsAuditEvent({
      eventType: "VAULT_AUTOLOCK_UPDATE_ERROR",
      meta: {
        code: client.code,
        status: client.status,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json(
      { ok: false, error: { code: client.code, message: client.message } },
      { status: client.status },
    ));
  }
}
