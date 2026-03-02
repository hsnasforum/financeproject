import { NextResponse } from "next/server";
import { listFeedback } from "@/lib/feedback/feedbackStore";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      data: listFeedback(20),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
