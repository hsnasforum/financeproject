import { describe, expect, it, vi } from "vitest";
import { __test__, setCooldown, shouldCooldown } from "../src/lib/http/rateLimitCooldown";

describe("rate limit cooldown", () => {
  it("returns cooldown window and expires after time passes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
      __test__.clear();
      const sourceKey = "exchange-test-deterministic";
      const set = setCooldown(sourceKey, 1);
      expect(typeof set.nextRetryAt).toBe("string");

      const first = shouldCooldown(sourceKey);
      expect(first.cooldown).toBe(true);
      expect(typeof first.nextRetryAt).toBe("string");

      vi.advanceTimersByTime(1200);
      const second = shouldCooldown(sourceKey);
      expect(second.cooldown).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps and normalizes invalid retryAfter values", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
      __test__.clear();
      const sourceKey = "finlife-test-deterministic";
      setCooldown(sourceKey, Number.NaN);
      const first = shouldCooldown(sourceKey);
      expect(first.cooldown).toBe(true);

      __test__.clear();
      setCooldown(sourceKey, -5);
      const second = shouldCooldown(sourceKey);
      expect(second.cooldown).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
