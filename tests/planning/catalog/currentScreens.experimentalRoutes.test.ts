import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));

function readCurrentScreens(): string {
  return readFileSync(currentScreensPath, "utf8");
}

describe("current screens SSOT for legacy, prototype, and v3 routes", () => {
  it("documents legacy redirect and prototype routes separately", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("## Legacy/Redirect 화면");
    expect(markdown).toContain("- `/planner`");
    expect(markdown).toContain("- `/planner/[...slug]`");
    expect(markdown).toContain("## Prototype/Preview 화면");
    expect(markdown).toContain("- `/planning/reports/prototype`");
    expect(markdown).toContain("preview=1");
  });

  it("documents experimental planning v3 routes and debug planning page", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("## Planning v3 화면");
    expect(markdown).toContain("- `/planning/v3/start`");
    expect(markdown).toContain("- `/planning/v3/drafts`");
    expect(markdown).toContain("- `/planning/v3/profile/drafts/[id]/preflight`");
    expect(markdown).toContain("- `/planning/v3/news/settings`");
    expect(markdown).toContain("- `/debug/planning-v2`");
  });
});
