import { NextResponse } from "next/server";
import { listFeedback } from "@/lib/feedback/feedbackStore";
import { filterAndSearch, type FeedbackQuery } from "@/lib/feedback/feedbackQuery";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;
    const statusRaw = (searchParams.get("status") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();
    const tag = (searchParams.get("tag") ?? "").trim();
    const status = statusRaw === "OPEN" || statusRaw === "DOING" || statusRaw === "DONE" || statusRaw === "ALL"
      ? statusRaw
      : "";

    if (statusRaw && !status) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_STATUS", message: "status는 ALL|OPEN|DOING|DONE 이어야 합니다." } },
        { status: 400 },
      );
    }

    const query: FeedbackQuery = {
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(tag ? { tag } : {}),
    };
    const all = listFeedback(200);
    const filtered = filterAndSearch(all, query);
    const limited = filtered.slice(0, limit);

    return NextResponse.json({
      ok: true,
      data: limited,
      meta: {
        limit,
        total: all.length,
        filtered: filtered.length,
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        ...(tag ? { tag } : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
