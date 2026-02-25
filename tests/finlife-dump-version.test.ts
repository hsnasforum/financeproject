import { describe, expect, it } from "vitest";
import { detectSchemaVersion, parseFinlifeDumpPayload } from "../scripts/finlife_dump_utils.mjs";

describe("finlife dump schemaVersion", () => {
  it("treats missing schemaVersion as v1", () => {
    expect(detectSchemaVersion({ meta: {}, products: [] })).toBe(1);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() => parseFinlifeDumpPayload({ schemaVersion: 999, meta: {}, products: [] })).toThrow(
      /Unsupported finlife dump schemaVersion=999/,
    );
  });
});

