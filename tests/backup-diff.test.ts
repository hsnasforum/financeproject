import { describe, expect, it } from "vitest";
import { diffServerFiles, summarizeContent } from "../src/lib/backup/backupDiff";

describe("backup diff", () => {
  it("summarizes content hash and size", () => {
    const summary = summarizeContent("{\"ok\":true}");
    expect(summary.exists).toBe(true);
    expect(summary.size).toBe(11);
    expect(summary.hash.length).toBeGreaterThan(0);

    const empty = summarizeContent(null);
    expect(empty).toEqual({ exists: false, size: 0, hash: "" });
  });

  it("classifies same/changed/added/missing correctly", () => {
    const current = {
      "tmp/user_feedback.json": "[1,2,3]",
      "tmp/daily_refresh_result.json": "{\"today\":1}",
      "tmp/dart/disclosure_state.json": "{\"state\":\"on\"}",
    };
    const incoming = {
      "tmp/user_feedback.json": "[1,2,3]",
      "tmp/daily_refresh_result.json": "{\"today\":2}",
      "tmp/dart/disclosure_state.json": null,
      "tmp/dart/new_file.json": "{\"new\":true}",
    };

    const result = diffServerFiles(current, incoming);

    expect(result.same.map((item) => item.path)).toEqual(["tmp/user_feedback.json"]);
    expect(result.changed.map((item) => item.path)).toEqual(["tmp/daily_refresh_result.json"]);
    expect(result.missing.map((item) => item.path)).toEqual(["tmp/dart/disclosure_state.json"]);
    expect(result.added.map((item) => item.path)).toEqual(["tmp/dart/new_file.json"]);
  });

  it("ignores non-whitelisted paths", () => {
    const result = diffServerFiles(
      {
        "tmp/not_allowed.json": "{\"a\":1}",
        "tmp/user_feedback.json": "[]",
      },
      {
        "tmp/not_allowed.json": "{\"a\":2}",
        "tmp/user_feedback.json": "[]",
      },
    );

    expect(result.changed).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.same.map((item) => item.path)).toEqual(["tmp/user_feedback.json"]);
  });
});
