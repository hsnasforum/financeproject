import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeStoragePayload, encodeStoragePayload } from "../../../src/lib/planning/security/vaultStorage";
import {
  changeVaultPassphrase,
  configureVaultPassphrase,
  getVaultStatus,
  lockVault,
  resetVaultRuntimeForTests,
  unlockVault,
} from "../../../src/lib/planning/security/vaultState";

const env = process.env as Record<string, string | undefined>;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;

describe("vault state (master key wrapping)", () => {
  let root = "";
  let configPath = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-vault-state-"));
    configPath = path.join(root, "security", "vault.json");
    env.PLANNING_VAULT_CONFIG_PATH = configPath;
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("changes passphrase by rewrapping MK without re-encrypting stored payloads", async () => {
    await configureVaultPassphrase({
      passphrase: "old-passphrase",
      autoLockMinutes: 30,
    });
    const encoded = await encodeStoragePayload({ ok: true, amount: 12345 });
    await lockVault();

    const before = JSON.parse(await fs.promises.readFile(configPath, "utf-8")) as Record<string, unknown>;
    const beforeWrapped = JSON.stringify(before.wrappedMasterKey);

    await changeVaultPassphrase({
      oldPassphrase: "old-passphrase",
      newPassphrase: "new-passphrase",
    });

    const after = JSON.parse(await fs.promises.readFile(configPath, "utf-8")) as Record<string, unknown>;
    const afterWrapped = JSON.stringify(after.wrappedMasterKey);
    expect(after.vaultVersion).toBe(2);
    expect(beforeWrapped).not.toBe(afterWrapped);

    await lockVault();
    await expect(unlockVault("old-passphrase")).rejects.toThrow("VAULT_PASSPHRASE_INVALID");
    await unlockVault("new-passphrase");

    const decoded = await decodeStoragePayload(encoded);
    expect(decoded.payload).toEqual({ ok: true, amount: 12345 });
  });

  it("increments failed attempts and applies unlock backoff", async () => {
    vi.useFakeTimers();
    await configureVaultPassphrase({
      passphrase: "correct-pass",
      lockPolicy: {
        maxFailedAttempts: 2,
        failedWindowSeconds: 120,
        backoffBaseSeconds: 2,
        maxBackoffSeconds: 2,
      },
    });
    await lockVault();

    await expect(unlockVault("wrong-pass")).rejects.toThrow("VAULT_PASSPHRASE_INVALID");
    let status = await getVaultStatus();
    expect(status.failedAttempts).toBe(1);
    expect(status.backoffRemainingSeconds).toBeUndefined();

    await expect(unlockVault("wrong-pass")).rejects.toThrow("VAULT_PASSPHRASE_INVALID");
    status = await getVaultStatus();
    expect(status.failedAttempts).toBe(2);
    expect((status.backoffRemainingSeconds ?? 0)).toBeGreaterThan(0);

    await expect(unlockVault("correct-pass")).rejects.toThrow("VAULT_UNLOCK_BACKOFF");
    await vi.advanceTimersByTimeAsync(2100);
    await expect(unlockVault("correct-pass")).resolves.toBeDefined();
  });

  it("auto-locks after idle timeout", async () => {
    vi.useFakeTimers();
    await configureVaultPassphrase({
      passphrase: "auto-lock-pass",
      autoLockMinutes: 1,
    });
    let status = await getVaultStatus();
    expect(status.unlocked).toBe(true);

    await vi.advanceTimersByTimeAsync(60_100);
    status = await getVaultStatus();
    expect(status.unlocked).toBe(false);
  });

  it("treats corrupted config json as an unconfigured vault", async () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "{ invalid json", "utf-8");

    const status = await getVaultStatus();

    expect(status.configured).toBe(false);
    expect(status.unlocked).toBe(false);
    expect(status.autoLockMinutes).toBe(30);
  });
});
