import { describe, expect, it } from "vitest";
import { findRedactionIssues, hasRedactionIssue } from "../../../src/lib/planning/smoke/redactionCheck";

describe("planning smoke redactionCheck", () => {
  it("returns no issue for normal payload", () => {
    const payload = {
      ok: true,
      meta: {
        snapshot: {
          asOf: "2026-02-28",
          missing: false,
        },
      },
      data: {
        summary: {
          warningsCount: 0,
        },
      },
    };

    expect(findRedactionIssues(payload)).toEqual([]);
    expect(hasRedactionIssue(payload)).toBe(false);
  });

  it("detects internal path/token leaks", () => {
    const payload = {
      ok: true,
      debug: ".data/planning/assumptions.latest.json",
      tokenHint: "GITHUB_TOKEN_DISPATCH",
      auth: "Bearer abc",
    };

    const issues = findRedactionIssues(payload);
    expect(issues.map((entry) => entry.code).sort()).toEqual(["BEARER", "GITHUB_TOKEN", "INTERNAL_PATH"]);
    expect(hasRedactionIssue(payload)).toBe(true);
  });
});
