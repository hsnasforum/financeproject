import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAppInfo } from "../../../../src/lib/planning/server/runtime/appInfo";

const originalEnv = { ...process.env };

describe("getAppInfo", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  });

  it("returns version, dataDir and host policy", async () => {
    process.env.APP_VERSION = "1.2.3-test";
    process.env.PLANNING_DATA_DIR = ".tmp/planning-test-data";

    const info = await getAppInfo({ cwd: "/workspace/app" });
    expect(info.appVersion).toBe("1.2.3-test");
    expect(info.engineVersion).toBe("1.2.3-test");
    expect(info.hostPolicy).toBe("127.0.0.1");
    expect(info.dataDir).toBe(path.resolve("/workspace/app", ".tmp/planning-test-data"));
  });

  it("does not expose obvious secret markers", async () => {
    const info = await getAppInfo({ cwd: "/workspace/app" });
    const text = JSON.stringify(info).toLowerCase();
    expect(text.includes("process.env")).toBe(false);
    expect(text.includes("token")).toBe(false);
    expect(text.includes("secret")).toBe(false);
  });
});
