import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));

function readCurrentScreens(): string {
  return readFileSync(currentScreensPath, "utf8");
}

describe("current screens SSOT for planning report routes", () => {
  it("documents the official planning run and report routes", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("- `/planning/runs`");
    expect(markdown).toContain("- `/planning/reports`");
    expect(markdown).toContain("- `/planning/reports/[id]`");
  });

  it("keeps the legacy report route explicitly separated", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("- `/report`");
    expect(markdown).toContain("legacy");
    expect(markdown).toContain("공식 planning report");
    expect(markdown).toContain("permanentRedirect");
  });
});
