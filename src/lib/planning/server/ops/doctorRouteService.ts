import { type DoctorCheck, summarizeDoctorChecks } from "@/lib/ops/doctorChecks";
import { buildDoctorIssues, sortDoctorIssues } from "@/lib/ops/doctorIssues";
import { buildMigrationDoctorCheck } from "@/lib/ops/doctorMigrationCheck";
import {
  buildAssumptionsFreshnessDoctorCheck,
  buildMetricsDoctorChecks,
  buildRecentSuccessfulRunDoctorCheck,
  buildSchedulerThresholdPolicyDoctorCheck,
  buildScheduledRunFailureDoctorCheck,
} from "@/lib/ops/doctorPolicyChecks";
import { buildExternalDataQualityDoctorChecks, runExternalDataQualityChecks } from "@/lib/ops/dataQuality";
import { type OpsActionRunStatus } from "@/lib/ops/actions/types";
import { readRecent as readOpsMetricEvents } from "@/lib/ops/metrics/metricsStore";
import { appendOpsMetricEvent } from "@/lib/ops/metricsLog";
import { loadOpsPolicy } from "@/lib/ops/opsPolicy";
import { inspectOpsSchedulerThresholdPolicy } from "@/lib/ops/scheduler/policy";
import { planningUserMeta, type PlanningRouteUser } from "@/lib/planning/api/routeAuth";
import { loadLatestAssumptionsSnapshot } from "@/lib/planning/server/assumptions/storage";
import { listCurrentUserProfiles } from "@/lib/planning/server/profiles/repository";
import {
  createCurrentUserRun,
  getCurrentUserRun,
  hardDeleteCurrentUserRun,
  listCurrentUserRuns,
} from "@/lib/planning/server/runs/repository";
import {
  inspectPlanningMigrations,
  runPlanningMigrationsOnStartup,
} from "@/lib/planning/migrations/manager";
import {
  checkPlanningStorageConsistency,
  recoverPlanningStorageTransactions,
} from "@/lib/planning/storage/consistency";
import {
  runPlanningMaintenanceMigrationsAction,
  runPlanningOrphanBlobCleanupAction,
  runPlanningRepairIndexAction,
} from "@/lib/planning/server/ops/planningMaintenanceActions";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import { loadCanonicalProfile } from "@/lib/planning/v2/loadCanonicalProfile";

export type OpsDoctorAction =
  | "REPAIR_INDEX"
  | "CLEANUP_ORPHAN_BLOBS"
  | "RUN_MIGRATIONS";

