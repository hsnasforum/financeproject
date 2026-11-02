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
      // Local evidence copies of the repository (git-ignored), not canonical tests.
      ".claude/worktrees/**",
      "work/local/*/baseline-source/**",
      "work/local/*/evidence/**",
      // Proof files copied out of tests/; their ./helpers and ../src imports only resolve there.
      "work/local/finance-financial-data-contract-20261011/exim-runtime-proof.spec.ts",
      "work/local/finance-finlife-integrity-20261011/finlife-runtime-proof.spec.ts",
      "work/local/finance-finlife-migration-20261011/finlife-sqlite-identity-snapshot-replay.test.ts",
    ],
  },
});
