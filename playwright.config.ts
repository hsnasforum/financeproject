import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3100;
const configuredBaseUrl = (
  process.env.BASE_URL
  || process.env.E2E_BASE_URL
  || process.env.PLANNING_BASE_URL
  || ""
).trim().replace(/\/+$/, "");
const externalBaseUrl = (process.env.E2E_EXTERNAL_BASE_URL || "").trim().replace(/\/+$/, "");
const baseURL = configuredBaseUrl || `http://127.0.0.1:${PORT}`;
const headlessFlag = (process.env.PW_HEADLESS || "").trim().toLowerCase();
const resolvedHeadless = headlessFlag
  ? !(headlessFlag === "0" || headlessFlag === "false" || headlessFlag === "no")
  : undefined;
const e2ePlanningRoot = path.join(process.cwd(), ".data", "planning-e2e");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    ...(typeof resolvedHeadless === "boolean" ? { headless: resolvedHeadless } : {}),
    trace: "retain-on-failure",
  },
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: `pnpm dev --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            FINLIFE_REPLAY: "1",
            DART_E2E_FIXTURE: process.env.DART_E2E_FIXTURE ?? "1",
            DART_CORPCODES_INDEX_PATH: process.env.DART_CORPCODES_INDEX_PATH ?? "tests/fixtures/dart/corpCodes.index.sample.json",
            NEXT_TELEMETRY_DISABLED: "1",
            DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
            PLANNING_E2E_SKIP_MIGRATION_GATE: process.env.PLANNING_E2E_SKIP_MIGRATION_GATE || "1",
            PLANNING_DATA_DIR: process.env.PLANNING_DATA_DIR || e2ePlanningRoot,
            PLANNING_PROFILES_DIR: process.env.PLANNING_PROFILES_DIR || path.join(e2ePlanningRoot, "profiles"),
            PLANNING_RUNS_DIR: process.env.PLANNING_RUNS_DIR || path.join(e2ePlanningRoot, "runs"),
            PLANNING_VAULT_CONFIG_PATH: process.env.PLANNING_VAULT_CONFIG_PATH || path.join(e2ePlanningRoot, "security", "vault.json"),
            PLANNING_MIGRATION_STATE_PATH: process.env.PLANNING_MIGRATION_STATE_PATH || path.join(e2ePlanningRoot, "migrations", "migrationState.json"),
            PLANNING_MIGRATION_SNAPSHOT_DIR: process.env.PLANNING_MIGRATION_SNAPSHOT_DIR || path.join(e2ePlanningRoot, "migrations", "snapshots"),
          },
        },
      }),
});
