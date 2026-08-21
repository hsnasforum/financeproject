import { NextResponse } from "next/server";
import { addPublicFeedback, type FeedbackCategory } from "@/lib/feedback/feedbackStore";
import { toFeedbackPublicReceipt } from "@/lib/feedback/feedbackContracts";
import { buildDiagnosticsSnapshot } from "@/lib/diagnostics/snapshot";
import { guardFeedbackMutationOrigin } from "./_lib/trustedOriginGuard";

type FeedbackRequestBody = {
  category?: unknown;
  message?: unknown;
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

function buildFeedbackDiagnosticsSnapshot(request: Request) {
  try {
    return buildDiagnosticsSnapshot({
      req: request,
      pageInfo: {
        url: request.url,
        userAgent: request.headers.get("user-agent"),
        localStateSummary: null,
      },
    });
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const originGuard = guardFeedbackMutationOrigin(request);
  if (originGuard) return originGuard;

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
    const snapshot = buildFeedbackDiagnosticsSnapshot(request);
    addPublicFeedback({
      category: categoryText,
      message,
      traceId: toHeaderString(request.headers.get("x-trace-id")),
      userAgent: toHeaderString(request.headers.get("user-agent")),
      url: toHeaderString(request.headers.get("referer")),
      appVersion: toHeaderString(APP_VERSION),
      ...(snapshot ? { snapshot } : {}),
    });
    return NextResponse.json(toFeedbackPublicReceipt());
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "STORE_FAILED", message: "피드백 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
