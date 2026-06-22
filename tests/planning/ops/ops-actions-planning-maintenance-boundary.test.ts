import fs from "node:fs";
import { describe, expect, it } from "vitest";

const REGISTRY_FILE = "src/lib/ops/actions/registry.ts";
const MAINTENANCE_HELPER_IMPORT = "../../planning/server/ops/planningMaintenanceActions";
const FORBIDDEN_REGISTRY_PATTERNS = [
  "../../planning/migrations/manager",
  "../../planning/storage/consistency",
  "checkPlanningStorageConsistency(",
  "inspectPlanningMigrations(",
  "repairRunIndexConsistency(",
  "runPlanningMigrations(",
] as const;

describe("ops actions planning maintenance boundary", () => {
  it("keeps planning repair and migration execution behind the planning maintenance helper", () => {
    const source = fs.readFileSync(REGISTRY_FILE, "utf8");
    const violations = FORBIDDEN_REGISTRY_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${REGISTRY_FILE}:${pattern}`);

    expect(source).toContain(MAINTENANCE_HELPER_IMPORT);
    expect(violations).toEqual([]);
  });
});
