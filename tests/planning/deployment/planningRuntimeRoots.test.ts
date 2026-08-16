import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlanningLegacyServerProductionRoot, resolvePlanningRuntimeRoots, sanitizePlanningAppName } from "../../../src/lib/planning/storage/runtimeRoots.mjs";
import { resolvePlanningDataDir } from "../../../src/lib/planning/server/runtime/dataDir";
import { resolveDataDir } from "../../../src/lib/planning/storage/dataDir";
import { resolveRuntimeLockPath as resolveDesktopLockPath } from "../../../scripts/planning_v2_desktop_launch.mjs";
import { resolveRuntimeLockPath as resolveStartLocalLockPath } from "../../../scripts/start_local_lock.mjs";

describe("canonical Planning runtime roots", () => {
  it("preserves development roots and existing lock locations", () => {
    const input = { cwd: "/workspace/app", env: { NODE_ENV: "development" } as NodeJS.ProcessEnv, platform: "linux" as const, homeDir: "/home/tester" };
    const roots = resolvePlanningRuntimeRoots(input);
    expect(roots).toEqual({
      mode: "development",
      planningRoot: path.resolve(input.cwd, ".data/planning"),
      runtimeRoot: path.resolve(input.cwd, ".data"),
      controlRoot: path.resolve(input.cwd, ".data/runtime"),
    });
    expect(resolveStartLocalLockPath(input)).toBe(path.join(roots.planningRoot, "runtime.lock"));
    expect(resolveDesktopLockPath(input.cwd, input.env, input.platform, input.homeDir))
      .toBe(path.join(roots.controlRoot, "desktop-instance.lock.json"));
  });

  it.each([
    ["linux", "/workspace/app", "/home/tester", "/workspace/app/.data/planning"],
    ["darwin", "/workspace/app", "/Users/tester", "/workspace/app/.data/planning"],
    ["win32", "C:\\workspace\\app", "C:\\Users\\tester", "C:\\workspace\\app\\.data\\planning"],
  ] as const)("uses the injected %s path model for development", (platform, cwd, homeDir, expected) => {
    expect(resolvePlanningRuntimeRoots({ cwd, env: {}, platform, homeDir }).planningRoot).toBe(expected);
  });

  it("preserves explicit PLANNING_DATA_DIR meanings", () => {
    const input = { cwd: "/workspace/app", env: { PLANNING_DATA_DIR: "custom/planning" } as unknown as NodeJS.ProcessEnv, platform: "linux" as const, homeDir: "/home/tester" };
    const roots = resolvePlanningRuntimeRoots(input);
    expect(roots.planningRoot).toBe(path.resolve(input.cwd, "custom/planning"));
    expect(roots.runtimeRoot).toBe(path.resolve(input.cwd, "custom"));
    expect(roots.controlRoot).toBe(path.resolve(input.cwd, "custom/planning/runtime"));
    expect(resolvePlanningDataDir(input)).toBe(roots.planningRoot);
    expect(resolveDataDir(input)).toBe(roots.runtimeRoot);
  });

  it.each([
    ["linux", "/home/tester/.local/share/Finance-Planner/vault"],
    ["darwin", "/home/tester/Library/Application Support/Finance-Planner/vault"],
  ] as const)("preserves packaged %s root policy", (platform, expected) => {
    const input = {
      cwd: "/workspace/app",
      env: { PLANNING_PACKAGED_MODE: "true", PLANNING_APP_NAME: "Finance/Planner" },
      platform,
      homeDir: "/home/tester",
    };
    const roots = resolvePlanningRuntimeRoots(input);
    expect(roots.mode).toBe("packaged");
    expect(roots.planningRoot).toBe(path.resolve(expected));
    if (platform === "darwin") {
      expect(resolvePlanningLegacyServerProductionRoot(input)).toBe("/home/tester/.local/share/Finance-Planner/vault");
    }
  });

  it("preserves production Windows vault policy and app-name sanitization", () => {
    const input = {
      cwd: "C:\\workspace\\app",
      env: { NODE_ENV: "production", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local", PLANNING_APP_NAME: "Finance:Planner" },
      platform: "win32" as const,
      homeDir: "C:\\Users\\tester",
    };
    const roots = resolvePlanningRuntimeRoots(input);
    expect(roots.planningRoot).toBe(path.win32.resolve(input.env.LOCALAPPDATA, "Finance-Planner", "vault"));
    expect(sanitizePlanningAppName("<>:\"/\\|?*")).toBe("---------");
    expect(sanitizePlanningAppName("   ")).toBe("PlanningV2");
    expect(sanitizePlanningAppName("..")).toBe("PlanningV2");
  });

  it.each([
    ["LOCALAPPDATA", { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" }, "C:\\Users\\tester\\AppData\\Local\\PlanningV2\\vault"],
    ["APPDATA", { APPDATA: "C:\\Users\\tester\\AppData\\Roaming" }, "C:\\Users\\tester\\AppData\\Roaming\\PlanningV2\\vault"],
  ] as const)("preserves packaged Windows %s fallback order", (_label, baseEnv, expected) => {
    const input = {
      cwd: "C:\\workspace\\app",
      env: { ...baseEnv, PLANNING_PACKAGED_MODE: "true" } as unknown as NodeJS.ProcessEnv,
      platform: "win32" as const,
      homeDir: "C:\\Users\\tester",
    };
    const roots = resolvePlanningRuntimeRoots(input);
    expect(roots.planningRoot).toBe(expected);
    expect(resolveStartLocalLockPath(input)).toBe(path.win32.join(roots.planningRoot, "runtime.lock"));
    expect(resolveDesktopLockPath(input.cwd, input.env, input.platform, input.homeDir))
      .toBe(path.win32.join(roots.controlRoot, "desktop-instance.lock.json"));
  });

  it("preserves Windows drive and UNC explicit roots", () => {
    expect(resolvePlanningRuntimeRoots({
      cwd: "C:\\workspace\\app",
      env: { PLANNING_DATA_DIR: "D:\\Finance\\Planning" },
      platform: "win32",
      homeDir: "C:\\Users\\tester",
    }).planningRoot).toBe("D:\\Finance\\Planning");
    expect(resolvePlanningRuntimeRoots({
      cwd: "C:\\workspace\\app",
      env: { PLANNING_DATA_DIR: "\\\\server\\share\\Planning" },
      platform: "win32",
      homeDir: "C:\\Users\\tester",
    }).planningRoot).toBe("\\\\server\\share\\Planning");
  });

  it("does not read process.env and keeps packaged control state outside the vault root", () => {
    const previous = process.env.PLANNING_DATA_DIR;
    process.env.PLANNING_DATA_DIR = "/unexpected/global";
    try {
      const roots = resolvePlanningRuntimeRoots({
        cwd: "/workspace/app",
        env: { PLANNING_PACKAGED_MODE: "true" },
        platform: "linux",
        homeDir: "/home/tester",
      });
      expect(roots.planningRoot).toBe("/home/tester/.local/share/PlanningV2/vault");
      expect(path.relative(roots.planningRoot, roots.controlRoot)).toMatch(/^\.\./u);
    } finally {
      if (previous === undefined) delete process.env.PLANNING_DATA_DIR;
      else process.env.PLANNING_DATA_DIR = previous;
    }
  });

  it("is deterministic, immutable, and does not mutate injected facts", () => {
    const env = { NODE_ENV: "development" };
    const input = { cwd: "/workspace/app", env, platform: "linux" as const, homeDir: "/home/tester" };
    const first = resolvePlanningRuntimeRoots(input);
    env.NODE_ENV = "production";
    expect(first.mode).toBe("development");
    expect(Object.isFrozen(first)).toBe(true);
    expect(resolvePlanningRuntimeRoots({ ...input, env: { NODE_ENV: "development" } })).toEqual(first);
  });
});
