import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_VAULT_KDF_PARAMS,
  decryptBytesWithKey,
  deriveKeyFromPassphrase,
  encryptBytesWithKey,
  isVaultEncryptedEnvelope,
  type VaultEncryptedEnvelope,
  type VaultKdfParams,
} from "../crypto/vaultCrypto";
import { resolvePlanningDataDir } from "../storage/dataDir";

type VaultLockPolicy = {
  autoLockMinutes: number;
  maxFailedAttempts: number;
  failedWindowSeconds: number;
  backoffBaseSeconds: number;
  maxBackoffSeconds: number;
};

type VaultConfigV2 = {
  vaultVersion: 2;
  kdf: VaultKdfParams;
  salt: string;
  wrappedMasterKey: VaultEncryptedEnvelope;
  lockPolicy: VaultLockPolicy;
  createdAt: string;
  updatedAt: string;
};

type VaultConfigV1 = {
  version: 1;
  kdf: VaultKdfParams;
  salt: string;
  verifierHash: string;
  autoLockMinutes: number;
  createdAt: string;
  updatedAt: string;
};

type VaultConfig = VaultConfigV1 | VaultConfigV2;

type VaultRuntime = {
  loaded: boolean;
  config: VaultConfig | null;
  configSourcePath: string | null;
  unlockedMasterKey: Buffer | null;
  unlockStartedAt: number | null;
  lastActivityAt: number | null;
  autoLockTimer: NodeJS.Timeout | null;
  failedAttempts: number;
  failureWindowStartedAt: number | null;
  blockedUntil: number | null;
};

export type VaultStatus = {
  configured: boolean;
  unlocked: boolean;
  autoLockMinutes: number;
  lockPolicy: VaultLockPolicy;
  failedAttempts: number;
  blockedUntil?: string;
  backoffRemainingSeconds?: number;
  unlockedAt?: string;
};

const DEFAULT_LOCK_POLICY: VaultLockPolicy = {
  autoLockMinutes: 30,
  maxFailedAttempts: 5,
  failedWindowSeconds: 300,
  backoffBaseSeconds: 30,
  maxBackoffSeconds: 900,
};

function getRuntime(): VaultRuntime {
  const globalObject = globalThis as unknown as { __planningVaultRuntime?: VaultRuntime };
  if (!globalObject.__planningVaultRuntime) {
    globalObject.__planningVaultRuntime = {
      loaded: false,
      config: null,
      configSourcePath: null,
      unlockedMasterKey: null,
      unlockStartedAt: null,
      lastActivityAt: null,
      autoLockTimer: null,
      failedAttempts: 0,
      failureWindowStartedAt: null,
      blockedUntil: null,
    };
  }
  return globalObject.__planningVaultRuntime;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  const raw = asString(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeLockPolicy(value: unknown, fallback: VaultLockPolicy = DEFAULT_LOCK_POLICY): VaultLockPolicy {
  const row = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
  return {
    autoLockMinutes: normalizeInt(row.autoLockMinutes, fallback.autoLockMinutes, 1, 24 * 60),
    maxFailedAttempts: normalizeInt(row.maxFailedAttempts, fallback.maxFailedAttempts, 1, 20),
    failedWindowSeconds: normalizeInt(row.failedWindowSeconds, fallback.failedWindowSeconds, 10, 24 * 60 * 60),
    backoffBaseSeconds: normalizeInt(row.backoffBaseSeconds, fallback.backoffBaseSeconds, 1, 24 * 60 * 60),
    maxBackoffSeconds: normalizeInt(row.maxBackoffSeconds, fallback.maxBackoffSeconds, 1, 24 * 60 * 60),
  };
}

function resolveConfigPath(): string {
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolvePlanningDataDir(), "security", "vault.json");
}

function resolveLegacyConfigPath(): string {
  const override = asString(process.env.PLANNING_VAULT_CONFIG_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolvePlanningDataDir(), "security", "vault.config.json");
}

function isV2Config(config: VaultConfig): config is VaultConfigV2 {
  return (config as VaultConfigV2).vaultVersion === 2;
}

function isRecoverableConfigReadError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT") return true;
  return error instanceof SyntaxError;
}

