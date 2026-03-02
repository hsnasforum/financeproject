import {
  isPlanningNamespaceEnabled,
  resolvePlanningUserId,
} from "./namespace";

export type PlanningStorageSecurityOptions = {
  namespaceEnabled: boolean;
  userId: string;
  encryptionEnabled: boolean;
  encryptionPassphrase?: string;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function getPlanningStorageSecurityOptions(
  env: NodeJS.ProcessEnv = process.env,
): PlanningStorageSecurityOptions {
  const encryptionEnabled = parseBoolean(env.PLANNING_ENCRYPTION_ENABLED, false);
  const passphrase = typeof env.PLANNING_ENCRYPTION_PASSPHRASE === "string"
    ? env.PLANNING_ENCRYPTION_PASSPHRASE.trim()
    : "";

  return {
    namespaceEnabled: isPlanningNamespaceEnabled(env),
    userId: resolvePlanningUserId(undefined, env),
    encryptionEnabled,
    ...(encryptionEnabled && passphrase ? { encryptionPassphrase: passphrase } : {}),
  };
}

