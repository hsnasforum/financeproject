import { defineConfig } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
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
    },
  },
});
