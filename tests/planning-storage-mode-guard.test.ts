import { describe, expect, it } from "vitest";
import {
  assertPlanningStorageMode,
  resolvePlanningStorageMode,
} from "../scripts/planning_storage_mode_guard.mjs";

describe("planning storage mode guard", () => {
  it("does not require explicit storage mode outside production", () => {
    expect(resolvePlanningStorageMode({ NODE_ENV: "test" })).toEqual({
      ok: true,
      mode: "non-production",
    });
  });

  it("allows production namespace mode for multi-user storage", () => {
    expect(resolvePlanningStorageMode({
      NODE_ENV: "production",
      PLANNING_NAMESPACE_ENABLED: "true",
      PLANNING_SINGLE_USER_MODE: "0",
    })).toEqual({
      ok: true,
      mode: "multi-user-namespace",
    });
  });

  it("allows production single-user mode for explicit desktop/local topology", () => {
    expect(resolvePlanningStorageMode({
      NODE_ENV: "production",
      PLANNING_NAMESPACE_ENABLED: "0",
      PLANNING_SINGLE_USER_MODE: "1",
    })).toEqual({
      ok: true,
      mode: "single-user",
    });
  });

  it("blocks production startup when storage topology is implicit", () => {
    const env = {
      NODE_ENV: "production",
      PLANNING_NAMESPACE_ENABLED: "0",
      PLANNING_SINGLE_USER_MODE: "0",
    };

    expect(resolvePlanningStorageMode(env)).toMatchObject({
      ok: false,
      mode: "invalid",
    });
    expect(() => assertPlanningStorageMode(env)).toThrow("invalid planning storage mode");
  });
});
