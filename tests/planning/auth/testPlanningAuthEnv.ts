import { afterEach, beforeEach } from "vitest";

const env = process.env as Record<string, string | undefined>;

export function installPlanningAuthRequiredFalseForTest(): void {
  const originalPlanningAuthRequired = process.env.PLANNING_AUTH_REQUIRED;

  beforeEach(() => {
    env.PLANNING_AUTH_REQUIRED = "0";
  });

  afterEach(() => {
    if (typeof originalPlanningAuthRequired === "string") env.PLANNING_AUTH_REQUIRED = originalPlanningAuthRequired;
    else delete env.PLANNING_AUTH_REQUIRED;
  });
}
