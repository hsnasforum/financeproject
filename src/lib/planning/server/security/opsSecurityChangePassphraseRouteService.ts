import { appendOpsAuditEvent } from "../../../ops/securityAuditLog";
import { consumeVaultCsrfOrThrow } from "../../security/vaultCsrf";
import {
  changeVaultPassphrase,
  type VaultStatus,
} from "../../security/vaultState";

export type OpsSecurityChangePassphraseClientError = {
  status: number;
  code: string;
  message: string;
};

export function assertOpsSecurityVaultCsrf(request: Request, csrfToken: string): void {
  consumeVaultCsrfOrThrow(request, csrfToken);
}

export function toOpsSecurityChangePassphraseClientError(
  error: unknown,
): OpsSecurityChangePassphraseClientError {
  const message = error instanceof Error ? error.message : "vault passphrase change failed";
  if (message.startsWith("VAULT_NOT_CONFIGURED")) {
    return { status: 400, code: "VALIDATION", message: "먼저 vault 암호를 설정해 주세요." };
  }
  if (message.startsWith("VAULT_NEW_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "새 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_OLD_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "기존 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_UNLOCK_BACKOFF")) {
    return { status: 423, code: "LOCKED", message: "잠시 후 다시 시도해 주세요." };
  }
  if (message.startsWith("VAULT_PASSPHRASE_INVALID")) {
    return { status: 401, code: "VALIDATION", message: "암호를 확인해 주세요." };
  }
  return { status: 500, code: "CHANGE_PASSPHRASE_FAILED", message: "암호 변경에 실패했습니다." };
}

export async function changeOpsSecurityVaultPassphrase(input: {
  oldPassphrase: string;
  newPassphrase: string;
}): Promise<VaultStatus> {
  const status = await changeVaultPassphrase({
    oldPassphrase: input.oldPassphrase,
    newPassphrase: input.newPassphrase,
  });
  await appendOpsAuditEvent({
    eventType: "VAULT_CHANGE_PASSPHRASE_SUCCESS",
    meta: {
      unlocked: status.unlocked,
    },
  }).catch(() => undefined);
  return status;
}

export async function recordOpsSecurityChangePassphraseError(input: {
  code: string;
  status: number;
}): Promise<void> {
  await appendOpsAuditEvent({
    eventType: "VAULT_CHANGE_PASSPHRASE_ERROR",
    meta: {
      code: input.code,
      status: input.status,
    },
  }).catch(() => undefined);
}
