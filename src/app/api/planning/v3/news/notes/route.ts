import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  createNewsNote,
  listNewsNotes,
} from "@/lib/planning/v3/news/notes";

const CreateBodySchema = z.object({
  csrf: z.string().optional(),
  targetType: z.enum(["item", "topic", "scenario"]),
  targetId: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  note: z.string().trim().min(1).max(2000),
});

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

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");

  const notes = listNewsNotes({
    targetType: targetType === "item" || targetType === "topic" || targetType === "scenario" ? targetType : undefined,
    targetId: typeof targetId === "string" && targetId.trim() ? targetId.trim() : undefined,
  });

  return NextResponse.json({
    ok: true,
    data: {
      notes,
      total: notes.length,
    },
  });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const parsed = CreateBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "메모 입력 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const created = createNewsNote({
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    tags: parsed.data.tags,
    note: parsed.data.note,
  });

  return NextResponse.json({
    ok: true,
    data: created,
  });
}
