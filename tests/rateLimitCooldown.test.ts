import { describe, expect, it } from "vitest";
import { __test__, setCooldown, shouldCooldown } from "../src/lib/http/rateLimitCooldown";

describe("rate limit cooldown", () => {
  it("returns cooldown window and expires after time passes", async () => {
    __test__.clear();
    const sourceKey = `exchange-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const set = setCooldown(sourceKey, 1);
    expect(typeof set.nextRetryAt).toBe("string");

    const first = shouldCooldown(sourceKey);
    expect(first.cooldown).toBe(true);
    expect(typeof first.nextRetryAt).toBe("string");

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const second = shouldCooldown(sourceKey);
    expect(second.cooldown).toBe(false);
  });

  it("caps and normalizes invalid retryAfter values", () => {
    __test__.clear();
    const sourceKey = `finlife-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCooldown(sourceKey, Number.NaN);
    const first = shouldCooldown(sourceKey);
    expect(first.cooldown).toBe(true);

    __test__.clear();
    setCooldown(sourceKey, -5);
    const second = shouldCooldown(sourceKey);
    expect(second.cooldown).toBe(true);
  });
});
