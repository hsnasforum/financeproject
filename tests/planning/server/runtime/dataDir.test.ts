import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlanningDataDir } from "../../../../src/lib/planning/server/runtime/dataDir";

describe("resolvePlanningDataDir", () => {
  it("prefers PLANNING_DATA_DIR override", () => {
    const resolved = resolvePlanningDataDir({
      cwd: "/workspace/app",
      env: {
        PLANNING_DATA_DIR: "custom-data/planning",
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(resolved).toBe(path.resolve("/workspace/app", "custom-data/planning"));
  });

  it("uses repo-local path in dev mode", () => {
    const resolved = resolvePlanningDataDir({
      cwd: "/workspace/app",
      env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
    });
    expect(resolved).toBe(path.resolve("/workspace/app", ".data", "planning"));
  });

  it("uses LOCALAPPDATA app vault path in production windows mode", () => {
    const resolved = resolvePlanningDataDir({
      cwd: "C:\\workspace\\app",
      platform: "win32",
      env: {
        NODE_ENV: "production",
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
        PLANNING_APP_NAME: "Finance Planner",
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(resolved).toBe(path.win32.resolve("C:\\Users\\tester\\AppData\\Local", "Finance Planner", "vault"));
  });

  it("fails closed when the legacy packaged macOS server vault exists", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-macos-home-"));
    try {
      const legacyRoot = path.join(homeDir, ".local", "share", "PlanningV2", "vault");
      fs.mkdirSync(legacyRoot, { recursive: true });
      expect(() => resolvePlanningDataDir({
        cwd: "/workspace/app",
        env: { NODE_ENV: "production", PLANNING_PACKAGED_MODE: "true" } as NodeJS.ProcessEnv,
        platform: "darwin",
        homeDir,
      })).toThrowError(/PATH_MIGRATION_REQUIRED:/u);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
import fs from "node:fs";
import os from "node:os";
