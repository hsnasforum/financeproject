import { describe, expect, it } from "vitest";
import { attachFallback } from "../src/lib/http/fallbackMeta";

describe("fallback meta", () => {
  it("attaches fallback into existing meta", () => {
    const meta = attachFallback(
      { generatedAt: "2026-02-25T00:00:00.000Z", source: "snapshot" },
      {
        mode: "REPLAY",
        sourceKey: "finlife",
        reason: "missing_api_key_replay",
        generatedAt: "2026-02-24T00:00:00.000Z",
      },
    );

    expect(meta.source).toBe("snapshot");
    expect(meta.fallback.mode).toBe("REPLAY");
    expect(meta.fallback.sourceKey).toBe("finlife");
  });

  it("creates meta object when base meta is empty", () => {
    const meta = attachFallback(undefined, {
      mode: "CACHE",
      sourceKey: "exchange",
      reason: "cooldown_cache_hit",
    });

    expect(meta.fallback.mode).toBe("CACHE");
    expect(meta.fallback.reason).toBe("cooldown_cache_hit");
  });
});
