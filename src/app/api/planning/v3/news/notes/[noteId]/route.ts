import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  deleteNewsNote,
  updateNewsNote,
} from "@/lib/planning/v3/news/notes";

const UpdateBodySchema = z.object({
  csrf: z.string().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
}).refine((value) => value.tags !== undefined || value.note !== undefined, {
  message: "at least one field required",
});

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

function noteIdFromParams(params: { noteId?: string | string[] }): string | null {
  const raw = Array.isArray(params.noteId) ? params.noteId[0] : params.noteId;
  const noteId = typeof raw === "string" ? raw.trim() : "";
  if (!noteId) return null;
  return noteId;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const parsedBody = UpdateBodySchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "메모 수정 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const params = await context.params;
  const noteId = noteIdFromParams(params);
  if (!noteId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "noteId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const updated = updateNewsNote(noteId, {
      tags: parsedBody.data.tags,
      note: parsedBody.data.note,
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "메모를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: updated,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "메모 수정 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const params = await context.params;
  const noteId = noteIdFromParams(params);
  if (!noteId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "noteId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const deleted = deleteNewsNote(noteId);
    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "메모를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "메모 삭제 요청이 올바르지 않습니다." } },
      { status: 400 },
    );
  }
}
