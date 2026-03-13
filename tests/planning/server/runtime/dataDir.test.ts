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
      cwd: "/workspace/app",
      platform: "win32",
      env: {
        NODE_ENV: "production",
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
        PLANNING_APP_NAME: "Finance Planner",
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(resolved).toBe(path.resolve("C:\\Users\\tester\\AppData\\Local", "Finance Planner", "vault"));
  });
});
