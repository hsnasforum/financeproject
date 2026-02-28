import { describe, expect, it } from "vitest";
import {
  decryptPlanningJson,
  encryptPlanningJson,
  isPlanningEncryptedEnvelope,
} from "../../../src/lib/planning/crypto/encrypt";

describe("planning encryption", () => {
  it("encrypt/decrypt roundtrip", async () => {
    const payload = {
      id: "profile-1",
      name: "테스트",
      values: [1, 2, 3],
    };
    const envelope = await encryptPlanningJson(payload, "passphrase-123");
    expect(isPlanningEncryptedEnvelope(envelope)).toBe(true);
    expect(envelope.ciphertext).not.toContain("profile-1");

    const decrypted = await decryptPlanningJson(envelope, "passphrase-123");
    expect(decrypted).toEqual(payload);
  });

  it("throws on wrong passphrase", async () => {
    const envelope = await encryptPlanningJson({ ok: true }, "right-passphrase");
    await expect(decryptPlanningJson(envelope, "wrong-passphrase")).rejects.toThrow();
  });
});

