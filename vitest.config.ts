import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    env: {
      PLANNING_AUTH_REQUIRED: process.env.PLANNING_AUTH_REQUIRED ?? "false",
    },
    exclude: [
      ...configDefaults.exclude,
      "tests/e2e/**",
      ".next/**",
      ".next-build*/**",
      "tmp/**",
    ],
  },
});
