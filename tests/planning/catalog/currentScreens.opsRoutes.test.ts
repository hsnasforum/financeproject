import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));

function readCurrentScreens(): string {
  return readFileSync(currentScreensPath, "utf8");
}

describe("current screens SSOT for ops routes", () => {
  it("documents local-only ops routes used by internal navigation", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("## Ops/Admin 화면");
    expect(markdown).toContain("- `/ops`");
    expect(markdown).toContain("- `/ops/doctor`");
    expect(markdown).toContain("- `/ops/security`");
    expect(markdown).toContain("- `/ops/assumptions`");
    expect(markdown).toContain("- `/ops/metrics`");
  });

  it("keeps ops routes separated from the public route rule", () => {
    const markdown = readCurrentScreens();

    expect(markdown).toContain("local-only");
    expect(markdown).toContain("packaged runtime");
    expect(markdown).toContain("Ops 계열 경로(`/ops/*`)");
  });
});
