import { describe, expect, it } from "vitest";
import { shouldRunGov24Sync } from "../src/lib/gov24/syncPolicy";

describe("gov24 sync if-stale policy", () => {
  it("runs when snapshot is missing", () => {
    const now = Date.now();
    const result = shouldRunGov24Sync(null, now);
    expect(result.shouldRun).toBe(true);
    expect(result.reason).toBe("missing_snapshot");
  });

  it("runs when snapshot is older than 24h", () => {
    const now = Date.now();
    const old = new Date(now - (25 * 60 * 60 * 1000)).toISOString();
    const result = shouldRunGov24Sync({ generatedAt: old, completionRate: 0.98 }, now);
    expect(result.shouldRun).toBe(true);
    expect(result.reason).toBe("stale_snapshot");
  });

  it("skips when snapshot is fresh and completionRate is high", () => {
    const now = Date.now();
    const fresh = new Date(now - (60 * 60 * 1000)).toISOString();
    const result = shouldRunGov24Sync({ generatedAt: fresh, completionRate: 0.98 }, now);
    expect(result.shouldRun).toBe(false);
    expect(result.reason).toBe("fresh");
  });
});

