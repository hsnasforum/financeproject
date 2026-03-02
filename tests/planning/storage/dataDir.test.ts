import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataDir, resolveOpsDataDir, resolvePlanningDataDir } from "../../../src/lib/planning/storage/dataDir";

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
    delete process.env.PLANNING_PACKAGED_MODE;
    delete process.env.PLANNING_RUNTIME_MODE;
    delete process.env.PLANNING_DATA_DIR;
    const cwd = "/tmp/planning-dev";
    const resolved = resolveDataDir({ cwd });
    expect(resolved).toBe(path.resolve(cwd, ".data"));
    expect(resolvePlanningDataDir({ cwd })).toBe(path.join(resolved, "planning"));
    expect(resolveOpsDataDir({ cwd })).toBe(path.join(resolved, "ops"));
  });

  it("uses LOCALAPPDATA in packaged windows mode", () => {
    const cwd = "/tmp/planning-dev";
    process.env.PLANNING_PACKAGED_MODE = "1";
    process.env.LOCALAPPDATA = "C:\\Users\\tester\\AppData\\Local";
    process.env.PLANNING_APP_NAME = "Planning V2";
    const resolved = resolveDataDir({ cwd, platform: "win32" });
    expect(resolved).toBe(path.resolve("C:\\Users\\tester\\AppData\\Local", "Planning V2"));
  });

  it("supports explicit PLANNING_DATA_DIR override", () => {
    process.env.PLANNING_DATA_DIR = path.join(os.tmpdir(), "planning-data");
    const resolved = resolveDataDir({ cwd: "/tmp/any" });
    expect(resolved).toBe(path.resolve(process.env.PLANNING_DATA_DIR));
  });
});
