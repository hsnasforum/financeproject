import { NextResponse } from "next/server";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { checkPlanningIntegrity } from "@/lib/ops/planningDoctor";

type DoctorBody = {
  csrf?: unknown;
  strict?: unknown;
} | null;

function appendDoctorAudit(input: {
  result: "SUCCESS" | "ERROR";
  strict: boolean;
  missingCount?: number;
  invalidJsonCount?: number;
  optionalMissingCount?: number;
  message?: string;
}): void {
  try {
    appendAuditLog({
      event: "PLANNING_DOCTOR_RUN",
      route: "/api/ops/planning/doctor",
      summary: `PLANNING_DOCTOR_RUN ${input.result}`,
      details: {
        result: input.result,
        strict: input.strict,
        missingCount: input.missingCount ?? null,
        invalidJsonCount: input.invalidJsonCount ?? null,
        optionalMissingCount: input.optionalMissingCount ?? null,
        message: input.message ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning doctor log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DoctorBody = null;
  try {
    body = (await request.json()) as DoctorBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
  }

  const strict = body?.strict === true;
  try {
    const report = await checkPlanningIntegrity({ strict });
    appendDoctorAudit({
      result: report.ok ? "SUCCESS" : "ERROR",
      strict,
      missingCount: report.missing.length,
      invalidJsonCount: report.invalidJson.length,
      optionalMissingCount: report.optionalMissing.length,
    });
    return NextResponse.json({
      ok: true,
      data: report,
      message: report.ok ? "Planning doctor 통과" : "Planning doctor 경고/오류 발견",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planning doctor 실행에 실패했습니다.";
    appendDoctorAudit({
      result: "ERROR",
      strict,
      message,
    });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
