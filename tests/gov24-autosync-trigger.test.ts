import { describe, expect, it } from "vitest";
import { shouldTriggerGov24AutoSync } from "../src/lib/publicApis/gov24AutoSync";

describe("gov24 autosync trigger", () => {
  it("returns true when snapshot is missing or incomplete", () => {
    expect(shouldTriggerGov24AutoSync(null)).toBe(true);
    expect(shouldTriggerGov24AutoSync({ totalItems: 0, completionRate: 1 })).toBe(true);
    expect(shouldTriggerGov24AutoSync({ totalItems: 1000, completionRate: 0.94 })).toBe(true);
  });

  it("returns false when completionRate is sufficient", () => {
    expect(shouldTriggerGov24AutoSync({ totalItems: 1000, completionRate: 0.95 })).toBe(false);
    expect(shouldTriggerGov24AutoSync({ totalItems: 1000, completionRate: 0.99 })).toBe(false);
  });
});

