import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));

function readCurrentScreens(): string {
  return readFileSync(currentScreensPath, "utf8");
}

describe("current screens SSOT for support and settings routes", () => {
  it("keeps public feedback submission separate from local management routes", () => {
    const markdown = readCurrentScreens();
    const publicSection = markdown.split("## Public 화면")[1]?.split("\n## ")[0] ?? "";

    expect(publicSection).toContain("- `/feedback`");
    expect(publicSection).not.toContain("- `/feedback/list`");
    expect(publicSection).not.toContain("- `/feedback/[id]`");
    expect(publicSection).toContain("- `/planning/trash`");
    expect(publicSection).toContain("- `/planning/runs/[id]`");
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
