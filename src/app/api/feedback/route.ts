import { NextResponse } from "next/server";
import { addFeedback, type FeedbackCategory } from "@/lib/feedback/feedbackStore";
import {
  buildDiagnosticsSnapshot,
  normalizeDiagnosticsSnapshot,
  parseDiagnosticsPageInfoFromRequest,
} from "@/lib/diagnostics/snapshot";

type FeedbackRequestBody = {
  category?: unknown;
  message?: unknown;
  snapshot?: unknown;
};

const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "improve", "question"];
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? process.env.npm_package_version ?? null;

function toHeaderString(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidCategory(value: string): value is FeedbackCategory {
  return VALID_CATEGORIES.includes(value as FeedbackCategory);
}

export async function POST(request: Request) {
  let body: FeedbackRequestBody;
  try {
    body = (await request.json()) as FeedbackRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "JSON body 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const categoryText = typeof body.category === "string" ? body.category.trim() : "";
  if (!isValidCategory(categoryText)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_CATEGORY", message: "category는 bug|improve|question 이어야 합니다." } },
      { status: 400 },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 5 || message.length > 2000) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_MESSAGE", message: "message는 5~2000자여야 합니다." } },
      { status: 400 },
    );
  }

  try {
    const pageInfo = parseDiagnosticsPageInfoFromRequest(request);
    const snapshot = normalizeDiagnosticsSnapshot(body.snapshot) ?? buildDiagnosticsSnapshot({ req: request, pageInfo });
    addFeedback({
      category: categoryText,
      message,
      traceId: toHeaderString(request.headers.get("x-trace-id")),
      userAgent: toHeaderString(request.headers.get("user-agent")),
      url: toHeaderString(request.headers.get("referer")),
      appVersion: toHeaderString(APP_VERSION),
      snapshot,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
