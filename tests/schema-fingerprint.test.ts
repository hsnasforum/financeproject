import { describe, expect, it } from "vitest";
import { createSchemaFingerprint } from "../src/lib/dataQuality/schemaFingerprint";

describe("schema fingerprint", () => {
  it("is deterministic and path-sorted", () => {
    const input = {
      z: true,
      a: {
        k2: 1,
        k1: "x",
      },
    };

    const first = createSchemaFingerprint(input);
    const second = createSchemaFingerprint(input);

    expect(first).toEqual(second);
    expect(first.entries.map((entry) => entry.path)).toEqual([
      "$",
      "$.a",
      "$.a.k1",
      "$.a.k2",
      "$.z",
    ]);
  });

  it("respects array sampling and depth limit", () => {
    const input = {
      rows: [
        { value: "alpha" },
        { value: 42, extra: true },
      ],
    };

    const sampleOne = createSchemaFingerprint(input, { arraySampleSize: 1, maxDepth: 8 });
    const sampleTwo = createSchemaFingerprint(input, { arraySampleSize: 2, maxDepth: 8 });
    const shallow = createSchemaFingerprint(input, { arraySampleSize: 2, maxDepth: 2 });

    const sampleOneValue = sampleOne.entries.find((entry) => entry.path === "$.rows[].value");
    const sampleTwoValue = sampleTwo.entries.find((entry) => entry.path === "$.rows[].value");

    expect(sampleOneValue?.types).toEqual(["string"]);
    expect(sampleTwoValue?.types).toEqual(["number", "string"]);
    expect(shallow.entries.some((entry) => entry.path === "$.rows[].value")).toBe(false);
  });
});
