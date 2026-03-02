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
import {
  buildAssumptionsFreshnessDoctorCheck,
  buildRecentSuccessfulRunDoctorCheck,
} from "../../../../lib/ops/doctorPolicyChecks";
import { loadOpsPolicy } from "../../../../lib/ops/opsPolicy";
import { loadLatestAssumptionsSnapshot } from "../../../../lib/planning/server/assumptions/storage";
import { listProfiles } from "../../../../lib/planning/server/store/profileStore";
import { createRun, getRun, hardDeleteRun, listRuns } from "../../../../lib/planning/server/store/runStore";
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
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
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
    const checks: DoctorCheck[] = [
      await checkAssumptions(),
      await checkRecentSuccessfulRun(),
      await checkProfileValidation(),
      await checkRunStore(),
      checkRequiredEnvs(),
    ];

    const report = summarizeDoctorChecks(checks);
    return NextResponse.json({
      ok: true,
      data: report,
      checks: report.checks,
      message: report.ok ? "OPS doctor PASS" : "OPS doctor FAIL/WARN",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "doctor 실행 실패" },
      { status: 500 },
    );
  }
}
