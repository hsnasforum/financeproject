import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("planning v2 static guard", () => {
  it("reports v3 user-facing transaction route scans", () => {
    const output = execFileSync("node", ["scripts/planning_v2_static_guard.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(output).toContain("v3UserFacingTransactionRouteFiles=");
  });

  it("keeps draft apply user-facing route off legacy transactionStore", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/planning/v3/draft/apply/route.ts"),
      "utf8",
    );

    expect(routeSource).not.toContain("/planning/v3/service/transactionStore");
  });
});
