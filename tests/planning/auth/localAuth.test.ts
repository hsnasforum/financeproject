import { describe, expect, it } from "vitest";
import {
  hashPlanningPin,
  verifyPlanningPinHash,
} from "../../../src/lib/planning/auth/localAuth";

describe("local auth pin hashing", () => {
  it("hashes and verifies pin with pbkdf2", async () => {
    const hashed = await hashPlanningPin("1234");
    expect(hashed.pinHash).toBeTruthy();
    expect(hashed.salt).toBeTruthy();
    expect(hashed.iterations).toBeGreaterThanOrEqual(100_000);

    const ok = await verifyPlanningPinHash("1234", {
      pinHash: hashed.pinHash,
      salt: hashed.salt,
      iterations: hashed.iterations,
      digest: hashed.digest,
    });
    expect(ok).toBe(true);

    const fail = await verifyPlanningPinHash("9999", {
      pinHash: hashed.pinHash,
      salt: hashed.salt,
      iterations: hashed.iterations,
      digest: hashed.digest,
    });
    expect(fail).toBe(false);
  });
});

