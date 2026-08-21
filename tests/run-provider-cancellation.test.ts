import { afterEach, describe, expect, it } from "vitest";
import { ExternalApiError } from "../src/lib/http/fetchExternal";
import { __test__ as cooldownTest, shouldCooldown } from "../src/lib/http/rateLimitCooldown";
import { runProvider } from "../src/lib/providers/runProvider";
import { type Provider } from "../src/lib/providers/types";

const sourceKey = "test-provider-external-abort";

const provider: Provider<void, never> = {
  id: "external-abort-provider",
  displayName: "external abort provider",
  cooldownKey: sourceKey,
  isConfigured: () => true,
  buildCacheKey: () => "one",
  fetch: async () => {
    throw new ExternalApiError(
      { code: "UPSTREAM", message: "호출자가 요청을 취소했습니다." },
      { aborted: true, timeout: false },
    );
  },
};

describe("runProvider external cancellation", () => {
  afterEach(() => {
    cooldownTest.clear();
  });

  it("does not open source cooldown for a caller-owned abort", async () => {
    const response = await runProvider(provider, undefined, {
      debug: true,
      singleflight: false,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error).toMatchObject({
      code: "UPSTREAM",
      debug: {
        aborted: true,
        timeout: false,
      },
    });
    expect(response.meta?.fallback?.nextRetryAt).toBeUndefined();
    expect(shouldCooldown(sourceKey)).toEqual({ cooldown: false });
  });
});
