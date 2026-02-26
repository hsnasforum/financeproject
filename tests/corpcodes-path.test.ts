import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCorpCodesIndexPath } from "../src/lib/publicApis/dart/corpIndex";

describe("resolveCorpCodesIndexPath", () => {
  it("uses env path as primary when provided", () => {
    const root = "/repo";
    const resolved = resolveCorpCodesIndexPath(root, "./custom/corpCodes.json");

    expect(resolved.primary).toBe(path.resolve(root, "./custom/corpCodes.json"));
    expect(resolved.tried).toEqual([
      path.resolve(root, "./custom/corpCodes.json"),
      path.join(root, "tmp", "dart", "corpCodes.index.json"),
      path.join(root, "src", "data", "dart", "corpCodes.json"),
    ]);
  });

  it("uses tmp default then legacy fallback when env is missing", () => {
    const root = "/repo";
    const resolved = resolveCorpCodesIndexPath(root, "");

    expect(resolved.primary).toBe(path.join(root, "tmp", "dart", "corpCodes.index.json"));
    expect(resolved.tried).toEqual([
      path.join(root, "tmp", "dart", "corpCodes.index.json"),
      path.join(root, "src", "data", "dart", "corpCodes.json"),
    ]);
  });
});
