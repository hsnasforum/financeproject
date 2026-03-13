import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));

function readCurrentScreens(): string {
  return readFileSync(currentScreensPath, "utf8");
}

describe("current screens SSOT for support and settings routes", () => {
  it("documents public support routes used by dashboard and feedback flows", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("- `/feedback`");
    expect(markdown).toContain("- `/feedback/list`");
    expect(markdown).toContain("- `/feedback/[id]`");
    expect(markdown).toContain("- `/planning/trash`");
    expect(markdown).toContain("- `/planning/runs/[id]`");
  });

  it("documents settings routes used by settings and recovery flows", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("- `/settings`");
    expect(markdown).toContain("- `/settings/backup`");
    expect(markdown).toContain("- `/settings/recovery`");
    expect(markdown).toContain("- `/settings/maintenance`");
    expect(markdown).toContain("- `/settings/data-sources`");
  });
});
