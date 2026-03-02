import { NextResponse } from "next/server";
import { toGuardErrorResponse } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { appendOpsAuditEvent } from "../../../../../lib/ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../../../../lib/planning/security/vaultCsrf";
import { configureVaultPassphrase } from "../../../../../lib/planning/security/vaultState";
import { asString, guardLocalRequest, withVaultCsrf } from "../_lib";

function toClientError(error: unknown): { status: number; code: string; message: string } {
  const message = error instanceof Error ? error.message : "vault configure failed";
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "PASSPHRASE_REQUIRED", message: "암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_ALREADY_CONFIGURED")) {
    return { status: 409, code: "VAULT_ALREADY_CONFIGURED", message: "Vault가 이미 설정되어 있습니다. 암호 변경을 사용해 주세요." };
  }
  return { status: 500, code: "CONFIGURE_FAILED", message: "Vault 설정을 저장하지 못했습니다." };
}

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
    consumeVaultCsrfOrThrow(request, asString(body?.csrf));
    const status = await configureVaultPassphrase({
      passphrase: asString(body?.passphrase),
      autoLockMinutes: Number(body?.autoLockMinutes),
    });
    await appendOpsAuditEvent({
      eventType: "VAULT_CONFIGURE_SUCCESS",
      meta: {
        configured: status.configured,
        autoLockMinutes: status.autoLockMinutes,
      },
    }).catch(() => undefined);
    return withVaultCsrf(request, NextResponse.json({ ok: true, data: status }));
  } catch (error) {
    const guardError = toGuardErrorResponse(error);
    if (guardError) {
      await appendOpsAuditEvent({
        eventType: "VAULT_CONFIGURE_ERROR",
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
      eventType: "VAULT_CONFIGURE_ERROR",
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
