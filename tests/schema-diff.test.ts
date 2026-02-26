import { describe, expect, it } from "vitest";
import { diffSchemaFingerprint } from "../src/lib/dataQuality/schemaDiff";
import { createSchemaFingerprint } from "../src/lib/dataQuality/schemaFingerprint";

describe("schema diff", () => {
  it("classifies removed/type-changed as breaking and added as non-breaking", () => {
    const baseline = createSchemaFingerprint({
      a: 1,
      b: { c: "ok" },
      meta: { generatedAt: "2026-02-25T00:00:00.000Z" },
    });

    const current = createSchemaFingerprint({
      a: "1",
      b: { d: true },
      e: [1],
      meta: { generatedAt: "2026-02-25T01:00:00.000Z" },
    });

    const diff = diffSchemaFingerprint(baseline, current, {
      ignorePaths: ["$.meta.generatedAt"],
    });

    const breakingPaths = diff.breaking.map((item) => `${item.change}:${item.path}`);
    const nonBreakingPaths = diff.nonBreaking.map((item) => `${item.change}:${item.path}`);

    expect(breakingPaths).toContain("type_changed:$.a");
    expect(breakingPaths).toContain("removed:$.b.c");
    expect(nonBreakingPaths).toContain("added:$.b.d");
    expect(nonBreakingPaths).toContain("added:$.e");
    expect(nonBreakingPaths).toContain("added:$.e[]");
  });

  it("supports glob-style ignore paths", () => {
    const baseline = createSchemaFingerprint({
      meta: {
        generatedAt: "old",
        lastSyncedAt: "old",
      },
    });

    const current = createSchemaFingerprint({
      meta: {
        generatedAt: 1,
        lastSyncedAt: 2,
      },
    });

    const diff = diffSchemaFingerprint(baseline, current, {
      ignorePaths: ["$.meta.*"],
    });

    expect(diff.breaking).toEqual([]);
    expect(diff.nonBreaking).toEqual([]);
  });
});
