import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runDesktopSmokeCleanup } from "../../../scripts/planning_v2_desktop_smoke.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("planning desktop smoke cleanup", () => {
  it("removes the smoke root even when process cleanup steps fail", async () => {
    const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-cleanup-"));
    const leasePath = path.join(smokeRoot, "runtime", "writer-lease.json");
    await fs.mkdir(path.dirname(leasePath), { recursive: true });
    await fs.writeFile(leasePath, "{}\n", "utf8");

    await expect(runDesktopSmokeCleanup({
      stop: async () => { throw new Error("stop failed"); },
      wait: async () => { throw new Error("wait failed"); },
      leasePath,
      smokeRoot,
    })).rejects.toThrow("desktop smoke cleanup failed");
    await expect(fs.access(smokeRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes a newly allocated smoke root when database preparation fails", async () => {
    const tempParent = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-prepare-failure-"));
    cleanupRoots.push(tempParent);
    const missingApp = path.join(tempParent, "missing-app");
    const result = spawnSync(process.execPath, [
      "scripts/planning_v2_desktop_smoke.mjs",
      `--app-dir=${missingApp}`,
      "--timeout-ms=5000",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TMPDIR: tempParent,
        TMP: tempParent,
        TEMP: tempParent,
      },
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).not.toBe(0);
    expect((await fs.readdir(tempParent)).filter((name) => name.startsWith("planning-desktop-smoke-")))
      .toEqual([]);
  });
});
