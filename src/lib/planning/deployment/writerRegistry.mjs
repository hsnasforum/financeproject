export const PLANNING_RUNTIME_WRITER_IDS = Object.freeze([
  "runtime.desktop",
  "runtime.http-store",
  "planning:v2:ops:scheduler",
]);

export const PLANNING_MUTATING_PACKAGE_SCRIPTS = Object.freeze([
  "news:refresh",
  "indicators:refresh",
  "v3:refresh-all",
  "v3:trim",
  "v3:migrate",
  "ops:refresh-assumptions",
  "planning:assumptions:sync",
  "planning:run:monthly",
  "planning:v2:seed",
  "planning:v2:backfill-legacy-runs",
  "planning:v2:migrate:apply",
  "planning:v2:ops:run",
  "planning:v2:ops:run:regress",
  "planning:v2:ops:safety",
  "planning:v2:ops:safety:weekly",
  "planning:v2:ops:safety:regress",
  "planning:v2:ops:scheduler:health",
  "planning:v2:ops:prune",
  "daily:refresh",
  "daily:refresh:strict",
  "planning:v2:report",
  "planning:v2:regress",
  "planning:v2:regress:update",
  "planning:v2:regress:report",
  "planning:v2:final-report",
  "planning:v2:record",
  "planning:v2:release:evidence",
  "planning:v2:release",
  "planning:v2:release:local",
  "v3:report:weekly",
  "cleanup",
  "planning:v2:report:samples",
  "planning:v2:openapi",
]);

export const PLANNING_READ_ONLY_PACKAGE_SCRIPTS = Object.freeze([
  "v3:doctor",
  "v3:export",
  "v3:support-bundle",
  "planning:v3:import:csv",
  "planning:v2:migrate",
  "planning:v2:migrate:dry",
]);

export const PLANNING_DISABLED_WRITER_SCRIPTS = Object.freeze([
  "start:raw",
  "v3:restore",
]);

const WRITER_IDS = new Set([
  ...PLANNING_RUNTIME_WRITER_IDS,
  ...PLANNING_MUTATING_PACKAGE_SCRIPTS,
]);

export function isPlanningWriterId(value) {
  return typeof value === "string" && WRITER_IDS.has(value);
}

export function assertPlanningWriterId(value) {
  if (!isPlanningWriterId(value)) {
    throw new Error(`unsupported planning writer entrypoint: ${String(value ?? "")}`);
  }
  return value;
}
