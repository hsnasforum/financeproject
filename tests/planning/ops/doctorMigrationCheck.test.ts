import { describe, expect, it } from "vitest";
import { buildMigrationDoctorCheck } from "../../../src/lib/ops/doctorMigrationCheck";
import { type PlanningMigrationReport } from "../../../src/lib/planning/migrations/manager";

function buildReport(partial: Partial<PlanningMigrationReport["summary"]>): PlanningMigrationReport {
  return {
    generatedAt: "2026-03-02T00:00:00.000Z",
    statePath: ".data/planning/migrations/migrationState.json",
    summary: {
      applied: partial.applied ?? 0,
      pending: partial.pending ?? 0,
      deferred: partial.deferred ?? 0,
      failed: partial.failed ?? 0,
    },
    items: [],
  };
}

describe("buildMigrationDoctorCheck", () => {
  it("returns FAIL when failed migrations exist", () => {
    const check = buildMigrationDoctorCheck(buildReport({ failed: 2 }));
    expect(check.status).toBe("FAIL");
    expect(check.message).toContain("실패 2건");
    expect(check.fixHref).toBe("/ops/doctor");
  });

  it("returns WARN and ops/doctor link when pending only", () => {
    const check = buildMigrationDoctorCheck(buildReport({ pending: 3 }));
    expect(check.status).toBe("WARN");
    expect(check.message).toContain("대기 3건");
    expect(check.fixHref).toBe("/ops/doctor");
  });

  it("returns WARN and ops/security link when deferred exists", () => {
    const check = buildMigrationDoctorCheck(buildReport({ deferred: 1 }));
    expect(check.status).toBe("WARN");
    expect(check.fixHref).toBe("/ops/security");
  });

  it("returns PASS when no pending/deferred/failed migrations", () => {
    const check = buildMigrationDoctorCheck(buildReport({ applied: 5 }));
    expect(check.status).toBe("PASS");
    expect(check.message).toContain("없습니다");
  });
});
