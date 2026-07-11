import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runPlanningOwnerDoctor,
  type PlanningOwnerDoctorIssue,
  type PlanningOwnerDoctorReport,
  type PlanningOwnerDoctorSummary,
} from "../../../ops/backup/planningOwnerDoctor";
import {
  PlanningOwnerContractError,
  createPlanningArchiveContext,
  type PlanningArchiveContextInput,
  type ResolvedPlanningDataOwner,
} from "../../../ops/backup/planningOwnerRegistry";

export type DoctorIssue = PlanningOwnerDoctorIssue;
export type CheckSummary = PlanningOwnerDoctorSummary;
export type V3DoctorReport = PlanningOwnerDoctorReport;

export type RunV3DoctorInput = PlanningArchiveContextInput & Readonly<{
  owners?: readonly ResolvedPlanningDataOwner[];
  checkedAt?: string | Date;
}>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCheckedAt(value: string | Date | undefined): string {
  const candidate = value instanceof Date ? value : new Date(asString(value) || Date.now());
  if (!Number.isFinite(candidate.getTime())) return new Date().toISOString();
  return candidate.toISOString();
}

function contractFailureReport(input: RunV3DoctorInput, error: unknown): V3DoctorReport {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const detail = error instanceof PlanningOwnerContractError
    ? error.code
    : error instanceof Error
      ? error.message
      : "OWNER_CONTEXT_INVALID";
  const issue: PlanningOwnerDoctorIssue = Object.freeze({
    level: "error",
    check: "owner.registry",
    path: cwd,
    code: "OWNER_DOCTOR_CONTRACT_MISMATCH",
    message: `owner registry context를 확정할 수 없습니다. (${detail})`,
  });
  return Object.freeze({
    ok: false,
    checkedAt: normalizeCheckedAt(input.checkedAt),
    counts: Object.freeze({ checks: 0, files: 0, errors: 1, warnings: 0 }),
    summaries: Object.freeze([]),
    issues: Object.freeze([issue]),
  });
}

export function runV3Doctor(input: RunV3DoctorInput = {}): V3DoctorReport {
  try {
    const context = createPlanningArchiveContext(input);
    return runPlanningOwnerDoctor({
      context,
      ...(input.owners ? { owners: input.owners } : {}),
      checkedAt: input.checkedAt,
    });
  } catch (error) {
    return contractFailureReport(input, error);
  }
}

function printReport(report: V3DoctorReport): void {
  console.log(`[v3:doctor] ok=${report.ok} checks=${report.counts.checks} files=${report.counts.files} errors=${report.counts.errors} warnings=${report.counts.warnings}`);
  for (const row of report.summaries) {
    console.log(`[v3:doctor] ${row.check}: files=${row.files} errors=${row.errors} warnings=${row.warnings} locations=${row.locations} missing=${row.missingLocations} empty=${row.emptyLocations}`);
  }

  if (report.issues.length > 0) {
    console.log(`[v3:doctor] issues=${report.issues.length}`);
    for (const issue of report.issues) {
      console.log(`[v3:doctor][${issue.level.toUpperCase()}] ${issue.check} ${issue.code} ${issue.path} :: ${issue.message}`);
    }
  }
}

function main(): void {
  const report = runV3Doctor();
  printReport(report);
  if (!report.ok) process.exitCode = 1;
}

const invokedPath = asString(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main();
}
