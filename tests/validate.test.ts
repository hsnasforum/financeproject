import { describe, expect, it } from "vitest";
import {
  createValidationBag,
  parseArrayValue,
  parseEnum,
  parseIntValue,
  parseNumberValue,
  parseStringValue,
} from "../src/lib/http/validate";

describe("validate helpers", () => {
  it("uses fallback and collects issue for invalid enum", () => {
    const bag = createValidationBag();
    const value = parseEnum(bag, {
      path: "kind",
      value: "loan",
      allowed: ["deposit", "saving"] as const,
      fallback: "deposit",
    });

    expect(value).toBe("deposit");
    expect(bag.issues).toEqual(["kind must be one of deposit|saving"]);
  });

  it("supports int fallback and clamp behavior", () => {
    const strictBag = createValidationBag();
    const strict = parseIntValue(strictBag, {
      path: "limit",
      value: "9999",
      fallback: 200,
      min: 1,
      max: 1000,
    });
    expect(strict).toBe(200);
    expect(strictBag.issues).toEqual(["limit must be between 1 and 1000"]);

    const clampBag = createValidationBag();
    const clamped = parseIntValue(clampBag, {
      path: "limit",
      value: "9999",
      fallback: 200,
      min: 1,
      max: 1000,
      clamp: true,
    });
    expect(clamped).toBe(1000);
    expect(clampBag.issues).toEqual([]);
  });

  it("parses number/string/array with fallback", () => {
    const bag = createValidationBag();
    const n = parseNumberValue(bag, {
      path: "rate",
      value: "3.5",
      fallback: 0,
      min: 0,
      max: 10,
    });
    const s = parseStringValue(bag, {
      path: "q",
      value: "  hello  ",
      fallback: "",
    });
    const a = parseArrayValue<string>(bag, {
      path: "items",
      value: "not-array",
      fallback: [],
    });

    expect(n).toBe(3.5);
    expect(s).toBe("hello");
    expect(a).toEqual([]);
    expect(bag.issues).toEqual(["items must be an array"]);
  });
});
