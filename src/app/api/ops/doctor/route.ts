import { NextResponse } from "next/server";
import {
  requireCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../lib/dev/onlyDev";
import { type DoctorCheck, summarizeDoctorChecks } from "../../../../lib/ops/doctorChecks";
import { buildDoctorIssues, sortDoctorIssues } from "../../../../lib/ops/doctorIssues";
import { opsErrorResponse } from "../../../../lib/ops/errorContract";
import { buildMigrationDoctorCheck } from "../../../../lib/ops/doctorMigrationCheck";
import {
  buildAssumptionsFreshnessDoctorCheck,
  buildMetricsDoctorChecks,
  buildRecentSuccessfulRunDoctorCheck,
  buildScheduledRunFailureDoctorCheck,
} from "../../../../lib/ops/doctorPolicyChecks";
import { readRecent as readOpsMetricEvents } from "../../../../lib/ops/metrics/metricsStore";
import { appendOpsMetricEvent } from "../../../../lib/ops/metricsLog";
import { loadOpsPolicy } from "../../../../lib/ops/opsPolicy";
import { buildExternalDataQualityDoctorChecks, runExternalDataQualityChecks } from "../../../../lib/ops/dataQuality";
import { checkPlanningV3TransactionStore } from "../../../../lib/ops/doctorChecks/planningV3Transactions";
import { loadLatestAssumptionsSnapshot } from "../../../../lib/planning/server/assumptions/storage";
import { listProfiles } from "../../../../lib/planning/server/store/profileStore";
import { createRun, getRun, hardDeleteRun, listRuns } from "../../../../lib/planning/server/store/runStore";
import {
  checkPlanningStorageConsistency,
  cleanupOrphanRunBlobs,
  recoverPlanningStorageTransactions,
  repairRunIndexConsistency,
} from "../../../../lib/planning/storage/consistency";
import {
  inspectPlanningMigrations,
  runPlanningMigrations,
  runPlanningMigrationsOnStartup,
} from "../../../../lib/planning/migrations/manager";
import { loadCanonicalProfile } from "../../../../lib/planning/v2/loadCanonicalProfile";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    requireCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return opsErrorResponse({
        code: "INTERNAL",
        message: "요청 검증 중 오류가 발생했습니다.",
        status: 500,
      });
    }
    return opsErrorResponse({
      code: guard.code,
      message: guard.message,
      status: guard.status,
    });
  }
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
  const runs = await listRuns({ limit: 500 });
  return buildRecentSuccessfulRunDoctorCheck({
    runs,
    successRunWarnDays: policy.doctor.successRunWarnDays,
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
  const profiles = await listProfiles();
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
    await createRun({
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

    const loaded = await getRun(runId);
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
      await hardDeleteRun(runId);
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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const csrf = asString(searchParams.get("csrf"));
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  try {
    const startupMigration = await runPlanningMigrationsOnStartup();
    const recovery = await recoverPlanningStorageTransactions();
    const metricChecks = await checkMetricsHealth();
    const dataQualityChecks = await checkExternalDataQuality();
    const planningV3TxChecks = await checkPlanningV3TransactionStore();
    const checks: DoctorCheck[] = [
      await checkMigrations(),
      await checkAssumptions(),
      await checkRecentSuccessfulRun(),
      ...metricChecks,
      ...dataQualityChecks,
      ...planningV3TxChecks,
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
    return NextResponse.json({
      ok: true,
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
    });
  } catch (error) {
    return opsErrorResponse({
      code: "STORAGE_CORRUPT",
      message: error instanceof Error ? error.message : "doctor 실행 실패",
      status: 500,
    });
  }
}

type DoctorActionBody = {
  csrf?: unknown;
  action?: unknown;
};

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const body = await request.json().catch(() => null) as DoctorActionBody | null;
  const csrf = asString(body?.csrf);
  const guard = guardRequest(request, csrf);
  if (guard) return guard;

  const action = asString(body?.action).toUpperCase();
  if (action === "REPAIR_INDEX") {
    const startedAt = Date.now();
    try {
      const result = await repairRunIndexConsistency();
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "REPAIR_INDEX",
          status: "SUCCESS",
          durationMs: Math.max(0, Date.now() - startedAt),
          updated: result.entries,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        ok: true,
        data: {
          action: "REPAIR_INDEX",
          ...result,
        },
      });
    } catch (error) {
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "REPAIR_INDEX",
          status: "FAILED",
          durationMs: Math.max(0, Date.now() - startedAt),
          code: "INTERNAL",
        },
      }).catch(() => undefined);
      return opsErrorResponse({
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "index repair 실패",
        status: 500,
      });
    }
  }
  if (action === "CLEANUP_ORPHAN_BLOBS") {
    const startedAt = Date.now();
    try {
      const result = await cleanupOrphanRunBlobs();
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "CLEANUP_ORPHAN_BLOBS",
          status: "SUCCESS",
          durationMs: Math.max(0, Date.now() - startedAt),
          updated: result.removed,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        ok: true,
        data: {
          action: "CLEANUP_ORPHAN_BLOBS",
          ...result,
        },
      });
    } catch (error) {
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "CLEANUP_ORPHAN_BLOBS",
          status: "FAILED",
          durationMs: Math.max(0, Date.now() - startedAt),
          code: "INTERNAL",
        },
      }).catch(() => undefined);
      return opsErrorResponse({
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "orphan blob cleanup 실패",
        status: 500,
      });
    }
  }
  if (action === "RUN_MIGRATIONS") {
    const startedAt = Date.now();
    try {
      const result = await runPlanningMigrations({ trigger: "ops" });
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "RUN_MIGRATIONS",
          status: result.result === "failed" ? "FAILED" : "SUCCESS",
          durationMs: Math.max(0, Date.now() - startedAt),
          applied: result.summary.applied,
          pending: result.summary.pending,
          deferred: result.summary.deferred,
          failed: result.summary.failed,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        ok: true,
        data: {
          action: "RUN_MIGRATIONS",
          ...result,
        },
      });
    } catch (error) {
      await appendOpsMetricEvent({
        type: "MIGRATION_ACTION",
        meta: {
          action: "RUN_MIGRATIONS",
          status: "FAILED",
          durationMs: Math.max(0, Date.now() - startedAt),
          code: "INTERNAL",
        },
      }).catch(() => undefined);
      return opsErrorResponse({
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "migration 실행 실패",
        status: 500,
      });
    }
  }

  return opsErrorResponse({
    code: "VALIDATION",
    message: "지원하지 않는 doctor action 입니다.",
    status: 400,
    fixHref: "/ops/doctor",
  });
}
