import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readJson(file: string): Promise<{ scripts: Record<string, string> }> {
  return JSON.parse(await fs.readFile(file, "utf8")) as { scripts: Record<string, string> };
}

describe("official desktop start path", () => {
  it("lets `pnpm start` hand the one-shot session URL to the default browser, as the user guide says", async () => {
    const { scripts } = await readJson("package.json");
    expect(scripts.start).toBe("node scripts/planning_v2_desktop_launch.mjs --runtime prod");
    expect(scripts.start).not.toContain("--no-open");

    const guide = await fs.readFile("USER_GUIDE.md", "utf8");
    expect(guide).toContain("`pnpm start`");
    expect(guide).toMatch(/기본 브라우저가\s*\n?\s*자동으로 열/);
  });

  it("keeps automation launches explicitly headless instead of relying on `pnpm start`", async () => {
    for (const [file, marker] of [
      ["playwright.config.ts", "planning_v2_desktop_launch.mjs --runtime prod --port ${PORT} --no-open"],
      ["scripts/planning_v2_desktop_smoke.mjs", "\"--no-open\""],
      ["scripts/planning_v2_prod_smoke.mjs", "\"--no-open\""],
    ] as const) {
      expect(await fs.readFile(file, "utf8"), file).toContain(marker);
    }
    const workflows = await fs.readdir(".github/workflows");
    for (const workflow of workflows) {
      const text = await fs.readFile(`.github/workflows/${workflow}`, "utf8");
      expect(text, workflow).not.toMatch(/pnpm (run )?start(\s|$)/m);
    }
  });

  it("never prints the bootstrap URL when the browser open is skipped", async () => {
    const launcher = await fs.readFile("scripts/planning_v2_desktop_launch.mjs", "utf8");
    expect(launcher).not.toMatch(/stdout\.write\([^)]*bootstrapUrl/);
    expect(launcher).toContain("await openInDefaultBrowser(bootstrapUrl)");
  });
});
