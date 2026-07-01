import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "tests/e2e/**",
      ".dist/**",
      ".next/**",
      ".next-build*/**",
      "tmp/**",
    ],
  },
});
