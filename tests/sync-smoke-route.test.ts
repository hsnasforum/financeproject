import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/sync/smoke/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAllowLocalSync = process.env.ALLOW_LOCAL_SYNC;

describe("sync smoke HTTP boundary", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    delete env.ALLOW_LOCAL_SYNC;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalAllowLocalSync === "string") env.ALLOW_LOCAL_SYNC = originalAllowLocalSync;
    else delete env.ALLOW_LOCAL_SYNC;
  });

  it.each([
    "same-origin browser",
    "missing Origin direct HTTP",
    "forged dev cookies",
  ])("rejects %s without starting a process", async () => {
    env.ALLOW_LOCAL_SYNC = "1";
    const response = await POST();
    const payload = await response.json() as { ok?: boolean; error?: { code?: string; hint?: string } };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("OPERATOR_COMMAND_REQUIRED");
    expect(payload.error?.hint).toContain("pnpm live:smoke");
  });

  it("returns 404 in production without exposing the operator command", async () => {
    env.NODE_ENV = "production";
    env.ALLOW_LOCAL_SYNC = "1";
    const response = await POST();
    const payload = await response.json() as { error?: { code?: string; hint?: string } };

    expect(response.status).toBe(404);
    expect(payload.error?.code).toBe("NOT_FOUND");
    expect(payload.error?.hint).toBeUndefined();
  });

  it("contains no child-process execution and has no browser caller", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/sync/smoke/route.ts"),
      "utf8",
    );
    const componentSources = [
      "src/components/DebugUnifiedClient.tsx",
      "src/components/data/DataFreshnessBanner.tsx",
    ].map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");

    expect(routeSource).not.toContain("node:child_process");
    expect(routeSource).not.toMatch(/\bspawn\s*\(/);
    expect(componentSources).not.toContain("/api/sync/smoke");
  });
});
