import { describe, expect, it } from "vitest";
import { shouldRunFinlifeSync } from "../src/lib/finlife/syncPolicy";

describe("finlife snapshot policy", () => {
  it("skips sync when snapshot is fresh and completion rate is sufficient", () => {
    const now = Date.UTC(2026, 1, 21, 12, 0, 0);
    const generatedAt = new Date(now - 60 * 60 * 1000).toISOString();

    const decision = shouldRunFinlifeSync(
      { generatedAt, completionRate: 0.97 },
      now,
      { ttlMs: 12 * 60 * 60 * 1000, minCompletionRate: 0.95 },
    );

    expect(decision).toEqual({ shouldRun: false, reason: "fresh" });
  });

  it("runs sync when stale or completion rate is low", () => {
    const now = Date.UTC(2026, 1, 21, 12, 0, 0);
    const staleAt = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    const lowAt = new Date(now - 60 * 60 * 1000).toISOString();

    const staleDecision = shouldRunFinlifeSync(
      { generatedAt: staleAt, completionRate: 0.99 },
      now,
      { ttlMs: 12 * 60 * 60 * 1000, minCompletionRate: 0.95 },
    );
    const lowDecision = shouldRunFinlifeSync(
      { generatedAt: lowAt, completionRate: 0.7 },
      now,
      { ttlMs: 12 * 60 * 60 * 1000, minCompletionRate: 0.95 },
    );

    expect(staleDecision.shouldRun).toBe(true);
    expect(staleDecision.reason).toBe("stale_snapshot");
    expect(lowDecision.shouldRun).toBe(true);
    expect(lowDecision.reason).toBe("low_completion_rate");
  });
});