export type OpsDoctorActionRunResult =
  | { ok: true; status: OpsActionRunStatus; message?: string; data: Record<string, unknown> }
  | { ok: false; status: "FAILED"; message: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function doctorRouteMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  return {
    ...planningUserMeta(currentUser),
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

function doctorMetricMeta(currentUser: PlanningRouteUser): Record<string, unknown> {
  const userMeta = planningUserMeta(currentUser);
  return {
    planningUserId: userMeta.userId,
    authSource: userMeta.authSource,
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}

export function normalizeOpsDoctorAction(value: unknown): OpsDoctorAction | null {
  const action = asString(value).toUpperCase();
  if (action === "REPAIR_INDEX" || action === "CLEANUP_ORPHAN_BLOBS" || action === "RUN_MIGRATIONS") {
    return action;
  }
  return null;
}

async function checkAssumptions(): Promise<DoctorCheck> {
  const policy = loadOpsPolicy();
  const latest = await loadLatestAssumptionsSnapshot();
  return buildAssumptionsFreshnessDoctorCheck({
    snapshot: latest,
    staleCautionDays: policy.assumptions.staleCautionDays,
    staleRiskDays: policy.assumptions.staleRiskDays,
  });
}

async function checkRecentSuccessfulRun(): Promise<DoctorCheck> {
  const policy = loadOpsPolicy();
  const runs = await listCurrentUserRuns({ limit: 500 });
  return buildRecentSuccessfulRunDoctorCheck({
    runs,
    successRunWarnDays: policy.doctor.successRunWarnDays,
  });
}

async function checkSchedulerThresholdPolicy(): Promise<DoctorCheck> {
  const inspection = await inspectOpsSchedulerThresholdPolicy();
  return buildSchedulerThresholdPolicyDoctorCheck({
    source: inspection.source,
    valid: inspection.valid,
    exists: inspection.exists,
    path: inspection.path,
    errors: inspection.errors,
    policy: {
      warnConsecutiveFailures: inspection.policy.warnConsecutiveFailures,
      riskConsecutiveFailures: inspection.policy.riskConsecutiveFailures,
    },
  });
}

async function checkMetricsHealth(): Promise<DoctorCheck[]> {
  const policy = loadOpsPolicy();
  try {
    const events = (await readOpsMetricEvents({ limit: 5_000 })).map((event) => ({
      type: event.type,
      at: event.at,
      meta: {
        ...(event.status ? { status: event.status } : {}),
        ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
        ...(event.stage ? { stage: event.stage } : {}),
        ...(event.runId ? { runId: event.runId } : {}),
        ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      },
    }));
    const checks = buildMetricsDoctorChecks({
      events,
      runFailRateWarnPct: policy.metrics.runFailRateWarnPct,
      runFailRateRiskPct: policy.metrics.runFailRateRiskPct,
      simulateLatencyWarnMultiplier: policy.metrics.simulateLatencyWarnMultiplier,
      assumptionsRefreshConsecutiveFailRisk: policy.metrics.assumptionsRefreshConsecutiveFailRisk,
      shortWindowHours: policy.metrics.shortWindowHours,
      longWindowDays: policy.metrics.longWindowDays,
    });
    checks.push(buildScheduledRunFailureDoctorCheck({
      events,
      taskName: "PLANNING_RUN_MONTHLY",
      failureWarnCount: policy.doctor.scheduledRunFailureWarnCount,
      windowDays: policy.doctor.scheduledRunFailureWindowDays,
    }));
    return checks;
  } catch (error) {
    return [{
      id: "metrics-log-read",
      title: "Metrics log read",
      status: "FAIL",
      message: error instanceof Error ? error.message : "metrics 로그를 읽지 못했습니다.",
      fixHref: "/ops/metrics",
    }];
  }
}

async function checkExternalDataQuality(): Promise<DoctorCheck[]> {
  try {
    const report = await runExternalDataQualityChecks({ persist: true });
    return buildExternalDataQualityDoctorChecks(report);
  } catch (error) {
    return [{
      id: "data-quality",
      title: "External data quality",
      status: "FAIL",
      message: error instanceof Error ? error.message : "외부 데이터 품질 검사를 수행하지 못했습니다.",
      fixHref: "/ops",
    }];
  }
}

async function checkProfileValidation(): Promise<DoctorCheck> {
  const profiles = await listCurrentUserProfiles();
  if (profiles.length < 1) {
    return {
      id: "profile-validate",
      title: "Profile load/normalize/validate",
      status: "FAIL",
      message: "검증할 profile이 없습니다.",
      fixHref: "/planning",
    };
  }

  const profile = profiles[0];
  try {
    loadCanonicalProfile(profile.profile);
  } catch (error) {
    const issueMessage = error instanceof Error ? error.message : "unknown profile validation error";
    return {
      id: "profile-validate",
      title: "Profile load/normalize/validate",
      status: "FAIL",
      message: "profile validation 실패",
      fixHref: "/planning",
      details: {
        profileId: profile.id,
        issueMessage,
      },
    };
  }

  return {
    id: "profile-validate",
    title: "Profile load/normalize/validate",
    status: "PASS",
    message: "profile validation 통과",
    fixHref: "/planning",
    details: {
      profileId: profile.id,
    },
  };
}

async function checkRunStore(): Promise<DoctorCheck> {
  const runId = `ops-doctor-${crypto.randomUUID()}`;
  try {
    await createCurrentUserRun({
      id: runId,
      profileId: "ops-doctor",
      title: "ops doctor probe",
      input: {
        horizonMonths: 1,
      },
      meta: {
        snapshot: {
          missing: true,
        },
        health: {
          warningsCodes: [],
          criticalCount: 0,
        },
      },
      outputs: {},
    }, {
      enforceRetention: false,
    });

    const loaded = await getCurrentUserRun(runId);
    if (!loaded) {
      return {
        id: "run-store-rw",
        title: "Run store read/write",
        status: "FAIL",
        message: "create 이후 run read 실패",
        fixHref: "/ops/runs",
      };
    }

    return {
      id: "run-store-rw",
      title: "Run store read/write",
      status: "PASS",
      message: "run store read/write OK",
      fixHref: "/ops/runs",
      details: {
        probeRunId: runId,
      },
    };
  } catch (error) {
    return {
      id: "run-store-rw",
      title: "Run store read/write",
      status: "FAIL",
      message: error instanceof Error ? error.message : "run store 검증 실패",
      fixHref: "/ops/runs",
    };
  } finally {
    try {
      await hardDeleteCurrentUserRun(runId);
    } catch {
      // ignore cleanup failure in doctor probe
    }
  }
}

async function checkStorageConsistency(): Promise<DoctorCheck> {
  const report = await checkPlanningStorageConsistency();
  if (report.summary.fail > 0) {
    return {
      id: "storage-consistency",
      title: "Storage consistency",
      status: "FAIL",
      message: `정합성 오류 ${report.summary.fail}건 (warn ${report.summary.warn}건)`,
      fixHref: "/ops/doctor",
      details: {
        summary: report.summary,
        issues: report.issues.slice(0, 20),
      },
    };
  }
  if (report.summary.warn > 0) {
    return {
      id: "storage-consistency",
      title: "Storage consistency",
      status: "WARN",
      message: `정합성 경고 ${report.summary.warn}건`,
      fixHref: "/ops/doctor",
      details: {
        summary: report.summary,
        issues: report.issues.slice(0, 20),
      },
    };
  }
  return {
    id: "storage-consistency",
    title: "Storage consistency",
    status: "PASS",
    message: "index/blob/envelope 정합성 검증 통과",
    fixHref: "/ops/doctor",
    details: {
      summary: report.summary,
    },
  };
}

async function checkMigrations(): Promise<DoctorCheck> {
  const report = await inspectPlanningMigrations();
  return buildMigrationDoctorCheck(report);
}

function checkRequiredEnvs(): DoctorCheck {
  const policy = loadOpsPolicy();
  const required = policy.doctor.requiredEnvVars;
  const missing = required.filter((key) => asString(process.env[key]).length < 1);
  if (missing.length > 0) {
    return {
      id: "required-envs",
      title: "Required env vars",
      status: "FAIL",
      message: `필수 env 누락: ${missing.join(", ")}`,
      fixHref: "/settings",
      details: {
        required,
        missing,
      },
    };
  }
  return {
    id: "required-envs",
    title: "Required env vars",
    status: "PASS",
    message: "필수 env 존재 확인 완료",
    fixHref: "/settings",
    details: {
      required,
    },
  };
}

export async function runOpsDoctor() {
  const startupMigration = await runPlanningMigrationsOnStartup();
  const recovery = await recoverPlanningStorageTransactions();
  const metricChecks = await checkMetricsHealth();
  const dataQualityChecks = await checkExternalDataQuality();
  const checks: DoctorCheck[] = [
    await checkMigrations(),
    await checkAssumptions(),
    await checkRecentSuccessfulRun(),
    await checkSchedulerThresholdPolicy(),
    ...metricChecks,
    ...dataQualityChecks,
    await checkProfileValidation(),
    await checkRunStore(),
    await checkStorageConsistency(),
    checkRequiredEnvs(),
  ];

  const report = summarizeDoctorChecks(checks);
  const issues = sortDoctorIssues(buildDoctorIssues(report.checks, report.generatedAt));
  const status = report.summary.fail > 0
    ? "RISK"
    : report.summary.warn > 0
      ? "WARN"
      : "OK";

  return {
    schemaVersion: 2,
    data: {
      generatedAt: report.generatedAt,
      summary: report.summary,
      status,
      issues,
    },
    report,
    checks: report.checks,
    issues,
    message: report.ok ? "OPS doctor PASS" : "OPS doctor FAIL/WARN",
    meta: {
      migration: startupMigration,
      recovery,
    },
  };
}

export async function runOpsDoctorAction(
  action: OpsDoctorAction,
  currentUser: PlanningRouteUser,
): Promise<OpsDoctorActionRunResult> {
  const startedAt = Date.now();

  if (action === "REPAIR_INDEX") {
    try {
      const result = await runPlanningRepairIndexAction();
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action,
          status: "SUCCESS",
          durationMs: Math.max(0, Date.now() - startedAt),
          updated: result.entries,
          ...doctorMetricMeta(currentUser),
        },
      }).catch(() => undefined);
      return {
        ok: true,
        status: "SUCCESS",
        message: "index repair 실행 완료",
        data: {
          action,
          ...result,
        },
      };
    } catch (error) {
      await recordDoctorActionFailure(action, currentUser, startedAt);
      return {
        ok: false,
        status: "FAILED",
        message: error instanceof Error ? error.message : "index repair 실패",
      };
    }
  }

  if (action === "CLEANUP_ORPHAN_BLOBS") {
    try {
      const result = await runPlanningOrphanBlobCleanupAction();
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action,
          status: "SUCCESS",
          durationMs: Math.max(0, Date.now() - startedAt),
          updated: result.removed,
          ...doctorMetricMeta(currentUser),
        },
      }).catch(() => undefined);
      return {
        ok: true,
        status: "SUCCESS",
        message: "orphan blob cleanup 실행 완료",
        data: {
          action,
          ...result,
        },
      };
    } catch (error) {
      await recordDoctorActionFailure(action, currentUser, startedAt);
      return {
        ok: false,
        status: "FAILED",
        message: error instanceof Error ? error.message : "orphan blob cleanup 실패",
      };
    }
  }

  try {
    const result = await runPlanningMaintenanceMigrationsAction();
    const message = `migrations 실행 결과: ${result.result} (applied=${result.summary.applied}, pending=${result.summary.pending}, deferred=${result.summary.deferred}, failed=${result.summary.failed})`;
    const status = result.result === "failed"
      ? "FAILED"
      : result.result === "partial"
        ? "PARTIAL_SUCCESS"
        : "SUCCESS";
    await appendOpsMetricEvent({
      type: "MIGRATION_ACTION",
      meta: {
        action,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        applied: result.summary.applied,
        pending: result.summary.pending,
        deferred: result.summary.deferred,
        failed: result.summary.failed,
        ...doctorMetricMeta(currentUser),
      },
    }).catch(() => undefined);
    if (result.result === "failed") {
      return {
        ok: false,
        status: "FAILED",
        message,
      };
    }
    return {
      ok: true,
      status,
      message,
      data: {
        action,
        ...result,
      },
    };
  } catch (error) {
    await recordDoctorActionFailure(action, currentUser, startedAt);
    return {
      ok: false,
      status: "FAILED",
      message: error instanceof Error ? error.message : "migration 실행 실패",
    };
  }
}

async function recordDoctorActionFailure(
  action: OpsDoctorAction,
  currentUser: PlanningRouteUser,
  startedAt: number,
): Promise<void> {
  await appendOpsMetricEvent({
    type: "MIGRATION_ACTION",
    meta: {
      action,
      status: "FAILED",
      durationMs: Math.max(0, Date.now() - startedAt),
      code: "INTERNAL",
      ...doctorMetricMeta(currentUser),
    },
  }).catch(() => undefined);
}
