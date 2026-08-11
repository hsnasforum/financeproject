import { NextResponse } from "next/server";
import { listFeedback } from "@/lib/feedback/feedbackStore";
import { toFeedbackAdminRecord } from "@/lib/feedback/feedbackContracts";
import { guardFeedbackManagementAccess } from "../_lib/managementGuard";

export async function GET(request: Request) {
  const accessGuard = guardFeedbackManagementAccess(request);
  if (accessGuard) return accessGuard;

  try {
    return NextResponse.json({
      ok: true,
      data: listFeedback(20).map(toFeedbackAdminRecord),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
