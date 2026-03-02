import { describe, expect, it } from "vitest";
import { isMigrationRequired } from "../../../src/lib/planning/migrations/requirement";

describe("isMigrationRequired", () => {
  it("returns true when pending is greater than zero", () => {
    expect(isMigrationRequired({ summary: { pending: 1, failed: 0 } })).toBe(true);
  });

  it("returns true when failed is greater than zero", () => {
    expect(isMigrationRequired({ summary: { pending: 0, failed: 2 } })).toBe(true);
  });

  it("returns false when pending and failed are zero", () => {
    expect(isMigrationRequired({ summary: { pending: 0, failed: 0 } })).toBe(false);
  });
});

