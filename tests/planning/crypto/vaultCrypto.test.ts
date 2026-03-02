import { describe, expect, it } from "vitest";
import {
  decryptBytesWithKey,
  deriveKeyFromPassphrase,
  encryptBytesWithKey,
} from "../../../src/lib/planning/crypto/vaultCrypto";
import {
  decryptPlanningDataVaultArchive,
  encryptPlanningDataVaultArchive,
} from "../../../src/lib/ops/backup/planningDataVault";

describe("vault crypto", () => {
  it("encrypt/decrypt roundtrip with derived key", async () => {
    const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const key = await deriveKeyFromPassphrase("vault-passphrase", salt);
    const plain = Buffer.from(JSON.stringify({ ok: true, value: 123 }), "utf-8");
    const encrypted = encryptBytesWithKey(key, plain);

    expect(encrypted.ciphertext).not.toContain("\"ok\"");
    const decrypted = decryptBytesWithKey(key, encrypted);
    expect(decrypted.toString("utf-8")).toBe(plain.toString("utf-8"));
  });

  it("rejects wrong passphrase without leaking payload", async () => {
    const archive = await encryptPlanningDataVaultArchive(Buffer.from("hello-backup", "utf-8"), "correct-passphrase");
    await expect(decryptPlanningDataVaultArchive(archive, "wrong-passphrase")).rejects.toThrow("VAULT_PASSPHRASE_INVALID");
    expect(archive.toString("utf-8")).not.toContain("hello-backup");
  });
});
