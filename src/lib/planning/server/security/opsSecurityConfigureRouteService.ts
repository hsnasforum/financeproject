import { appendOpsAuditEvent } from "../../../ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../security/vaultCsrf";
import {
  configureVaultPassphrase,
  type VaultStatus,
} from "../../security/vaultState";

export type OpsSecurityConfigureClientError = {
  status: number;
  code: string;
  message: string;
};

export function assertOpsSecurityVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function toOpsSecurityConfigureClientError(error: unknown): OpsSecurityConfigureClientError {
  const message = error instanceof Error ? error.message : "vault configure failed";
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_ALREADY_CONFIGURED")) {
    return { status: 409, code: "VALIDATION", message: "Vault가 이미 설정되어 있습니다. 암호 변경을 사용해 주세요." };
  }
  return { status: 500, code: "CONFIGURE_FAILED", message: "Vault 설정을 저장하지 못했습니다." };
}

export async function configureOpsSecurityVault(input: {
  passphrase: string;
  autoLockMinutes: number;
}): Promise<VaultStatus> {
  const status = await configureVaultPassphrase({
    passphrase: input.passphrase,
    autoLockMinutes: input.autoLockMinutes,
  });
  await appendOpsAuditEvent({
    eventType: "VAULT_CONFIGURE_SUCCESS",
    meta: {
      configured: status.configured,
      autoLockMinutes: status.autoLockMinutes,
    },
  }).catch(() => undefined);
  return status;
}

export async function recordOpsSecurityConfigureError(input: {
  code: string;
  status: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_CONFIGURE_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
}
