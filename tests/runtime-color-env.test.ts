import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { sanitizeInheritedColorEnv, sanitizePlaywrightColorEnv } from "../scripts/runtime_color_env.mjs";

describe("runtime color env sanitizer", () => {
  it("drops FORCE_COLOR when NO_COLOR is already set", () => {
    const sanitized = sanitizeInheritedColorEnv({
      NO_COLOR: "1",
      FORCE_COLOR: "1",
      DEBUG: "pw:webserver",
    });

    expect(sanitized.NO_COLOR).toBe("1");
    expect(sanitized.FORCE_COLOR).toBeUndefined();
    expect(sanitized.DEBUG).toBe("pw:webserver");
  });

  it("keeps FORCE_COLOR when NO_COLOR is empty or missing", () => {
    expect(sanitizeInheritedColorEnv({
      FORCE_COLOR: "1",
    }).FORCE_COLOR).toBe("1");

    expect(sanitizeInheritedColorEnv({
      NO_COLOR: "   ",
      FORCE_COLOR: "1",
    }).FORCE_COLOR).toBe("1");
  });

  it("drops NO_COLOR on playwright-owned envs", () => {
    const sanitized = sanitizePlaywrightColorEnv({
      NO_COLOR: "1",
      DEBUG: "pw:webserver",
    });

    expect(sanitized.NO_COLOR).toBeUndefined();
    expect(sanitized.DEBUG).toBe("pw:webserver");
  });

  it("prevents node startup warning when sanitized env is used", () => {
    const result = spawnSync(process.execPath, [
      "-e",
      "console.log(JSON.stringify({NO_COLOR:process.env.NO_COLOR||'', FORCE_COLOR:process.env.FORCE_COLOR||''}))",
    ], {
      env: sanitizeInheritedColorEnv({
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "1",
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("NO_COLOR");
    expect(result.stdout.trim()).toBe("{\"NO_COLOR\":\"1\",\"FORCE_COLOR\":\"\"}");
  });

  it("prevents node startup warning on playwright env path", () => {
    const result = spawnSync(process.execPath, [
      "-e",
      "console.log(JSON.stringify({NO_COLOR:process.env.NO_COLOR||'', FORCE_COLOR:process.env.FORCE_COLOR||''}))",
    ], {
      env: sanitizePlaywrightColorEnv({
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "1",
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("NO_COLOR");
    expect(result.stdout.trim()).toBe("{\"NO_COLOR\":\"\",\"FORCE_COLOR\":\"1\"}");
  });
});
