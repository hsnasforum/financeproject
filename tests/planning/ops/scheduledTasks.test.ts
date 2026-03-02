import { describe, expect, it } from "vitest";
import {
  evaluateScheduledTaskVaultGuard,
  toScheduledTaskErrorCode,
  toScheduledTaskErrorMessage,
} from "../../../src/lib/ops/scheduledTasks";

describe("scheduledTasks", () => {
  it("returns LOCKED guard when vault is configured but locked", () => {
    const guard = evaluateScheduledTaskVaultGuard({
      configured: true,
      unlocked: false,
    });
    expect(guard.ok).toBe(false);
    expect(guard.code).toBe("LOCKED");
  });

  it("returns ok guard when vault is unlocked or not configured", () => {
    const unlocked = evaluateScheduledTaskVaultGuard({
      configured: true,
      unlocked: true,
    });
    const plain = evaluateScheduledTaskVaultGuard({
      configured: false,
      unlocked: false,
    });
    expect(unlocked.ok).toBe(true);
    expect(plain.ok).toBe(true);
  });

  it("maps known error patterns to scheduled task codes", () => {
    expect(toScheduledTaskErrorCode(new Error("VAULT_LOCKED"))).toBe("LOCKED");
    expect(toScheduledTaskErrorCode(new Error("STALE_ASSUMPTIONS"))).toBe("STALE_ASSUMPTIONS");
    expect(toScheduledTaskErrorCode(new Error("Invalid input"))).toBe("VALIDATION");
    expect(toScheduledTaskErrorCode(new Error("unexpected"))).toBe("INTERNAL");
  });

  it("redacts sensitive strings from error message", () => {
    const message = toScheduledTaskErrorMessage(new Error("Bearer abc123 GITHUB_TOKEN=token123"));
    expect(message).toContain("Bearer ***");
    expect(message).toContain("GITHUB_TOKEN=***");
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("token123");
  });
});
