import { type DoctorCheck } from "./doctorChecks";
import { type PlanningMigrationReport } from "../planning/migrations/manager";

export function buildMigrationDoctorCheck(report: PlanningMigrationReport): DoctorCheck {
  if (report.summary.failed > 0) {
    return {
      id: "migrations",
      title: "Migrations",
      status: "FAIL",
      message: `마이그레이션 실패 ${report.summary.failed}건`,
      fixHref: "/ops/doctor",
      details: {
        summary: report.summary,
        statePath: report.statePath,
        items: report.items,
      },
    };
  }
  if (report.summary.pending > 0 || report.summary.deferred > 0) {
    return {
      id: "migrations",
      title: "Migrations",
      status: "WARN",
      message: `대기 ${report.summary.pending}건, 지연 ${report.summary.deferred}건`,
      fixHref: report.summary.deferred > 0 ? "/ops/security" : "/ops/doctor",
      details: {
        summary: report.summary,
        statePath: report.statePath,
        items: report.items,
      },
    };
  }
  return {
    id: "migrations",
    title: "Migrations",
    status: "PASS",
    message: "적용 필요한 마이그레이션이 없습니다.",
    fixHref: "/ops/doctor",
    details: {
      summary: report.summary,
      statePath: report.statePath,
    },
  };
}
