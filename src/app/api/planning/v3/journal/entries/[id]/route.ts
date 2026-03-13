import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { getJournalEntry, updateJournalEntry } from "@/lib/planning/v3/journal/store";

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function withWriteGuard(request: Request, body: unknown): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, body as { csrf?: unknown } | null, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const params = await context.params;
  const id = asString(params.id);
  const entry = getJournalEntry(id);
  if (!entry) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "저널 엔트리를 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, entry });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const params = await context.params;
  const id = asString(params.id);
  try {
    const payload = body as { entry?: unknown } | null;
    const entry = updateJournalEntry(id, payload?.entry ?? {});
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "저널 엔트리를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "저널 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}
