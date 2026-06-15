import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { buildDoctorSummary } from "../../../../../lib/diagnostics/doctorSummary";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
  if (blocked) return blocked;

  try {
    return NextResponse.json({
      ok: true,
      data: buildDoctorSummary(),
    });
  } catch (error) {
    console.error("[dev/doctor/summary] failed to build doctor summary", error);
    return NextResponse.json({
      ok: true,
      data: {
        overall: "FAIL",
        items: [
          {
            id: "doctor-summary-internal",
            code: "DOCTOR_SUMMARY_INTERNAL",
            title: "Doctor Summary",
            status: "FAIL",
            message: "요약 계산 중 내부 오류가 발생했습니다. 로그를 확인하세요.",
            action: {
              label: "재시도",
              command: "pnpm planning:v2:doctor",
            },
          },
        ],
      },
      meta: {
        degraded: true,
        reasonCode: "DOCTOR_SUMMARY_BUILD_FAILED",
      },
    });
  }
}
