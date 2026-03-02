import {
  decryptPlanningJson,
  encryptPlanningJson,
  isPlanningEncryptedEnvelope,
} from "../crypto/encrypt";
import {
  decryptJsonWithKey,
  encryptJsonWithKey,
  isVaultEncryptedEnvelope,
} from "../crypto/vaultCrypto";
import { getPlanningStorageSecurityOptions } from "../store/security";
import { getUnlockedVaultKey, isVaultConfigured } from "./vaultState";

export type StoragePayloadSource = "plain" | "legacy-envelope" | "vault-envelope";

export type DecodedStoragePayload = {
  payload: unknown;
  source: StoragePayloadSource;
  rewriteToVault: boolean;
};

function hasLegacyPassphrase(): boolean {
  const options = getPlanningStorageSecurityOptions();
  return options.encryptionEnabled && typeof options.encryptionPassphrase === "string" && options.encryptionPassphrase.length > 0;
}

async function decryptLegacyEnvelope(payload: unknown): Promise<unknown> {
  const options = getPlanningStorageSecurityOptions();
  if (!options.encryptionEnabled || !options.encryptionPassphrase) {
    throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  return decryptPlanningJson(payload, options.encryptionPassphrase);
}

export async function encodeStoragePayload(payload: unknown): Promise<unknown> {
  const vaultConfigured = await isVaultConfigured();
  if (vaultConfigured) {
    const key = await getUnlockedVaultKey();
    if (!key) {
      throw new Error("VAULT_LOCKED");
    }
    return encryptJsonWithKey(key, payload);
  }

  const options = getPlanningStorageSecurityOptions();
  if (options.encryptionEnabled) {
    if (!options.encryptionPassphrase) {
      throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
    }
    return encryptPlanningJson(payload, options.encryptionPassphrase);
  }

  return payload;
}

export async function decodeStoragePayload(payload: unknown): Promise<DecodedStoragePayload> {
  const vaultConfigured = await isVaultConfigured();
  const vaultKey = await getUnlockedVaultKey();

  if (isVaultEncryptedEnvelope(payload)) {
    if (!vaultConfigured || !vaultKey) {
      throw new Error("VAULT_LOCKED");
    }
    return {
      payload: decryptJsonWithKey(vaultKey, payload),
      source: "vault-envelope",
      rewriteToVault: false,
    };
  }

  if (isPlanningEncryptedEnvelope(payload)) {
    if (vaultConfigured && !vaultKey) {
      throw new Error("VAULT_LOCKED");
    }
    const decrypted = await decryptLegacyEnvelope(payload);
    return {
      payload: decrypted,
      source: "legacy-envelope",
      rewriteToVault: vaultConfigured && Boolean(vaultKey),
    };
  }

  if (vaultConfigured) {
    if (!vaultKey) {
      throw new Error("VAULT_LOCKED");
    }
    return {
      payload,
      source: "plain",
      rewriteToVault: true,
    };
  }

  // Keep backward compatibility: when vault is not configured, plain payload is still readable.
  // Legacy encrypted payloads remain readable only with legacy passphrase settings.
  if (!hasLegacyPassphrase()) {
    return {
      payload,
      source: "plain",
      rewriteToVault: false,
    };
  }

  return {
    payload,
    source: "plain",
    rewriteToVault: false,
  };
}
