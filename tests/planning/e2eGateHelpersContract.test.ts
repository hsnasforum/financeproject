import fs from "node:fs";
import { describe, expect, it } from "vitest";

const HELPER_FILE = "tests/e2e/helpers/planningGateHelpers.ts";

describe("planning e2e gate helpers", () => {
  it("uses the POST doctor action contract for migration readiness", () => {
    const source = fs.readFileSync(HELPER_FILE, "utf8");

    expect(source).toContain('request.post("/api/ops/doctor"');
    expect(source).toContain('action: "RUN_MIGRATIONS"');
    expect(source).not.toContain("/api/ops/doctor?action=RUN_MIGRATIONS");
  });
});
