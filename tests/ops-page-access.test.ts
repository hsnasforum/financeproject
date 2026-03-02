import { describe, expect, it } from "vitest";
import { isPackagedRuntime, shouldBlockOpsPageInCurrentRuntime } from "../src/lib/ops/pageAccess";

describe("ops page access", () => {
  it("treats packaged mode as allowed in production", () => {
    expect(isPackagedRuntime({
      PLANNING_PACKAGED_MODE: "1",
    } as NodeJS.ProcessEnv)).toBe(true);

    expect(shouldBlockOpsPageInCurrentRuntime({
      NODE_ENV: "production",
      PLANNING_PACKAGED_MODE: "1",
    } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("blocks non-packaged production", () => {
    expect(shouldBlockOpsPageInCurrentRuntime({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv)).toBe(true);
  });
});

