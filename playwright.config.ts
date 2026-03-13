import path from "node:path";
import { defineConfig } from "@playwright/test";
import { sanitizePlaywrightColorEnv } from "./scripts/runtime_color_env.mjs";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3126;
const configuredBaseUrl = (
  process.env.BASE_URL
  || process.env.E2E_BASE_URL
  || process.env.PLANNING_BASE_URL
  || ""
).trim().replace(/\/+$/, "");
const externalBaseUrl = (process.env.E2E_EXTERNAL_BASE_URL || "").trim().replace(/\/+$/, "");
const explicitBaseUrl = externalBaseUrl || configuredBaseUrl;
const baseURL = explicitBaseUrl || `http://127.0.0.1:${PORT}`;
const webServerMode = (process.env.E2E_WEB_SERVER_MODE || "development").trim().toLowerCase();
const resolvedWebServerMode = webServerMode === "production" ? "production" : "development";
const headlessFlag = (process.env.PW_HEADLESS || "").trim().toLowerCase();
const resolvedHeadless = headlessFlag
  ? !(headlessFlag === "0" || headlessFlag === "false" || headlessFlag === "no")
  : undefined;
const e2ePlanningRoot = path.join(process.cwd(), ".data", "planning-e2e");
const playwrightDistDir = resolvedWebServerMode === "production"
  ? ".next"
  : (process.env.PLAYWRIGHT_DIST_DIR || `.next-e2e-${PORT}`).trim();
const playwrightTsconfigPath = (process.env.PLAYWRIGHT_TSCONFIG_PATH || "tsconfig.playwright.json").trim();
const playwrightDevHost = (process.env.PLAYWRIGHT_DEV_HOST || "0.0.0.0").trim();
const playwrightDevCommand = playwrightDevHost
  ? `node scripts/next_dev_safe.mjs --webpack --host ${playwrightDevHost} --port ${PORT} --strict-port`
  : `node scripts/next_dev_safe.mjs --webpack --port ${PORT} --strict-port`;

function parseOptionalBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

const reuseExistingServer = parseOptionalBoolean(
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER,
  resolvedWebServerMode === "development" ? !process.env.CI : false,
);

function buildWebServerEnv(): Record<string, string> {
  const sanitized = sanitizePlaywrightColorEnv({
    ...process.env,
    FINLIFE_REPLAY: "1",
    DART_E2E_FIXTURE: process.env.DART_E2E_FIXTURE ?? "1",
    DART_CORPCODES_INDEX_PATH: process.env.DART_CORPCODES_INDEX_PATH ?? "tests/fixtures/dart/corpCodes.index.sample.json",
    NEXT_TELEMETRY_DISABLED: "1",
    PLAYWRIGHT_DIST_DIR: playwrightDistDir,
    ...(resolvedWebServerMode === "development" ? { PLAYWRIGHT_TSCONFIG_PATH: playwrightTsconfigPath } : {}),
    DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
    PLANNING_E2E_SKIP_MIGRATION_GATE: process.env.PLANNING_E2E_SKIP_MIGRATION_GATE || "1",
    PLANNING_DATA_DIR: process.env.PLANNING_DATA_DIR || e2ePlanningRoot,
    PLANNING_PROFILES_DIR: process.env.PLANNING_PROFILES_DIR || path.join(e2ePlanningRoot, "profiles"),
    PLANNING_RUNS_DIR: process.env.PLANNING_RUNS_DIR || path.join(e2ePlanningRoot, "runs"),
    PLANNING_VAULT_CONFIG_PATH: process.env.PLANNING_VAULT_CONFIG_PATH || path.join(e2ePlanningRoot, "security", "vault.json"),
    PLANNING_MIGRATION_STATE_PATH: process.env.PLANNING_MIGRATION_STATE_PATH || path.join(e2ePlanningRoot, "migrations", "migrationState.json"),
    PLANNING_MIGRATION_SNAPSHOT_DIR: process.env.PLANNING_MIGRATION_SNAPSHOT_DIR || path.join(e2ePlanningRoot, "migrations", "snapshots"),
    HOSTNAME: process.env.HOSTNAME || "127.0.0.1",
    PORT: String(PORT),
  });

  return Object.fromEntries(
    Object.entries(sanitized).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    ...(typeof resolvedHeadless === "boolean" ? { headless: resolvedHeadless } : {}),
    trace: "retain-on-failure",
  },
  ...(explicitBaseUrl
    ? {}
    : {
        webServer: {
          command: resolvedWebServerMode === "production"
            ? `node scripts/next_prod_safe.mjs --port ${PORT}`
            : playwrightDevCommand,
          url: baseURL,
          reuseExistingServer,
          timeout: 120_000,
          stdout: "pipe",
          env: buildWebServerEnv(),
        },
      }),
});
