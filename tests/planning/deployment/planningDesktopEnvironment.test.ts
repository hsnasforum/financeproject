import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlanningDesktopEnvironment } from "../../../scripts/planning_v2_desktop_env.mjs";
import { createPlanningDesktopE2EEnvironment } from "../../../scripts/planning_v2_e2e_isolation.mjs";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-desktop-env-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planning desktop environment", () => {
  it("keeps inherited values ahead of .env.local, env.local, and .env", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, ".env.local"), "DATABASE_URL=file:local.db\nLOCAL_ONLY=local\n", "utf8");
    fs.writeFileSync(path.join(root, "env.local"), "DATABASE_URL=file:legacy.db\nLEGACY_ONLY=legacy\n", "utf8");
    fs.writeFileSync(path.join(root, ".env"), "DATABASE_URL=file:base.db\nBASE_ONLY=base\n", "utf8");
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "file:inherited.db",
    };

    const result = await loadPlanningDesktopEnvironment({ cwd: root, env });

    expect(result.loadedFiles).toEqual([".env.local", "env.local", ".env"]);
    expect(env).toMatchObject({
      DATABASE_URL: "file:inherited.db",
      LOCAL_ONLY: "local",
      LEGACY_ONLY: "legacy",
      BASE_ONLY: "base",
    });
  });

  it("uses the highest-priority file and preserves a quoted SQLite URL with special characters", async () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".env.local"),
      'DATABASE_URL="file:C:/Planning #1/finance%ready $data.db"\n',
      "utf8",
    );
    fs.writeFileSync(path.join(root, "env.local"), "DATABASE_URL=file:legacy.db\n", "utf8");
    fs.writeFileSync(path.join(root, ".env"), "DATABASE_URL=file:base.db\n", "utf8");
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };

    await loadPlanningDesktopEnvironment({ cwd: root, env });

    expect(env.DATABASE_URL).toBe("file:C:/Planning #1/finance%ready $data.db");
  });

  it("can make installation-owned runtime keys authoritative over ambient values", async () => {
    const root = makeRoot();
    fs.writeFileSync(
      path.join(root, ".env.local"),
      "DATABASE_URL=file:./prisma/dev.db\nPLANNING_APP_NAME=InstalledApp\nPLANNING_DATA_DIR=./state/vault\n",
      "utf8",
    );
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "file:../ambient.db",
      PLANNING_APP_NAME: "AmbientApp",
      PLANNING_DATA_DIR: "../ambient/vault",
      UNRELATED_KEY: "preserved",
    };

    await loadPlanningDesktopEnvironment({
      cwd: root,
      env,
      authoritativeKeys: ["DATABASE_URL", "PLANNING_APP_NAME", "PLANNING_DATA_DIR"],
    });

    expect(env).toMatchObject({
      DATABASE_URL: "file:./prisma/dev.db",
      PLANNING_APP_NAME: "InstalledApp",
      PLANNING_DATA_DIR: "./state/vault",
      UNRELATED_KEY: "preserved",
    });
  });

  it("loads desktop env before the launcher prepares its runtime", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts", "planning_v2_desktop_launch.mjs"),
      "utf8",
    );
    const loadIndex = source.indexOf("await loadPlanningDesktopEnvironment");
    const runtimeIndex = source.indexOf("const runtime = await prepareDesktopRuntime()");

    expect(loadIndex).toBeGreaterThan(-1);
    expect(runtimeIndex).toBeGreaterThan(loadIndex);
  });

  it("binds production browser checks to one isolated desktop database and data root", () => {
    const root = makeRoot();
    const planningDataDir = path.join(root, "planning");
    const databaseUrl = `file:${path.join(root, "database", "finance.db")}`;
    const sessionToken = "t".repeat(43);
    const env = createPlanningDesktopE2EEnvironment({ NODE_ENV: "production" }, {
      databaseUrl,
      planningDataDir,
      sessionToken,
    });

    expect(env).toMatchObject({
      PLANNING_E2E_DESKTOP_DATABASE_URL: databaseUrl,
      PLANNING_E2E_DESKTOP_DATA_DIR: planningDataDir,
      PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(root, "runtime", "e2e-bootstrap.url"),
      PLANNING_E2E_DESKTOP_SESSION_TOKEN: sessionToken,
    });
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(() => createPlanningDesktopE2EEnvironment({}, {
      databaseUrl,
      planningDataDir,
      sessionToken: "short",
    })).toThrow("high-entropy base64url token");

    const runnerSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "playwright_with_webserver_debug.mjs"),
      "utf8",
    );
    expect(runnerSource).toContain("createPlanningDesktopE2EEnvironment(env");
    expect(runnerSource).toContain("databaseUrl: smokeDatabase.databaseUrl");
    expect(runnerSource).toContain("planningDataDir: isolated.planningDataDir");
    expect(runnerSource).toContain("sessionToken: env.PLANNING_E2E_DESKTOP_SESSION_TOKEN");

    const prodSmokeSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "planning_v2_prod_smoke.mjs"),
      "utf8",
    );
    expect(prodSmokeSource).toContain("createPlanningDesktopE2EEnvironment({");
    expect(prodSmokeSource).toContain('sessionToken: randomBytes(32).toString("base64url")');
    expect(prodSmokeSource).toContain("delete smokeEnv.DATABASE_URL");
  });
});