function parseConfig(raw: unknown): VaultConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kdfRaw = (row.kdf && typeof row.kdf === "object" && !Array.isArray(row.kdf))
    ? (row.kdf as Record<string, unknown>)
    : {};
  const kdf: VaultKdfParams = {
    name: "scrypt",
    N: normalizeInt(kdfRaw.N, DEFAULT_VAULT_KDF_PARAMS.N, 2, 1_048_576),
    r: normalizeInt(kdfRaw.r, DEFAULT_VAULT_KDF_PARAMS.r, 1, 256),
    p: normalizeInt(kdfRaw.p, DEFAULT_VAULT_KDF_PARAMS.p, 1, 256),
    keyLength: normalizeInt(kdfRaw.keyLength, DEFAULT_VAULT_KDF_PARAMS.keyLength, 16, 64),
  };

  if (Number(row.vaultVersion) === 2) {
    const salt = asString(row.salt);
    const wrappedMasterKey = row.wrappedMasterKey;
    if (!salt || !isVaultEncryptedEnvelope(wrappedMasterKey)) return null;
    return {
      vaultVersion: 2,
      kdf,
      salt,
      wrappedMasterKey,
      lockPolicy: normalizeLockPolicy(row.lockPolicy),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  if (Number(row.version) === 1) {
    const salt = asString(row.salt);
    const verifierHash = asString(row.verifierHash);
    if (!salt || !verifierHash) return null;
    return {
      version: 1,
      kdf,
      salt,
      verifierHash,
      autoLockMinutes: normalizeInt(row.autoLockMinutes, DEFAULT_LOCK_POLICY.autoLockMinutes, 1, 24 * 60),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  return null;
}

async function readConfigFile(): Promise<{ config: VaultConfig | null; sourcePath: string | null }> {
  const target = resolveConfigPath();
  try {
    const raw = await fs.readFile(target, "utf-8");
    return {
      config: parseConfig(JSON.parse(raw) as unknown),
      sourcePath: target,
    };
  } catch (error) {
    if (!isRecoverableConfigReadError(error)) throw error;
  }

  const legacy = resolveLegacyConfigPath();
  if (legacy === target) return { config: null, sourcePath: null };
  try {
    const raw = await fs.readFile(legacy, "utf-8");
    return {
      config: parseConfig(JSON.parse(raw) as unknown),
      sourcePath: legacy,
    };
  } catch (error) {
    if (isRecoverableConfigReadError(error)) {
      return { config: null, sourcePath: null };
    }
    throw error;
  }
}

async function writeConfigFile(config: VaultConfig): Promise<void> {
  const filePath = resolveConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

function clearAutoLockTimer(runtime: VaultRuntime): void {
  if (runtime.autoLockTimer) {
    clearTimeout(runtime.autoLockTimer);
    runtime.autoLockTimer = null;
  }
}

function clearFailureState(runtime: VaultRuntime): void {
  runtime.failedAttempts = 0;
  runtime.failureWindowStartedAt = null;
  runtime.blockedUntil = null;
}

function clearUnlockedState(runtime: VaultRuntime): void {
  runtime.unlockedMasterKey = null;
  runtime.unlockStartedAt = null;
  runtime.lastActivityAt = null;
  clearAutoLockTimer(runtime);
}

function policyFromConfig(config: VaultConfig): VaultLockPolicy {
  if (isV2Config(config)) {
    return normalizeLockPolicy(config.lockPolicy);
  }
  return {
    ...DEFAULT_LOCK_POLICY,
    autoLockMinutes: normalizeInt(config.autoLockMinutes, DEFAULT_LOCK_POLICY.autoLockMinutes, 1, 24 * 60),
  };
}

function scheduleAutoLock(runtime: VaultRuntime): void {
  clearAutoLockTimer(runtime);
  if (!runtime.config || !runtime.unlockedMasterKey || !runtime.lastActivityAt) return;
  const policy = policyFromConfig(runtime.config);
  const timeoutMs = policy.autoLockMinutes * 60 * 1000;
  runtime.autoLockTimer = setTimeout(() => {
    const lastActivityAt = runtime.lastActivityAt ?? 0;
    const idleMs = Date.now() - lastActivityAt;
    if (idleMs >= timeoutMs) {
      clearUnlockedState(runtime);
      return;
    }
    scheduleAutoLock(runtime);
  }, timeoutMs);
}

function touchActivity(runtime: VaultRuntime): void {
  if (!runtime.unlockedMasterKey || !runtime.config) return;
  runtime.lastActivityAt = Date.now();
  scheduleAutoLock(runtime);
}

function registerFailedAttempt(runtime: VaultRuntime, policy: VaultLockPolicy): void {
  const now = Date.now();
  const windowMs = policy.failedWindowSeconds * 1000;
  if (!runtime.failureWindowStartedAt || now - runtime.failureWindowStartedAt > windowMs) {
    runtime.failureWindowStartedAt = now;
    runtime.failedAttempts = 0;
  }
  runtime.failedAttempts += 1;

  if (runtime.failedAttempts >= policy.maxFailedAttempts) {
    const overflow = runtime.failedAttempts - policy.maxFailedAttempts;
    const backoffSeconds = Math.min(
      policy.maxBackoffSeconds,
      policy.backoffBaseSeconds * (2 ** overflow),
    );
    runtime.blockedUntil = now + backoffSeconds * 1000;
  }
}

function assertBackoffAllowed(runtime: VaultRuntime): void {
  if (!runtime.blockedUntil) return;
  if (Date.now() >= runtime.blockedUntil) {
    runtime.blockedUntil = null;
    return;
  }
  throw new Error("VAULT_UNLOCK_BACKOFF");
}

function timingSafeEqualsBase64(expectedBase64: string, actual: Buffer): boolean {
  const expected = Buffer.from(expectedBase64, "base64");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

async function ensureLoaded(): Promise<VaultRuntime> {
  const runtime = getRuntime();
  if (runtime.loaded) return runtime;
  const loaded = await readConfigFile();
  runtime.config = loaded.config;
  runtime.configSourcePath = loaded.sourcePath;
  runtime.loaded = true;
  return runtime;
}

async function createV2ConfigFromMasterKey(args: {
  masterKey: Buffer;
  passphrase: string;
  lockPolicy: VaultLockPolicy;
  createdAt?: string;
}): Promise<VaultConfigV2> {
  const salt = crypto.randomBytes(16);
  const kdf = { ...DEFAULT_VAULT_KDF_PARAMS };
  const kek = await deriveKeyFromPassphrase(args.passphrase, salt, kdf);
  const wrappedMasterKey = encryptBytesWithKey(kek, args.masterKey);
  const now = new Date().toISOString();
  return {
    vaultVersion: 2,
    kdf,
    salt: salt.toString("base64"),
    wrappedMasterKey,
    lockPolicy: normalizeLockPolicy(args.lockPolicy),
    createdAt: toIso(args.createdAt, now),
    updatedAt: now,
  };
}

async function unwrapMasterKey(config: VaultConfigV2, passphrase: string): Promise<Buffer> {
  const kek = await deriveKeyFromPassphrase(passphrase, Buffer.from(config.salt, "base64"), config.kdf);
  return decryptBytesWithKey(kek, config.wrappedMasterKey);
}

async function verifyLegacyPassphrase(config: VaultConfigV1, passphrase: string): Promise<Buffer> {
  const derived = await deriveKeyFromPassphrase(passphrase, Buffer.from(config.salt, "base64"), config.kdf);
  if (!timingSafeEqualsBase64(config.verifierHash, derived)) {
    throw new Error("VAULT_PASSPHRASE_INVALID");
  }
  return derived;
}

async function setUnlockedMasterKey(runtime: VaultRuntime, masterKey: Buffer): Promise<void> {
  runtime.unlockedMasterKey = Buffer.from(masterKey);
  runtime.unlockStartedAt = Date.now();
  clearFailureState(runtime);
  touchActivity(runtime);
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const runtime = await ensureLoaded();
  const config = runtime.config;
  const policy = config ? policyFromConfig(config) : DEFAULT_LOCK_POLICY;
  const remainingMs = runtime.blockedUntil ? runtime.blockedUntil - Date.now() : 0;
  const backoffRemainingSeconds = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;

  return {
    configured: Boolean(config),
    unlocked: Boolean(config && runtime.unlockedMasterKey),
    autoLockMinutes: policy.autoLockMinutes,
    lockPolicy: policy,
    failedAttempts: runtime.failedAttempts,
    ...(runtime.unlockStartedAt ? { unlockedAt: new Date(runtime.unlockStartedAt).toISOString() } : {}),
    ...(runtime.blockedUntil && remainingMs > 0 ? { blockedUntil: new Date(runtime.blockedUntil).toISOString() } : {}),
    ...(backoffRemainingSeconds > 0 ? { backoffRemainingSeconds } : {}),
  };
}

export async function configureVaultPassphrase(input: {
  passphrase: string;
  autoLockMinutes?: number;
  lockPolicy?: Partial<VaultLockPolicy>;
}): Promise<VaultStatus> {
  const passphrase = asString(input.passphrase);
  if (!passphrase) {
    throw new Error("VAULT_PASSPHRASE_REQUIRED");
  }

  const runtime = await ensureLoaded();
  if (runtime.config) {
    throw new Error("VAULT_ALREADY_CONFIGURED");
  }

  const basePolicy = {
    ...DEFAULT_LOCK_POLICY,
    ...(input.autoLockMinutes !== undefined ? { autoLockMinutes: input.autoLockMinutes } : {}),
  };
  const lockPolicy = normalizeLockPolicy({
    ...basePolicy,
    ...(input.lockPolicy ?? {}),
  });
  const masterKey = crypto.randomBytes(32);
  const nextConfig = await createV2ConfigFromMasterKey({
    masterKey,
    passphrase,
    lockPolicy,
  });

  await writeConfigFile(nextConfig);
  runtime.config = nextConfig;
  runtime.configSourcePath = resolveConfigPath();
  await setUnlockedMasterKey(runtime, masterKey);
  return getVaultStatus();
}

export async function unlockVault(passphrase: string): Promise<VaultStatus> {
  const runtime = await ensureLoaded();
  if (!runtime.config) {
    throw new Error("VAULT_NOT_CONFIGURED");
  }

  const normalized = asString(passphrase);
  if (!normalized) {
    throw new Error("VAULT_PASSPHRASE_REQUIRED");
  }

  const policy = policyFromConfig(runtime.config);
  assertBackoffAllowed(runtime);

  try {
    let masterKey: Buffer;
    if (isV2Config(runtime.config)) {
      masterKey = await unwrapMasterKey(runtime.config, normalized);
    } else {
      // Legacy v1: verifierHash == previously used data key.
      masterKey = await verifyLegacyPassphrase(runtime.config, normalized);
      const migrated = await createV2ConfigFromMasterKey({
        masterKey,
        passphrase: normalized,
        lockPolicy: {
          ...DEFAULT_LOCK_POLICY,
          autoLockMinutes: runtime.config.autoLockMinutes,
        },
        createdAt: runtime.config.createdAt,
      });
      await writeConfigFile(migrated);
      runtime.config = migrated;
      runtime.configSourcePath = resolveConfigPath();
    }

    await setUnlockedMasterKey(runtime, masterKey);
    return getVaultStatus();
  } catch (error) {
    registerFailedAttempt(runtime, policy);
    if (error instanceof Error && error.message.startsWith("VAULT_UNLOCK_BACKOFF")) {
      throw error;
    }
    throw new Error("VAULT_PASSPHRASE_INVALID");
  }
}

export async function changeVaultPassphrase(input: {
  oldPassphrase?: string;
  newPassphrase: string;
}): Promise<VaultStatus> {
  const runtime = await ensureLoaded();
  if (!runtime.config) {
    throw new Error("VAULT_NOT_CONFIGURED");
  }

  const newPassphrase = asString(input.newPassphrase);
  if (!newPassphrase) {
    throw new Error("VAULT_NEW_PASSPHRASE_REQUIRED");
  }

  const policy = policyFromConfig(runtime.config);
  let masterKey: Buffer<ArrayBufferLike> | null = runtime.unlockedMasterKey ? Buffer.from(runtime.unlockedMasterKey) : null;

  if (!masterKey) {
    const oldPassphrase = asString(input.oldPassphrase);
    if (!oldPassphrase) {
      throw new Error("VAULT_OLD_PASSPHRASE_REQUIRED");
    }
    assertBackoffAllowed(runtime);
    try {
      if (isV2Config(runtime.config)) {
        masterKey = await unwrapMasterKey(runtime.config, oldPassphrase);
      } else {
        masterKey = await verifyLegacyPassphrase(runtime.config, oldPassphrase);
      }
    } catch {
      registerFailedAttempt(runtime, policy);
      throw new Error("VAULT_PASSPHRASE_INVALID");
    }
  }

  const nextConfig = await createV2ConfigFromMasterKey({
    masterKey,
    passphrase: newPassphrase,
    lockPolicy: policy,
    createdAt: runtime.config.createdAt,
  });

  await writeConfigFile(nextConfig);
  runtime.config = nextConfig;
  runtime.configSourcePath = resolveConfigPath();
  await setUnlockedMasterKey(runtime, masterKey);
  return getVaultStatus();
}

export async function lockVault(): Promise<VaultStatus> {
  const runtime = await ensureLoaded();
  clearUnlockedState(runtime);
  return getVaultStatus();
}

export async function updateVaultAutoLockMinutes(minutes: number): Promise<VaultStatus> {
  const runtime = await ensureLoaded();
  if (!runtime.config) {
    throw new Error("VAULT_NOT_CONFIGURED");
  }

  if (isV2Config(runtime.config)) {
    runtime.config = {
      ...runtime.config,
      lockPolicy: {
        ...runtime.config.lockPolicy,
        autoLockMinutes: normalizeInt(minutes, runtime.config.lockPolicy.autoLockMinutes, 1, 24 * 60),
      },
      updatedAt: new Date().toISOString(),
    };
  } else {
    runtime.config = {
      ...runtime.config,
      autoLockMinutes: normalizeInt(minutes, runtime.config.autoLockMinutes, 1, 24 * 60),
      updatedAt: new Date().toISOString(),
    };
  }

  await writeConfigFile(runtime.config);
  touchActivity(runtime);
  return getVaultStatus();
}

export async function getUnlockedVaultMasterKey(): Promise<Buffer | null> {
  const runtime = await ensureLoaded();
  if (!runtime.unlockedMasterKey) return null;
  touchActivity(runtime);
  return Buffer.from(runtime.unlockedMasterKey);
}

// Backward-compatible alias.
export async function getUnlockedVaultKey(): Promise<Buffer | null> {
  return getUnlockedVaultMasterKey();
}

export async function isVaultConfigured(): Promise<boolean> {
  const runtime = await ensureLoaded();
  return Boolean(runtime.config);
}

export async function resetVaultRuntime(): Promise<void> {
  const runtime = getRuntime();
  clearAutoLockTimer(runtime);
  runtime.loaded = false;
  runtime.config = null;
  runtime.configSourcePath = null;
  runtime.unlockedMasterKey = null;
  runtime.unlockStartedAt = null;
  runtime.lastActivityAt = null;
  runtime.failedAttempts = 0;
  runtime.failureWindowStartedAt = null;
  runtime.blockedUntil = null;
}

export async function resetVaultRuntimeForTests(): Promise<void> {
  await resetVaultRuntime();
}
