import fs from "node:fs";
import { describe, expect, it } from "vitest";

const SERVICE_EXPECTATIONS = [
  {
    file: "src/lib/planning/server/security/opsSecurityConfigureRouteService.ts",
    mutationCall: "configureVaultPassphrase(",
  },
  {
    file: "src/lib/planning/server/security/opsSecurityLockRouteService.ts",
    mutationCall: "unlockVault(",
  },
  {
    file: "src/lib/planning/server/security/opsSecurityChangePassphraseRouteService.ts",
    mutationCall: "changeVaultPassphrase(",
  },
  {
    file: "src/lib/planning/server/security/opsSecurityResetRouteService.ts",
    mutationCall: "resetVaultAndPlanningData(",
  },
] as const;

describe("ops security startup migration cache boundary", () => {
  it("invalidates startup migration cache after vault mutations that can unblock migrations", () => {
    const violations = SERVICE_EXPECTATIONS.flatMap(({ file, mutationCall }) => {
      const source = fs.readFileSync(file, "utf8");
      const mutationIndex = source.indexOf(mutationCall);
      const invalidationIndex = source.indexOf("invalidatePlanningStartupMigrationCache(");

      expect(source).toContain("invalidatePlanningStartupMigrationCache");
      expect(mutationIndex).toBeGreaterThanOrEqual(0);

      if (invalidationIndex <= mutationIndex) {
        return [`${file}:invalidatePlanningStartupMigrationCache should run after ${mutationCall}`];
      }
      return [];
    });

    expect(violations).toEqual([]);
  });
});
