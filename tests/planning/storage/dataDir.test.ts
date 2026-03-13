import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataDir, resolveOpsDataDir, resolvePlanningDataDir } from "../../../src/lib/planning/storage/dataDir";

const env = process.env as Record<string, string | undefined>;
const originalEnv = { ...process.env };

describe("planning dataDir resolver", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  });

  it("uses repo-local .data in dev mode", () => {
    env.NODE_ENV = "development";
    delete env.PLANNING_DATA_DIR;
    const cwd = "/tmp/planning-dev";
    const resolved = resolveDataDir({ cwd });
    expect(resolved).toBe(path.resolve(cwd, ".data"));
    expect(resolvePlanningDataDir({ cwd })).toBe(path.resolve(cwd, ".data", "planning"));
    expect(resolveOpsDataDir({ cwd })).toBe(path.resolve(cwd, ".data", "planning", "ops"));
  });

  it("uses LOCALAPPDATA in production windows mode", () => {
    const cwd = "/tmp/planning-dev";
    env.NODE_ENV = "production";
    env.LOCALAPPDATA = "C:\\Users\\tester\\AppData\\Local";
    env.PLANNING_APP_NAME = "Planning V2";
    const resolved = resolveDataDir({ cwd, platform: "win32" });
    const planningDir = path.resolve("C:\\Users\\tester\\AppData\\Local", "Planning V2", "vault");
    expect(resolvePlanningDataDir({ cwd, platform: "win32" })).toBe(planningDir);
    expect(resolved).toBe(path.dirname(planningDir));
  });

  it("supports explicit PLANNING_DATA_DIR override", () => {
    env.PLANNING_DATA_DIR = path.join(os.tmpdir(), "planning-data");
    const planningDir = resolvePlanningDataDir({ cwd: "/tmp/any" });
    expect(planningDir).toBe(path.resolve(env.PLANNING_DATA_DIR ?? ""));
    expect(resolveDataDir({ cwd: "/tmp/any" })).toBe(path.dirname(planningDir));
  });
});
