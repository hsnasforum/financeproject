import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanObjectForForbiddenKeysAndStrings } from "../src/lib/sources/dumpSafety";

describe("dump safety guard", () => {
  it("detects forbidden key", () => {
    const violations = scanObjectForForbiddenKeysAndStrings({ auth: "SECRET" });
    expect(violations.some((v) => v.type === "key" && v.rule === "auth")).toBe(true);
  });

  it("detects forbidden string pattern", () => {
    const violations = scanObjectForForbiddenKeysAndStrings({
      meta: { note: "see apis.data.go.kr docs" },
    });
    expect(violations.some((v) => v.type === "string" && v.rule === "apis.data.go.kr")).toBe(true);
  });

  it("passes current finlife fixture", () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "finlife_deposit.normalized.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const violations = scanObjectForForbiddenKeysAndStrings(fixture);
    expect(violations.length).toBe(0);
  });
});

