import {
  getOrCreateVaultCsrfToken,
  setVaultCsrfCookie,
} from "../../security/vaultCsrf";
import {
  getVaultStatus,
  type VaultStatus,
} from "../../security/vaultState";

export type OpsSecurityStatusPayload = {
  status: VaultStatus;
  csrfToken: string;
};

export async function getOpsSecurityStatusPayload(request: Request): Promise<OpsSecurityStatusPayload> {
  return {
    status: await getVaultStatus(),
    csrfToken: getOrCreateVaultCsrfToken(request),
  };
}

export function setOpsSecurityStatusCsrfCookie<T extends Response>(response: T, csrfToken: string): T {
  return setVaultCsrfCookie(response, csrfToken);
}
